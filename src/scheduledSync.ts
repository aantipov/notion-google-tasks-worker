import { DrizzleD1Database, drizzle } from 'drizzle-orm/d1';
import { and, isNull, sql, lte, or } from 'drizzle-orm';
import { users } from '@/schema';

const BATCH_SIZE = 100; // CF limit

export async function handleScheduledSync(env: Env): Promise<void> {
	const db = drizzle(env.DB, { logger: false });
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
