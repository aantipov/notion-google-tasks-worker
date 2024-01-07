import { drizzle } from 'drizzle-orm/d1';
import { and, isNotNull, lte } from 'drizzle-orm';
import { users } from '@/schema';
import { syncUser } from './helpers/sync.js';
import sendSetupCompletionPrompt from './sendSetupCompletionPrompt.js';
const BATCH_SIZE = 100; // CF limit

const handler: ExportedHandler<Env, string> = {
	/**
	 * CRON job: fetch users from DB and send them to the Queue
	 * It fetches users with  successfully established sync (lastSynced is not null)
	 * who have been synced more than 5 minutes ago and
	 */
	async scheduled(event, env, ctx) {
		console.log('CRON job started', event.cron);
		switch (event.cron) {
			case '* * * * *':
				ctx.waitUntil(handleScheduledSync(env));
				break;
			case '0 8 * * *': // Every day at 8:00 AM
				ctx.waitUntil(sendSetupCompletionPrompt(env));
				break;
		}
		console.log('CRON job finished');
	},

	/**
	 * Consumer: process messages (emails) from the queue feeded by the scheduled task
	 * Sync user's Google Tasks with Notion.
	 */
	async queue(batch, env, ctx) {
		// There is only one message in the batch because we set "max_batch_size" to 1 in the wrangler.toml config
		ctx.waitUntil(handleQueue(batch.messages[0].body, env));
	},
};

export default handler;

async function handleScheduledSync(env: Env): Promise<void> {
	const db = drizzle(env.DB, { logger: true });
	const fiveMinAgo = new Date(Date.now() - 5 * 60 * 1000);
	let usersData: { email: string }[];

	try {
		usersData = await db
			.select({ email: users.email })
			.from(users)
			.where(and(isNotNull(users.lastSynced), lte(users.lastSynced, fiveMinAgo)));
		console.log('Users fetched:', usersData.length);
	} catch (error) {
		console.error('Error fetching users data', error);
		throw new Error('Error fetching users data', { cause: error });
	}

	try {
		const emails = usersData.map(({ email }) => email);
		const emailsBatches = splitEmailsIntoBatches(emails);
		for (const emailBatch of emailsBatches) {
			const queueBatch = emailBatch.map((email) => ({ body: email }));
			await env.QUEUE.sendBatch(queueBatch);
		}
	} catch (error) {
		console.error('Error sending batch', error);
		throw new Error('Error sending batch', { cause: error });
	}
}

function splitEmailsIntoBatches(emails: string[]): string[][] {
	let result = [];
	for (let i = 0; i < emails.length; i += BATCH_SIZE) {
		let chunk = emails.slice(i, i + BATCH_SIZE);
		result.push(chunk);
	}
	return result;
}

/**
 * If the function throws, the message won't be re-queued and retried
 * because we set "max_retries" to 0 in the wrangler.toml config.
 * We don't need retries because we depend on lastSynced timestamp in our DB
 * The return value is ignored: it should return either a value or a promise.
 */
async function handleQueue(email: string, env: Env) {
	try {
		await syncUser(email, env);
		console.log('User synced successfully');
	} catch (error) {
		console.error('Error handling queue', error);
		throw new Error('Error handling queue', { cause: error });
	}
}
