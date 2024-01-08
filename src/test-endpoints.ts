import { drizzle, type DrizzleD1Database } from 'drizzle-orm/d1';
import { users } from '@/schema';
import { getUsersForSync } from './index';

export async function fetchTestUsersForSync(env: Env) {
	const db = drizzle(env.DB, { logger: true });

	await db.delete(users);

	await populateDummyData(db);

	const usersData = await getUsersForSync(db);

	return Response.json(usersData);
}

async function populateDummyData(db: DrizzleD1Database) {
	const getGToken = (email: string) => ({
		user: { id: '11111111', email, verified_email: true, picture: 'xxx' },
		refresh_token: 'ddd',
	});
	const tenMinAgo = new Date(Date.now() - 10 * 60 * 1000);
	const twoMinAgo = new Date(Date.now() - 2 * 60 * 1000);
	const inTwoMin = new Date(Date.now() + 2 * 60 * 1000);
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
				num: 1,
				nextRetry: inTwoMin.getTime(), // in 2 min (future) in ms
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
	]);
}
