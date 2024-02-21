import { unstable_dev, getBindingsProxy } from 'wrangler';
import type { UnstableDevWorker } from 'wrangler';
import { describe, beforeAll, afterAll, beforeEach, it, expect } from 'vitest';
import { getEmailsForFailedSyncNotify, setFailedSyncNotifed } from './sendFailedSyncNotify';
import { getUsersForSync } from './scheduledSync';
import { DrizzleD1Database, drizzle } from 'drizzle-orm/d1';
import { users } from './schema';

type NewUserT = typeof users.$inferInsert;

describe('Test D1', () => {
	let worker: UnstableDevWorker;
	let db: DrizzleD1Database;

	beforeAll(async () => {
		worker = await unstable_dev('src/index.ts', {
			experimental: { disableExperimentalWarning: true },
		});
		const { bindings } = await getBindingsProxy();
		db = drizzle(bindings.DB as D1Database, { logger: false });
	});

	beforeEach(async () => {
		await db.delete(users); // delete all rows in the table
		await populateDummyData(db);
	});

	afterAll(async () => {
		await worker.stop();
	});

	it('should return an array of users for sync', async () => {
		const expectedResults = [{ email: 'two@example.com' }, { email: 'three@example.com' }];
		const data = await getUsersForSync(db);
		expect(data).toMatchObject(expectedResults);
	});

	it('should return an array of users to notify about failed sync', async () => {
		const expectedResults = ['three2@example.com', 'five@example.com'];
		const emails = await getEmailsForFailedSyncNotify(db);
		expect(emails).toMatchObject(expectedResults);
	});

	it('should mark users as notified about failed sync', async () => {
		const emails = ['three2@example.com', 'five@example.com'];
		const res = await setFailedSyncNotifed(db, emails);
		expect(res.length).toBe(2);
		expect(res[0].syncError?.sentEmail).toBe(true);
		expect(res[1].syncError?.sentEmail).toBe(true);
	});
});

async function populateDummyData(db: DrizzleD1Database) {
	const getGToken = (email: string) => ({
		user: { id: '11111111', email, verified_email: true, picture: 'xxx' },
		refresh_token: 'ddd',
	});
	const tenMinAgo = new Date(Date.now() - 10 * 60 * 1000);
	const twoMinAgo = new Date(Date.now() - 2 * 60 * 1000);
	const inTwoMin = new Date(Date.now() + 2 * 60 * 1000);
	const inOneDay = new Date(Date.now() + 24 * 60 * 60 * 1000);
	const dayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);
	const tenDaysAgo = new Date(Date.now() - 10 * 24 * 60 * 60 * 1000);
	// Populate DB with some data
	await db.insert(users).values([
		{
			email: 'one@example.com',
			gToken: getGToken('one@example.com'),
			lastSynced: twoMinAgo,
			created: tenDaysAgo,
			modified: tenDaysAgo,
		},
		{
			email: 'two@example.com',
			gToken: getGToken('two@example.com'),
			lastSynced: tenMinAgo,
			created: tenDaysAgo,
			modified: tenDaysAgo,
		},
		{
			email: 'three@example.com',
			gToken: getGToken('three@example.com'),
			lastSynced: dayAgo,
			syncError: {
				message: 'Some error',
				num: 1,
				nextRetry: twoMinAgo.getTime(), // 2 min ago in ms
			},
			created: tenDaysAgo,
			modified: tenDaysAgo,
		},
		{
			email: 'three1@example.com',
			gToken: getGToken('three1@example.com'),
			lastSynced: dayAgo,
			syncError: {
				message: 'Some error',
				num: 1,
				nextRetry: null,
			},
			created: tenDaysAgo,
			modified: tenDaysAgo,
		},
		{
			email: 'three2@example.com',
			gToken: getGToken('three2@example.com'),
			lastSynced: dayAgo,
			syncError: {
				message: 'Some error',
				num: 7,
				nextRetry: inTwoMin.getTime(), // in 2 min (future) in ms
			},
			created: tenDaysAgo,
			modified: tenDaysAgo,
		},
		{
			email: 'three3@example.com',
			gToken: getGToken('three3@example.com'),
			lastSynced: dayAgo,
			syncError: {
				message: 'Some error',
				num: 7,
				nextRetry: inTwoMin.getTime(), // in 2 min (future) in ms
				sentEmail: true,
			},
			created: tenDaysAgo,
			modified: tenDaysAgo,
		},
		{
			email: 'four@example.com',
			gToken: getGToken('four@example.com'),
			created: tenDaysAgo,
			modified: tenDaysAgo,
		},
		{
			email: 'five@example.com',
			gToken: getGToken('five@example.com'),
			lastSynced: dayAgo,
			syncError: {
				message: 'Some error',
				num: 10,
				nextRetry: inOneDay.getTime(), // in 2 min (future) in ms
			},
			created: tenDaysAgo,
			modified: tenDaysAgo,
		},
	] as NewUserT[]);
}
