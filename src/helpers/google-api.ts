import { UserSyncedT } from '@/schema';
import { GOOGLE_MAX_TASKS, GOOGLE_TOKEN_URI } from '../constants';
import { NTaskT } from './notion-api';

interface TokenResponseT {
	access_token: string;
	expires_in: number;
	refresh_token: string;
	scope: string;
	token_type: 'Bearer';
}

/**
 * Google Tasks API
 * Metrics: https://console.cloud.google.com/apis/api/tasks.googleapis.com/metrics
 * API Docs: https://developers.google.com/tasks/overview
 * TODO: Performance hints https://developers.google.com/tasks/performance
 * Limitations: https://developers.google.com/tasks/pricing
 * 1. Due date precision is upto date. It is not possible to read or write time portion of the date.
 * 2. 50k requests per day
 * 3.
 */

// https://developers.google.com/tasks/reference/rest/v1/tasks#resource:-task
export interface GTaskT {
	id: string;
	title: string; // can be an empty string
	status: 'needsAction' | 'completed';
	due?: string; // ISO Date string 2023-10-31T00:00:00.000Z time portion is always 00:00:00. We can't get or set time.
	notes?: string; // == Description
	updated: string; // ISO date string '2023-10-25T11:56:22.678Z'
	parent?: string; // omitted if task is a top-level task
	completed?: string; // Complettion date of the task
	deleted?: boolean;
	hidden?: boolean;
}

export interface GTasksResponseT {
	nextPageToken: string;
	items: GTaskT[];
}

interface UserInfoResponseT {
	id: string;
	email: string;
	verified_email: boolean;
	picture: string;
}

interface OritinalTokenResponseT {
	access_token: string;
	expires_in: number;
	refresh_token: string;
	scope: string;
	token_type: 'Bearer';
}

export interface GTokenResponseT extends OritinalTokenResponseT {
	user: UserInfoResponseT;
}

export async function createTask(
	nTask: NTaskT,
	tasklistId: string,
	accessToken: string // access token
): Promise<GTaskT> {
	console.log('Creating Google task');
	try {
		const tasksAPIUrl = new URL(`https://tasks.googleapis.com/tasks/v1/lists/${tasklistId}/tasks`);

		const tasksResp = await fetch(tasksAPIUrl.toString(), {
			method: 'POST',
			headers: {
				Authorization: `Bearer ${accessToken}`,
				accept: 'application/json',
			},
			body: JSON.stringify({
				title: nTask.title,
				due: nTask.due?.start ? new Date(nTask.due.start).toISOString() : null,
				status: nTask.status === 'Done' ? 'completed' : 'needsAction',
			}),
		});
		if (!tasksResp.ok) {
			throw new Error(
				`Failed to create a Google task: ${tasksResp.status} ${tasksResp.statusText}`
			);
		}
		const resp = await tasksResp.json();
		return resp as GTaskT;
	} catch (error) {
		console.error('Error creating a google task', error);
		throw new Error('Error creating a google task', { cause: error });
	}
}

export async function updateTask(
	gTaskId: string,
	nTask: NTaskT,
	tasklistId: string,
	accessToken: string
): Promise<GTaskT> {
	console.log('Updating Google task', gTaskId);
	try {
		const tasksAPIUrl = new URL(
			`https://tasks.googleapis.com/tasks/v1/lists/${tasklistId}/tasks/${gTaskId}`
		);

		const tasksResp = await fetch(tasksAPIUrl.toString(), {
			method: 'PATCH',
			headers: {
				Authorization: `Bearer ${accessToken}`,
				accept: 'application/json',
				'Content-Type': 'application/json',
			},
			body: JSON.stringify({
				title: nTask.title,
				due: nTask.due?.start ? new Date(nTask.due.start).toISOString() : null,
				status: nTask.status === 'Done' ? 'completed' : 'needsAction',
			}),
		});

		if (!tasksResp.ok) {
			throw new Error(
				`Failed to update a Google task: ${tasksResp.status} ${tasksResp.statusText}`
			);
		}
		const updatedTask = (await tasksResp.json()) as GTaskT;
		return updatedTask;
	} catch (error) {
		console.error('Error updating a google task', error);
		throw new Error('Error updating a google task', { cause: error });
	}
}

