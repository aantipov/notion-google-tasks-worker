import { drizzle } from 'drizzle-orm/d1';
import { eq } from 'drizzle-orm';
import { users } from '@/schema';
import { Toucan } from 'toucan-js';
import { syncUser } from './helpers/sync.js';
import sendSetupCompletionPrompt from './sendSetupCompletionPrompt.js';
import sendFailedSyncNotify from './sendFailedSyncNotify.js';
import { handleScheduledSync } from './scheduledSync.js';

class SyncError extends Error {
	originalMessage: string;
	constructor(originalError: any) {
		const name = 'SyncError';
		const msg = `${originalError?.message || 'Unknown error'}`;
		super(msg);
		this.name = name;
		this.cause = originalError; // Storing the original error
		this.originalMessage = originalError?.message;
	}
}

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
		const email = batch.messages[0].body;
		ctx.waitUntil(handleQueue());

		/**
		 * If the function throws, the message won't be re-queued and retried
		 * because we set "max_retries" to 0 in the wrangler.toml config.
		 * We don't need retries because we depend on lastSynced timestamp in our DB
		 * The return value is ignored: it should return either a value or a promise.
		 */
		async function handleQueue() {
			const sentry = new Toucan({
				dsn: env.SENTRY_DSN,
				context: ctx,
			});
			sentry.setUser({ email });
			sentry.addBreadcrumb({
				message: 'Syncing user',
				timestamp: Math.floor(Date.now() / 1000), // Sentry expects seconds
			});
			try {
				await syncUser(email, env, sentry);
			} catch (error: any) {
				sentry.addBreadcrumb({
					message: '** saving sync error to DB **',
					timestamp: Math.floor(Date.now() / 1000), // Sentry expects seconds
					category: 'error-post-processing',
					level: 'info',
				});
				await handleSyncError(email, env, error);
				await sentry.captureException(new SyncError(error));
				console.log('SKIP'); // Skip the error handling in Tail handler
				throw new Error('SKIP'); // We need to throw an error to mark the worker call as failed in Cloudflare metrics
			}
		}
	},

	/**
	 * Sentry logging
	 * https://developers.cloudflare.com/workers/observability/tail-workers/
	 * https://developers.cloudflare.com/workers/runtime-apis/handlers/tail/#tailitems
	 */
	async tail(events, env, context) {
		const ev = events[0];
		if (ev.outcome === 'ok') {
			return;
		}
		if (ev.logs.find((log) => log.message[0] === 'SKIP')) {
			return;
		}

		const sentry = new Toucan({
			dsn: env.SENTRY_DSN,
			context,
		});
		sentry.setTag('ct.outcome', ev.outcome);

		(function () {
			let type = 'unknown';

			if (ev.event && 'queue' in ev.event) {
				type = 'queue';
			} else if (ev.event && 'cron' in ev.event) {
				type = 'cron ' + ev.event.cron;
			}

			sentry.setTag('ct.type', type);
		})();

		if (ev.outcome !== 'exception') {
			await sentry.captureException(new Error(ev.outcome));
			return;
		}

		// Record console.log as breadcrumbs
		ev.logs.forEach((log) => {
			sentry.addBreadcrumb({
				message: log.message.map((m: any) => JSON.stringify(m)).join(', '),
				type: log.level === 'error' ? 'error' : 'info',
				level: log.level === 'error' ? 'error' : 'info',
				timestamp: Math.floor(log.timestamp / 1000), // Sentry expects seconds
			});
		});

		await sentry.captureException(new Error(ev.exceptions[0].message));
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

async function handleSyncError(email: string, env: Env, error: any) {
	const db = drizzle(env.DB, { logger: false });
	const [user] = await db
		.select({ email: users.email, syncError: users.syncError })
		.from(users)
		.where(eq(users.email, email));
	const num = user.syncError?.num || 0;
	const syncError: typeof user.syncError = {
		message: error.toString() + ': ' + error?.cause?.toString?.(),
		num: num + 1,
		nextRetry: getNextRetryInMs(num),
		sentEmail: user.syncError?.sentEmail || false,
		started: user.syncError?.started || Date.now(),
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
