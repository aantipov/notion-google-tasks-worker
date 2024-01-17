import { drizzle } from 'drizzle-orm/d1';
import { and, eq, inArray, isNull, lte } from 'drizzle-orm';
import { users } from '@/schema';

interface MailjetResponseT {
	Messages: {
		Status: 'success' | 'error';
		Errors: any[];
		To: { Email: string }[];
	}[];
}

/**
 * Send emails to users who haven't been synced
 * and prompt them to finish the setup
 */
export default async function sendSetupCompletionPrompt(env: Env): Promise<void> {
	console.log('Sending emails to almost users');
	const db = drizzle(env.DB, { logger: true });
	const dayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);
	let emails: string[];

	// Fetch emails from DB
	try {
		const usersData = await db
			.select({ email: users.email })
			.from(users)
			.where(
				and(
					isNull(users.lastSynced),
					isNull(users.setupCompletionPromptSent),
					lte(users.created, dayAgo)
				)
			);
		emails = usersData.map(({ email }) => email);
	} catch (error) {
		console.error('Failed fetching users data', error);
		throw new Error('Failed fetching users data', { cause: error });
	}

	console.log('Users fetched:', emails);

	// Update DB - set setupCompletionPromptSent to true
	try {
		await db
			.update(users)
			.set({ setupCompletionPromptSent: true, setupCompletionPromptSentDate: new Date() })
			.where(inArray(users.email, emails));
	} catch (error) {
		console.error('Error updating users data', error);
		throw new Error('Error updating users data', { cause: error });
	}

	// Send emails - prompts to finish setup
	try {
		await sendEmails(emails, env);
	} catch (error) {
		console.error('Error sending emails', error);
		throw new Error('Error sending emails', { cause: error });
	}
}

async function sendEmails(emails: string[], env: Env): Promise<void> {
	// Use Mailjet API to send emails
	// https://dev.mailjet.com/email/guides/send-api-v31/
	const mailjetUrl = 'https://api.mailjet.com/v3.1/send';
	const emailData = {
		Globals: {
			CustomCampaign: 'Complete Setup',
			DeduplicateCampaign: true,
			TemplateID: 5536285,
		},
		Messages: emails.map((Email) => ({
			To: [{ Email }],
		})),
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
