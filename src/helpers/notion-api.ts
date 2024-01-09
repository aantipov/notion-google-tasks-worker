import { Client } from '@notionhq/client';
import { GTaskT } from './google-api';

export interface NTokenResponseT {
	access_token: string;
	bot_id: string;
	duplicated_template_id: string | null;
	owner: any;
	workspace_icon: string | null;
	workspace_id: string;
	workspace_name: string | null;
}

// TODO: Handle errors https://developers.notion.com/reference/status-codes#error-codes

/**
 * Notion API Limitations:
 * https://developers.notion.com/reference/request-limits
 * 1. Notion's dates precision is upto minutes. So, we need to remove seconds and  milliseconds from lastSynced
 * 2. - 3 requests per second
 * 3. Notion's API has a limit of 100 results per page
 *
 * TODO: handle rate limits as described in the docs above - respect Retry-After header
 *
 * Each task takes ~1.5Kb
 */

export interface NTaskT {
	id: string;
	title: string;
	status: 'To Do' | 'Done';
	due: null | {
		start: string;
	};
	lastEdited: string; // ISO date string '2023-10-25T11:56:00.000Z'
	lastEditedByBot: boolean; // true if last edited by bot (Google Tasks Sync Bot)
}

export function getLastUpdatedTasks(tasks: NTaskT[], updatedSince: string) {
	const lastSync = new Date(updatedSince);
	// All Notion's dates precision is upto minutes. So, we need to remove seconds and  milliseconds from lastSynced
	lastSync.setSeconds(0);
	lastSync.setMilliseconds(0);
	const lastSyncISO = lastSync.toISOString();
	return tasks.filter((task) => task.lastEdited >= lastSyncISO && !task.lastEditedByBot);
}

export interface NPropsMapT {
	title: { id: string; name: string; type: 'title' };
	status: { id: string; name: string; type: 'status' };
	due: { id: string; name: string; type: 'date' };
	lastEdited: { id: string; name: string; type: 'last_edited_time' };
	lastEditedBy: { id: string; name: string; type: 'last_edited_by' };
}

/**
 * Note: Notion response doesn't include archived tasks
 * Hence we need to fetch *all* tasks and then
 * figure out which ones are archived using the mapping
 * (if not in the mapping, then it's archived)
 * TODO: fetch more than 100 tasks
 */
export async function fetchTasks(databaseId: string, propsMap: NPropsMapT, accessToken: string) {
	try {
		const notion = new Client({ auth: accessToken });
		const filterProps = Object.values(propsMap).map((prop: { id: any }) => prop.id);
		const response = await notion.databases.query({
			database_id: databaseId,
			filter_properties: filterProps,
			page_size: 100, // it's Notion's limit
			sorts: [
				{
					property: propsMap.lastEdited.id,
					direction: 'descending',
				},
			],
		});

		return response.results.map((result) => ({
			id: result.id,
			// @ts-ignore
			title: result.properties[propsMap.title.name].title
				// @ts-ignore
				.map((title) => title.plain_text)
				.join(''),
			// @ts-ignore
			status: result.properties[propsMap.status.name].status.name,
			// @ts-ignore
			due: result.properties[propsMap.due.name].date,
			// @ts-ignore
			lastEdited: result.properties[propsMap.lastEdited.name].last_edited_time,
			// @ts-ignore
			lastEditedBy: result.properties[propsMap.lastEditedBy.name].last_edited_by.id,
			// @ts-ignore
			lastEditedByBot: result.properties[propsMap.lastEditedBy.name].last_edited_by.type === 'bot',
		}));
	} catch (error) {
		console.error('Failed fetching Notion tasks', error);
		throw new Error('Failed fetching Notion tasks', { cause: error });
	}
}

export async function updateTask(
	nTaskId: string,
	gTask: GTaskT,
	propsMap: NPropsMapT,
	accessToken: string
) {
	try {
		console.log('Updating Notion task', nTaskId);
		const notion = new Client({ auth: accessToken });
		const date = gTask.due ? { start: gTask.due.slice(0, 10) } : null;
		const properties = {
			[propsMap.title.name]: { title: [{ text: { content: gTask.title } }] },
			[propsMap.due.name]: { date },
			[propsMap.status.name]: { status: { name: gTask.status === 'completed' ? 'Done' : 'To Do' } },
		};
		const response = await notion.pages.update({ page_id: nTaskId, properties });
		return response;
	} catch (error) {
		console.error('Error creating Notion task', error);
		throw new Error('Error creating Notion task', { cause: error });
	}
}

export async function deleteTask(nTaskId: string, accessToken: string) {
	console.log('Deleting Notion task', nTaskId);
	const notion = new Client({ auth: accessToken });
	const response = await notion.pages.update({
		page_id: nTaskId,
		archived: true,
	});
	return response;
}

export async function createTask(
	gTask: GTaskT,
	nDatabaseId: string,
	propsMap: NPropsMapT,
	accessToken: string
) {
	console.log('Creating Notion task');
	try {
		const notion = new Client({ auth: accessToken });
		const date = gTask.due ? { start: gTask.due.slice(0, 10) } : null;
		const properties = {
			[propsMap.title.name]: { title: [{ text: { content: gTask.title } }] },
			[propsMap.due.name]: { date },
			[propsMap.status.name]: { status: { name: gTask.status === 'completed' ? 'Done' : 'To Do' } },
		};
		const response = await notion.pages.create({
			parent: { database_id: nDatabaseId },
			properties,
		});
		return response;
	} catch (error) {
		console.error('Error creating Notion task', error);
		throw new Error('Error creating Notion task', { cause: error });
	}
}

export async function fetchPropsMap(databaseId: string, accessToken: string) {
	try {
		const notion = new Client({ auth: accessToken });
		const response = await notion.databases.retrieve({ database_id: databaseId });
		const propsMap = {
			title: Object.values(response.properties).find((p) => p.type === 'title'),
			status: Object.values(response.properties).find((p) => p.type === 'status'),
			due: Object.values(response.properties).find((p) => p.type === 'date'),
			lastEdited: Object.values(response.properties).find((p) => p.type === 'last_edited_time'),
			lastEditedBy: Object.values(response.properties).find((p) => p.type === 'last_edited_by'),
		} as NPropsMapT;
		return propsMap;
	} catch (error) {
		console.error('Failed fetching Notion properties map', error);
		throw new Error('Failed fetching Notion properties map', { cause: error });
	}
}
