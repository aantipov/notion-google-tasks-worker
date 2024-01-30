import { integer, sqliteTable, text } from 'drizzle-orm/sqlite-core';
import type { GTokenResponseT } from '@/helpers/google-api';
import type { NTokenResponseT } from '@/helpers/notion-api';

type GTaskIdT = string;
type NTaskIdT = string;
type CompletedAtT = string | null; // ISO date string '2023-10-25'
type GTokenRestrictedT = Pick<GTokenResponseT, 'user' | 'refresh_token'>;

export const users = sqliteTable('users', {
	email: text('email').primaryKey(),
	gToken: text('g_token', { mode: 'json' }).$type<GTokenRestrictedT>().notNull(),
	nToken: text('n_token', { mode: 'json' }).$type<NTokenResponseT>(),
	tasklistId: text('tasklist_id'),
	databaseId: text('database_id'),
	mapping: text('mapping', { mode: 'json' }).$type<[GTaskIdT, NTaskIdT, CompletedAtT?][]>(),
	lastSynced: integer('last_synced', { mode: 'timestamp' }), // Important to recognize that sync was established successfully
	setupCompletionPromptSent: integer('setup_completion_prompt_sent', { mode: 'boolean' }),
	setupCompletionPromptSentDate: integer('setup_completion_prompt_sent_date', {
		mode: 'timestamp',
	}),
	syncError: text('sync_error', { mode: 'json' }).$type<{
		message: string;
		num: number; // Number of consecutive sync errors
		nextRetry: number | null; // Timestamp in ms. Null if no retries left. Max 10 retries within 5 days
		sentEmail: boolean;
	}>(), // Last sync error message. Reset to null on successful sync
	created: integer('created', { mode: 'timestamp' }).notNull(),
	modified: integer('modified', { mode: 'timestamp' }).notNull(),
});

// Use this table to derive a type of users that have been synced
const __syncedUsers = sqliteTable('some-imaginary-table', {
	email: text('email').primaryKey(),
	gToken: text('g_token', { mode: 'json' }).$type<GTokenRestrictedT>().notNull(),
	nToken: text('n_token', { mode: 'json' }).$type<NTokenResponseT>().notNull(),
	tasklistId: text('tasklist_id').notNull(),
	databaseId: text('database_id').notNull(),
	mapping: text('mapping', { mode: 'json' })
		.$type<[GTaskIdT, NTaskIdT, CompletedAtT?][]>()
		.notNull(),
	lastSynced: integer('last_synced', { mode: 'timestamp' }).notNull(), // Important to recognize that sync was established successfully
	setupCompletionPromptSent: integer('setup_completion_prompt_sent', { mode: 'boolean' }),
	setupCompletionPromptSentDate: integer('setup_completion_prompt_sent_date', {
		mode: 'timestamp',
	}),
	syncError: text('sync_error', { mode: 'json' }).$type<{
		message: string;
		num: number;
		nextRetry: number | null;
		sentEmail: boolean;
	}>(),
	created: integer('created', { mode: 'timestamp' }).notNull(),
	modified: integer('modified', { mode: 'timestamp' }).notNull(),
});

export type UserT = typeof users.$inferInsert;
export type UserSyncedT = typeof __syncedUsers.$inferInsert;
