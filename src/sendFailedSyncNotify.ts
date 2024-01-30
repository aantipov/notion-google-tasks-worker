import { DrizzleD1Database, drizzle } from 'drizzle-orm/d1';
import { and, inArray, isNull, isNotNull, sql, gte } from 'drizzle-orm';
import { users } from '@/schema';

interface MailjetResponseT {
	Messages: {
		Status: 'success' | 'error';
		Errors: any[];
		To: { Email: string }[];
	}[];
}

/**
 * Send emails to users who
 * have been synced successfully
 * but sync has stopped working and the number of consecutive errors is more than 6 (~1.5 days)
 */
export default async function sendFailedSyncNotify(env: Env): Promise<void> {
	console.log('Sending emails to users with failed sync');
	const db = drizzle(env.DB, { logger: false });

	const emails = await getEmailsForFailedSyncNotify(db);

	if (emails.length === 0) {
		console.log('No emails to send');
		return;
	}

	await setFailedSyncNotifed(db, emails);

	try {
		await sendEmails(emails, env);
	} catch (error) {
		console.error('Error sending emails', error);
		throw new Error('Error sending emails', { cause: error });
	}
}

export async function getEmailsForFailedSyncNotify(db: DrizzleD1Database): Promise<string[]> {
	try {
		const usersData = await db
			.select({ email: users.email })
			.from(users)
			.where(
				and(
					isNotNull(users.lastSynced),
					isNotNull(users.syncError),
					gte(sql`json_extract(${users.syncError}, '$.num')`, 6),
					isNull(sql`json_extract(${users.syncError}, '$.sentEmail')`)
				)
			);
		const emails = usersData.map(({ email }) => email);
		return emails;
	} catch (error) {
		console.error('Failed to fetch users data', error);
		throw new Error('Failed to fetch users data', { cause: error });
	}
}

export async function setFailedSyncNotifed(db: DrizzleD1Database, emails: string[]) {
	try {
		return await db
			.update(users)
			.set({ syncError: sql.raw("json_set(sync_error, '$.sentEmail', json('true'))") })
			.where(inArray(users.email, emails))
			.returning();
	} catch (error) {
		console.error('Error updating users data', error);
		throw new Error('Error updating users data', { cause: error });
	}
}

async function sendEmails(emails: string[], env: Env): Promise<void> {
	// Use Mailjet API to send emails
	// https://dev.mailjet.com/email/guides/send-api-v31/
	const mailjetUrl = 'https://api.mailjet.com/v3.1/send';
	const emailData = {
		Globals: {
			CustomCampaign: 'Issues with sync',
			DeduplicateCampaign: false,
			TemplateID: 5636036,
		},
		Messages: emails.map((Email) => ({ To: [{ Email }] })),
	};
	const response = await fetch(mailjetUrl, {
		method: 'POST',
		headers: {
			Authorization: 'Basic ' + btoa(`${env.MAILJET_API_KEY}:${env.MAILJET_SECRET_KEY}`),
			'Content-Type': 'application/json',
		},
		body: JSON.stringify(emailData),
	});
	if (!response.ok) {
		throw new Error('Mailjet API error', { cause: response });
	}
	const responseJson = (await response.json()) as MailjetResponseT;

	if (responseJson.Messages.some((msg) => msg.Status !== 'success')) {
		console.error('Mailjet Send error', JSON.stringify(responseJson, null, 2));
		throw new Error('Mailjet Send error');
	}
}