/**
 * For safety reasons we don't delete tasks in Google. Instead we mark them as completed.
 */
export async function deleteTask(
	taskId: string,
	tasklistId: string,
	accessToken: string
): Promise<GTaskT> {
	console.log('Deleting Google task', taskId);
	try {
		const tasksAPIUrl = new URL(
			`https://tasks.googleapis.com/tasks/v1/lists/${tasklistId}/tasks/${taskId}`
		);

		const tasksResp = await fetch(tasksAPIUrl.toString(), {
			method: 'PATCH',
			headers: {
				Authorization: `Bearer ${accessToken}`,
				accept: 'application/json',
				'Content-Type': 'application/json',
			},
			body: JSON.stringify({ status: 'completed' }),
		});

		if (!tasksResp.ok) {
			throw new Error(
				`Failed to delete a Google task: ${tasksResp.status} ${tasksResp.statusText}`
			);
		}
		const deleted = (await tasksResp.json()) as GTaskT;
		return deleted;
	} catch (error) {
		console.error('Error deleting a google task', tasklistId, taskId, error);
		throw new Error('Error deleting a google task', { cause: error });
	}
}

export async function fetchTasks(userData: UserSyncedT, accessToken: string): Promise<GTaskT[]> {
	try {
		const tasksAPIUrl = new URL(
			`https://tasks.googleapis.com/tasks/v1/lists/${userData.tasklistId}/tasks`
		);
		// Add 300ms to lastSynced, otherwise Google API returns tasks updated at lastSynced
		const lastSynced = userData.lastSynced;
		lastSynced.setMilliseconds(lastSynced.getMilliseconds() + 300);
		tasksAPIUrl.searchParams.set('updatedMin', lastSynced.toISOString());
		tasksAPIUrl.searchParams.set('showCompleted', 'true');
		tasksAPIUrl.searchParams.set('showHidden', 'true');
		tasksAPIUrl.searchParams.set('showDeleted', 'true');
		tasksAPIUrl.searchParams.set('maxResults', GOOGLE_MAX_TASKS.toString());

		const tasksResp = await fetch(tasksAPIUrl.toString(), {
			method: 'GET',
			headers: {
				Authorization: `Bearer ${accessToken}`,
				accept: 'application/json',
			},
		});
		if (!tasksResp.ok) {
			throw new Error(`Failed to fetch tasks list: ${tasksResp.status} ${tasksResp.statusText}`);
		}
		const tasksData = (await tasksResp.json()) as GTasksResponseT;
		return tasksData.items;
	} catch (error) {
		console.error('Error fetching Google tasks', error);
		throw new Error('Error fetching Google tasks', { cause: error });
	}
}

export async function fetchAccessToken(refreshToken: string, env: Env): Promise<string> {
	try {
		const gTokenUrl = new URL(GOOGLE_TOKEN_URI);
		gTokenUrl.searchParams.set('client_id', env.GOOGLE_CLIENT_ID);
		gTokenUrl.searchParams.set('client_secret', env.GOOGLE_CLIENT_SECRET);
		gTokenUrl.searchParams.set('refresh_token', refreshToken);
		gTokenUrl.searchParams.set('grant_type', 'refresh_token');
		const tokensResp = await fetch(gTokenUrl.toString(), {
			method: 'POST',
			headers: { accept: 'application/json' },
		});
		if (!tokensResp.ok) {
			throw new Error(
				`Failed to get working Google access token: ${tokensResp.status} ${tokensResp.statusText}`
			);
		}
		const tokenData = (await tokensResp.json()) as TokenResponseT;

		return tokenData.access_token;
	} catch (error) {
		console.error('Error fetching Google access token', error);
		throw new Error('Error fetching Google access token', { cause: error });
	}
}
