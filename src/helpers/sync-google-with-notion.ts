import { UserSyncedT } from '@/schema';
import * as googleApi from './google-api';
import type { GTaskT } from './google-api';
import type { NTaskT } from './notion-api';

type GTaskIdT = string;
type NTaskIdT = string;
type CompletedAtT = string | null; // ISO date string '2023-10-25'
export type MappingUpdatesT = {
	newItems: [GTaskIdT, NTaskIdT, CompletedAtT][];
	deleted: GTaskIdT[];
	updated: [GTaskIdT, CompletedAtT][];
};

export default async function syncGoogleWithNotion(
	gUpdatedTasksWithConflicts: GTaskT[], // all Google tasks updated since last sync
	nTasksWithConflicts: NTaskT[], // all Notion tasks fetched
	userData: UserSyncedT, // current state of the user in DB
	accessToken: string
): Promise<MappingUpdatesT> {
	try {
		const mappingUpdates: MappingUpdatesT = {
			newItems: [],
			deleted: [],
			updated: [],
		};
		const { tasklistId, mapping } = userData;

		// Handle DELETED Notion tasks: delete them in Google
		// Deleted tasks are those that are in the mapping but not in the list of all Notion tasks
		const n2gMapping = new Map(mapping.map(([gTaskId, nTaskId]) => [nTaskId, gTaskId]));
		const nTasksIds = nTasksWithConflicts.map((t) => t.id);
		const nSyncedTasksIds = mapping.map(([, nTaskId]) => nTaskId);
		const nDeletedTasksIds = nSyncedTasksIds.filter((nTaskId) => !nTasksIds.includes(nTaskId));
		const gDeletedTasksIds = nDeletedTasksIds.map((nTaskId) => n2gMapping.get(nTaskId) as string);
		const gDeletedTasksPromises = gDeletedTasksIds.map((id) =>
			googleApi.deleteTask(id, tasklistId, accessToken)
		);
		await Promise.all(gDeletedTasksPromises);
		mappingUpdates.deleted = gDeletedTasksIds;

		// Clean Notion tasks from those that haven't been updated since last sync
		let nUpdatedTasksWithConflicts = getUpdatedNotionTasks(
			nTasksWithConflicts,
			userData.lastSynced
		);

		// Clean Notion tasks from conflicted with Google tasks:
		// remove those that were updated ealier than their counterparts in Google
		const nTasks = nUpdatedTasksWithConflicts.filter((nTask) => {
			const gTaskId = n2gMapping.get(nTask.id);
			if (!gTaskId) return true; // no conflict - a new task in Notion
			const gTask = gUpdatedTasksWithConflicts.find((gTask) => gTask.id === gTaskId);
			if (!gTask) return true; // no conflict - task in Google was not updated
			return nTask.lastEdited >= gTask.updated;
		});

		// Handle UPDATED and CREATED Notion tasks: update/create them in Google
		const gTasksUpdatesPromises = nTasks.map(async (nTask) => {
			const nTaskCompletedAt =
				nTask.status === 'Done' ? new Date().toISOString().split('T')[0] : null;
			const gTaskId = n2gMapping.get(nTask.id);
			if (!gTaskId) {
				const gNewTask = await googleApi.createTask(nTask, tasklistId, accessToken);
				mappingUpdates.newItems.push([gNewTask.id, nTask.id, nTaskCompletedAt]);
				return gNewTask;
			}

			mappingUpdates.updated.push([gTaskId, nTaskCompletedAt]);
			return await googleApi.updateTask(gTaskId, nTask, tasklistId, accessToken);
		});

		await Promise.all(gTasksUpdatesPromises);

		return mappingUpdates;
	} catch (error) {
		console.error('Error syncing Google with Notion', error);
		throw new Error('Error syncing Google with Notion', { cause: error });
	}
}

export function getUpdatedNotionTasks(tasks: NTaskT[], lastSync: Date) {
	// All Notion's dates precision is up to minutes. So, we need to remove seconds and  milliseconds from lastSynced
	lastSync.setSeconds(0);
	lastSync.setMilliseconds(0);
	const lastSyncISO = lastSync.toISOString();
	return tasks.filter((task) => task.lastEdited >= lastSyncISO && !task.lastEditedByBot);
}
