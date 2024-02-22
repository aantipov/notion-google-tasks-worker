import { drizzle } from 'drizzle-orm/d1';
import { COMPLETION_MAP_TIMEOUT_DAYS } from '../constants';
import * as googleApi from './google-api';
import * as notionApi from './notion-api';
import { UserSyncedT, users, syncStats } from '@/schema';
import { eq } from 'drizzle-orm';
import syncGoogleWithNotion, { type MappingUpdatesT } from './sync-google-with-notion';
import syncNotionWithGoogle from './sync-notion-with-google';
import type { Toucan } from 'toucan-js';

class NonBlockSyncError extends Error {
	originalMessage: string;
	constructor(originalError: any) {
		const name = 'NonBlockSyncError';
		const msg = `${originalError?.message || 'Unknown error'}`;
		super(msg);
		this.name = name;
		this.cause = originalError; // Storing the original error
		this.originalMessage = originalError?.message;
	}
}

export async function syncUser(userEmail: string, env: Env, sentry: Toucan): Promise<void> {
	const db = drizzle(env.DB, { logger: true });

	// ==================================================================
	// ==== 1. Fetch existing Sync Mapping from DB =====================
	// ==================================================================
	let userData: UserSyncedT;
	try {
		sentry.addBreadcrumb({
			message: 'Step 1. Fetching User Data from DB',
			timestamp: Math.floor(Date.now() / 1000), // Sentry expects seconds
		});
		[userData] = (await db.select().from(users).where(eq(users.email, userEmail))) as UserSyncedT[];
		console.log('userData fetched', {
			tasklistId: userData.tasklistId,
			databaseId: userData.databaseId,
			mappingNumber: userData.mapping.length,
			created: userData.created,
			modified: userData.modified,
			lastSynced: userData.lastSynced,
		});
	} catch (error: any) {
		console.error(`Failed to fetch userData: ${error?.message}`, error);
		throw new Error(`Failed to fetch userData: ${error?.message}`, { cause: error });
	}

	let newMapping = [...userData.mapping];
	const { nToken, gToken } = userData;
	const { access_token: nAccessToken } = nToken;

	// ==================================================================
	// ==== 2. Get Google access token in exchange for refresh token ====
	// ==================================================================
	sentry.addBreadcrumb({
		message: 'Step 2. Fetching Google Access Token',
		timestamp: Math.floor(Date.now() / 1000), // Sentry expects seconds
	});
	const gAccessToken = await googleApi.fetchAccessToken(gToken.refresh_token, env);

	// ================================================================
	// ==== 3. Fetch Notion properties map and ensure it's correct ====
	// ================================================================
	sentry.addBreadcrumb({
		message: 'Step 3. Fetching Notion Props Map',
		timestamp: Math.floor(Date.now() / 1000), // Sentry expects seconds
	});
	const nPropsMap = await notionApi.fetchPropsMap(userData.databaseId, nAccessToken);
	console.log('nPropsMap fetched');

	// ==================================================================
	// ====  4. Fetch Google Tasks updated since last sync ====
	// ==================================================================
	sentry.addBreadcrumb({
		message: 'Step 4. Fetching Google Tasks',
		timestamp: Math.floor(Date.now() / 1000), // Sentry expects seconds
	});
	const gTasks = await googleApi.fetchTasks(userData, gAccessToken);
	console.log('gTasks (updated) fetched number', gTasks.length);

	// ==================================================================
	// ==== 5. Fetch Notion Tasks (100 max) ====
	// ==================================================================
	sentry.addBreadcrumb({
		message: 'Step 5. Fetching Notion Tasks',
		timestamp: Math.floor(Date.now() / 1000), // Sentry expects seconds
	});
	const nAllTasks = await notionApi.fetchTasks(userData.databaseId, nPropsMap, nAccessToken);
	console.log('nTasks fetched (all) number', nAllTasks.length);

	// ==================================================================
	// ==== 6. Sync Google with Notion ====
	// ==================================================================
	sentry.addBreadcrumb({
		message: 'Step 6. Syncing Google with Notion',
		timestamp: Math.floor(Date.now() / 1000), // Sentry expects seconds
	});
	const gMappingsUpdates = await syncGoogleWithNotion(gTasks, nAllTasks, userData, gAccessToken);
	console.log('Google Tasks Sync Results', {
		created: gMappingsUpdates.newItems.length,
		updated: gMappingsUpdates.updated.length,
		deleted: gMappingsUpdates.deleted.length,
	});
	await updateUserMappingInDB(gMappingsUpdates, 'google');
	sentry.addBreadcrumb({
		message: 'Syncing Google with Notion Results ' + JSON.stringify(gMappingsUpdates),
		timestamp: Math.floor(Date.now() / 1000), // Sentry expects seconds
	});
	if (gMappingsUpdates.errors.length) {
		console.error('Google Tasks Sync Errors', JSON.stringify(gMappingsUpdates.errors));
		for (const error of gMappingsUpdates.errors) {
			const theErr = new Error(`Sync Google w/ Notion: ${error?.message}`, {
				cause: error,
			});
			await sentry.captureException(new NonBlockSyncError(theErr));
		}
	}

	// ==================================================================
	// ==== 7. Sync Notion with Google ====
	// ==================================================================
	// Exclude gTasks that have been deleted on previous step
	sentry.addBreadcrumb({
		message: 'Step 7. Syncing Notion with Google',
		timestamp: Math.floor(Date.now() / 1000), // Sentry expects seconds
	});
	const gTasksUpdated = gTasks.filter((gTask) => !gMappingsUpdates.deleted.includes(gTask.id));
	const nMappingsUpdates = await syncNotionWithGoogle(
		nAllTasks,
		gTasksUpdated,
		userData,
		nPropsMap
	);
	console.log('Notion Tasks Sync Results', {
		created: nMappingsUpdates.newItems.length,
		updated: nMappingsUpdates.updated.length,
		deleted: nMappingsUpdates.deleted.length,
	});
	await updateUserMappingInDB(nMappingsUpdates, 'notion');
	sentry.addBreadcrumb({
		message: 'Syncing Notion with Google Results ' + JSON.stringify(nMappingsUpdates),
		timestamp: Math.floor(Date.now() / 1000), // Sentry expects seconds
	});

	// ==================================================================
	// ==== 8. User Data housekeeping ====
	// ==================================================================
	sentry.addBreadcrumb({
		message: 'Step 8. User sync data housekeeping',
		timestamp: Math.floor(Date.now() / 1000), // Sentry expects seconds
	});
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
		.set({
			lastSynced: new Date(),
			...(hasMappingChanged ? { mapping: cleanedMapping } : {}),
			syncError: null,
		})
		.where(eq(users.email, userEmail));
	console.log('Data housekeeping done');
	sentry.addBreadcrumb({
		message: `Data housekeeping done: ${tasksToBeRemoved} tasks removed from mapping`,
		timestamp: Math.floor(Date.now() / 1000), // Sentry expects seconds
	});

	async function updateUserMappingInDB(
		gMappingsUpdates: MappingUpdatesT,
		system: 'google' | 'notion'
	) {
		try {
			const { newItems, deleted, updated } = gMappingsUpdates;
			if (!newItems.length && !deleted.length && !updated.length) {
				return;
			}
			newMapping.push(...newItems);
			newMapping = newMapping.filter(([gTaskId]) => !deleted.includes(gTaskId));
			newMapping = newMapping.map(([gTaskId, nTaskId]) => {
				const nTaskCompletedAt = updated.find(([gTaskId]) => gTaskId === gTaskId)?.[1];
				return [gTaskId, nTaskId, nTaskCompletedAt];
			});
			await db.update(users).set({ mapping: newMapping }).where(eq(users.email, userEmail));
			await db.insert(syncStats).values({
				email: userEmail,
				created: newItems.length,
				updated: updated.length,
				deleted: deleted.length,
				total: newItems.length + updated.length + deleted.length,
				system,
				created_at: new Date(),
			});
			console.log('Mapping changes saved to DB');
		} catch (error) {
			console.error('Error updating user mapping in DB', error);
			throw new Error('Error updating user mapping in DB', { cause: error });
		}
	}
}
