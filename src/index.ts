import { drizzle } from 'drizzle-orm/d1';
import { eq } from 'drizzle-orm';
import { users } from '@/schema';
import { syncUser } from './helpers/sync.js';
import sendSetupCompletionPrompt from './sendSetupCompletionPrompt.js';
import sendFailedSyncNotify from './sendFailedSyncNotify.js';
import { handleScheduledSync } from './scheduledSync.js';

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
			case '0 9 * * *':
				ctx.waitUntil(sendFailedSyncNotify(env));
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

		return new Response('Not found', { status: 404 });
	},
};

export default handler;

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
	const db = drizzle(env.DB, { logger: false });
	const [user] = await db
		.select({ email: users.email, syncError: users.syncError })
		.from(users)
		.where(eq(users.email, email));
	const num = user.syncError?.num || 0;
	const syncError = {
		message: error.toString() + ': ' + error?.cause?.toString?.(),
		num: num + 1,
		nextRetry: getNextRetryInMs(num),
	};
	await db.update(users).set({ syncError }).where(eq(users.email, email));
}

function getNextRetryInMs(num: number): number | null {
	const dayInMin = 24 * 60;
	const retryTimesInMin = [20, 80, 320, 640];
	const retryDeltaInMin = num < retryTimesInMin.length ? retryTimesInMin[num] : dayInMin;

	// Max 10 retries within 5 days
	if (num >= 10) {
		return null;
	}

	return Date.now() + retryDeltaInMin * 60 * 1000;
}
