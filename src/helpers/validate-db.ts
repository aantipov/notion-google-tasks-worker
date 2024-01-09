import { z } from 'zod';

const DONE = 'Done' as const;
const TODO = 'To Do' as const;

const DbPropsSchema = z.object({
	title: z.object({
		id: z.string(),
		name: z.string(),
		type: z.literal('title'),
	}),
	status: z.object({
		id: z.string(),
		name: z.string(),
		type: z.literal('status'), // TODO: ensure Status prop has proper values
		status: z.object({
			options: z
				.array(
					z.object({
						id: z.string(),
						name: z.string(),
						color: z.string(),
					})
				)
				.refine((arr) => arr.some((opt) => opt.name === DONE), {
					message: 'status_done_or_todo',
				})
				.refine((arr) => arr.some((opt) => opt.name === TODO), {
					message: 'status_done_or_todo',
				}),
		}),
	}),
	due: z.object({
		id: z.string(),
		name: z.string(),
		type: z.literal('date'),
	}),
	lastEdited: z.object({
		id: z.string(),
		name: z.string(),
		type: z.literal('last_edited_time'),
	}),
	lastEditedBy: z.object({
		id: z.string(),
		name: z.string(),
		type: z.literal('last_edited_by'),
	}),
});

export function validateDbBSchema(dbSchema: any) {
	const props = Object.values(dbSchema.properties);

	const nPropsMap = {
		title: props.find((p: any) => p.type === 'title'),
		status: props.find((p: any) => p.type === 'status'),
		due: props.find((p: any) => p.type === 'date'),
		lastEdited: props.find((p: any) => p.type === 'last_edited_time'),
		lastEditedBy: props.find((p: any) => p.type === 'last_edited_by'),
	};

	const parseRes = DbPropsSchema.safeParse(nPropsMap);

	return parseRes.success ? { success: true } : { success: false, issues: parseRes.error.issues };
}
