import { drizzle, type DrizzleD1Database } from 'drizzle-orm/d1';
import { and, eq, isNull, lte, or, sql } from 'drizzle-orm';
import { users } from '@/schema';
import { syncUser } from './helpers/sync.js';
import sendSetupCompletionPrompt from './sendSetupCompletionPrompt.js';
import { fetchTestUsersForSync } from './test-endpoints';
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

	/**
	 * Test endpoints used in development only
	 */
	async fetch(request, env) {
		if (env.ENVIRONMENT !== 'development') {
			return new Response('Not found', { status: 404 });
		}

		if (request.url.endsWith('/users-for-sync')) {
			return fetchTestUsersForSync(env);
		}

		if (request.url.endsWith('/test')) {
			return Response.json({ data: 'Hello' });
		}

		return new Response('Not found', { status: 404 });
	},
};

export default handler;

async function handleScheduledSync(env: Env): Promise<void> {
	const db = drizzle(env.DB, { logger: true });
	const usersData = await getUsersForSync(db);

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

export async function getUsersForSync(db: DrizzleD1Database): Promise<{ email: string }[]> {
	const fiveMinAgo = new Date(Date.now() - 5 * 60 * 1000);
	const nowInMs = Date.now();
	let usersData: { email: string }[];
	try {
		usersData = await db
			.select({ email: users.email })
			.from(users)
			.where(
				and(
					lte(users.lastSynced, fiveMinAgo),
					or(
						isNull(users.syncError),
						lte(sql`json_extract(${users.syncError}, '$.nextRetry')`, nowInMs)
					)
				)
			);
		console.log('Users fetched:', usersData.length);
	} catch (error) {
		console.error('Failed fetching users data', error);
		throw new Error('Failed fetching users data', { cause: error });
	}
	return usersData;
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
	} catch (error: any) {
		console.error('Error handling queue', error);
		await handleSyncError(email, env, error);
		throw new Error('Error handling queue', { cause: error });
	}
}

async function handleSyncError(email: string, env: Env, error: any) {
	const db = drizzle(env.DB, { logger: true });
	const [user] = await db
		.select({ email: users.email, syncError: users.syncError })
		.from(users)
		.where(eq(users.email, email));
	const syncError = user.syncError || {
		message: error.toString() + ': ' + error?.cause?.toString?.(),
		num: 0,
		nextRetry: 0,
	};
	await db.update(users).set({ syncError }).where(eq(users.email, email));
}
