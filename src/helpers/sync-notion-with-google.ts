import { UserSyncedT } from '@/schema';
import * as notionApi from './notion-api';
import type { GTaskT } from './google-api';
import type { NTaskT } from './notion-api';
import { MappingUpdatesT } from './sync-google-with-notion';

export default async function syncNotionWithGoogle(
	nTasksWithConflicts: NTaskT[], // all Notion tasks fetched
	gUpdatedTasksWithConflicts: GTaskT[], // all Google tasks updated since last sync
	userData: UserSyncedT, // current state of the user in DB
	nPropsMap: notionApi.NPropsMapT
): Promise<MappingUpdatesT> {
	console.log('Notion: match Google');
	try {
		const mappingUpdates: MappingUpdatesT = {
			newItems: [],
			deleted: [],
			updated: [],
		};
		const {
			nToken: { access_token: accessToken },
			databaseId,
		} = userData;
		const g2nMapping = new Map(userData.mapping.map(([gTaskId, nTaskId]) => [gTaskId, nTaskId]));

		// Clean Notion tasks from those that haven't been updated since last sync
		let nUpdatedTasksWithConflicts = getUpdatedNotionTasks(
			nTasksWithConflicts,
			userData.lastSynced
		);

		// Clean Google tasks from conflicted with Notion tasks:
		// remove those that were updated ealier than their counterparts in Notion
		const gTasks = gUpdatedTasksWithConflicts.filter((gTask) => {
			const nTaskId = g2nMapping.get(gTask.id);
			if (!nTaskId) return true; // no conflict - a new task in Google
			const nTask = nUpdatedTasksWithConflicts.find((nTask) => nTask.id === nTaskId);
			if (!nTask) return true; // no conflict - task in Notion was not updated
			return gTask.updated > nTask.lastEdited;
		});

		// Handle updated, created and deleted Google tasks: update/create/delete them in Notion
		const nTasksUpdatesPromises = gTasks.map(async (gTask) => {
			const nTaskId = g2nMapping.get(gTask.id);
			const gTaskCompletedAt =
				gTask.completed && gTask.status === 'completed'
					? new Date().toISOString().split('T')[0]
					: null;
			const isTaskExistInNotion = typeof nTaskId === 'string';

			// Create new task in Notion
			if (!isTaskExistInNotion) {
				if (gTask.deleted) {
					// Nothing to do as the task was deleted in Google and never existed in Notion
					return null;
				}
				const nNewTask = await notionApi.createTask(gTask, databaseId, nPropsMap, accessToken);
				mappingUpdates.newItems.push([gTask.id, nNewTask.id, gTaskCompletedAt]);
				return nNewTask;
			}

			// Delete task in Notion
			if (gTask.deleted) {
				const deleteRes = await notionApi.deleteTask(nTaskId, accessToken);
				mappingUpdates.deleted.push(gTask.id);
				return deleteRes;
			}

			// Update task in Notion
			const nUpdatedTask = await notionApi.updateTask(nTaskId, gTask, nPropsMap, accessToken);
			mappingUpdates.updated.push([gTask.id, gTaskCompletedAt]);
			return nUpdatedTask;
		});
		await Promise.all(nTasksUpdatesPromises);

		return mappingUpdates;
	} catch (error) {
		console.error('Notion: failed to match with Google', error);
		throw new Error('Notion: failed to match with Google', { cause: error });
	}
}

export function getUpdatedNotionTasks(tasks: NTaskT[], lastSync: Date) {
	// All Notion's dates precision is up to minutes. So, we need to remove seconds and  milliseconds from lastSynced
	lastSync.setSeconds(0);
	lastSync.setMilliseconds(0);
	const lastSyncISO = lastSync.toISOString();
	return tasks.filter((task) => task.lastEdited >= lastSyncISO && !task.lastEditedByBot);
}
