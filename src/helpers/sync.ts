import { drizzle } from 'drizzle-orm/d1';
import { COMPLETION_MAP_TIMEOUT_DAYS } from '../constants';
import * as googleApi from './google-api';
import * as notionApi from './notion-api';
import { UserSyncedT, users } from '@/schema';
import { eq } from 'drizzle-orm';
import syncGoogleWithNotion, { type MappingUpdatesT } from './sync-google-with-notion';
import syncNotionWithGoogle from './sync-notion-with-google';

export async function syncUser(userEmail: string, env: Env): Promise<void> {
	const db = drizzle(env.DB, { logger: true });

	// ==== 1. Fetch User Data from DB ====
	let userData: UserSyncedT;
	try {
		[userData] = (await db.select().from(users).where(eq(users.email, userEmail))) as UserSyncedT[];
		console.log('usersData fetched', {
			tasklistId: userData.tasklistId,
			databaseId: userData.databaseId,
			mappingNumber: userData.mapping.length,
			created: userData.created,
			modified: userData.modified,
			lastSynced: userData.lastSynced,
		});
	} catch (error) {
		console.error('Failed fetching user data', error);
		throw new Error('Failed fetching user data', { cause: error });
	}

	let newMapping = [...userData.mapping];
	const { nToken, gToken } = userData;
	const { access_token: nAccessToken } = nToken;

	// ==== 2. Get Google access token in exchange for refresh token ====
	const gAccessToken = await googleApi.fetchAccessToken(gToken.refresh_token, env);

	// ==== 3. Fetch Notion properties map and ensure it's correct ====
	const nPropsMap = await notionApi.fetchPropsMap(userData.databaseId, nAccessToken);
	console.log('nPropsMap fetched');

	// ====  4. Fetch Google Tasks updated since last sync ====
	const gTasks = await googleApi.fetchTasks(userData, gAccessToken);
	console.log('gTasks (updated) fetched number', gTasks.length);

	// ==== 5. Fetch Notion Tasks (100 max) ====
	const nAllTasks = await notionApi.fetchTasks(userData.databaseId, nPropsMap, nAccessToken);
	console.log('nTasks fetched (all) number', nAllTasks.length);

	// ==== 6. Sync Google with Notion ====
	const gMappingsUpdates = await syncGoogleWithNotion(gTasks, nAllTasks, userData, gAccessToken);
	console.log('Google Tasks Sync Results', {
		created: gMappingsUpdates.newItems.length,
		updated: gMappingsUpdates.updated.length,
		deleted: gMappingsUpdates.deleted.length,
	});
	await updateUserMappingInDB(gMappingsUpdates);

	// ==== 7. Sync Notion with Google ====
	const nMappingsUpdates = await syncNotionWithGoogle(nAllTasks, gTasks, userData, nPropsMap);
	console.log('Notion Tasks Sync Results', {
		created: nMappingsUpdates.newItems.length,
		updated: nMappingsUpdates.updated.length,
		deleted: nMappingsUpdates.deleted.length,
	});
	await updateUserMappingInDB(nMappingsUpdates);

	// ==== 8. User Data housekeeping ====
	// - Delete from sync map tasks that have been completed for more than a week
	const cleanedMapping = newMapping.filter(([, , completedAt]) => {
		if (completedAt) {
			const completedAtDate = new Date(completedAt);
			const now = new Date();
			const daysSinceCompletion = Math.floor(
				(now.getTime() - completedAtDate.getTime()) / (1000 * 3600 * 24)
			);
			return daysSinceCompletion < COMPLETION_MAP_TIMEOUT_DAYS;
		}
		return true;
	});
	const hasMappingChanged = cleanedMapping.length !== newMapping.length;
	const tasksToBeRemoved = newMapping.length - cleanedMapping.length;

	console.log(`Data housekeeping: ${tasksToBeRemoved} tasks to be removed from mapping`);
	await db
		.update(users)
		.set({ lastSynced: new Date(), ...(hasMappingChanged ? { mapping: cleanedMapping } : {}) })
		.where(eq(users.email, userEmail));
	console.log('Data housekeeping done');

	async function updateUserMappingInDB(gMappingsUpdates: MappingUpdatesT) {
		try {
			if (
				!gMappingsUpdates.newItems.length &&
				!gMappingsUpdates.deleted.length &&
				!gMappingsUpdates.updated.length
			) {
				return;
			}
			newMapping.push(...gMappingsUpdates.newItems);
			newMapping = newMapping.filter(([gTaskId]) => !gMappingsUpdates.deleted.includes(gTaskId));
			newMapping = newMapping.map(([gTaskId, nTaskId]) => {
				const nTaskCompletedAt = gMappingsUpdates.updated.find(
					([gTaskId]) => gTaskId === gTaskId
				)?.[1];
				return [gTaskId, nTaskId, nTaskCompletedAt];
			});
			await db.update(users).set({ mapping: newMapping }).where(eq(users.email, userEmail));
			console.log('Mapping changes saved to DB');
		} catch (error) {
			console.error('Error updating user mapping in DB', error);
			throw new Error('Error updating user mapping in DB', { cause: error });
		}
	}
}
