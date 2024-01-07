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
		console.error('Error fetching users data', error);
		throw new Error('Error fetching users data', { cause: error });
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
			From: {
				Email: 'alexey@notion-google-tasks-sync.com',
				Name: 'Alexey Antipov',
			},
			Subject: `Just Checking In - How's Your Notion-Google Tasks Setup Going?`,
			TextPart: getTextBody(),
			HTMLPart: getHtmlBody(),
			ReplyTo: {
				Email: 'antipov.alexei@gmail.com',
				Name: 'Alexey Antipov',
			},
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
	console.log('Mailjet Send response', JSON.stringify(responseJson, null, 2));
	if (responseJson.Messages.some((msg) => msg.Status !== 'success')) {
		console.error('Mailjet Send error', JSON.stringify(responseJson, null, 2));
		throw new Error('Mailjet Send error');
	}
}

function getHtmlBody() {
	return `<!DOCTYPE html>
	<html>
	<head>
		<title>Notion-Google Tasks Sync Setup</title>
		<style>
			body {
				font-family: Arial, sans-serif;
				line-height: 1.6;
			}
			.email-container {
				width: 80%;
				margin: 0 auto;
				padding: 20px;
			}
			.signature {
				margin-top: 20px;
			}
			a {
				color: #007bff;
				text-decoration: none;
			}
			a:hover {
				text-decoration: underline;
			}
			.ps {
				margin-top: 10px;
				font-style: italic;
			}
		</style>
	</head>
	<body>
		<div class="email-container">
			<p>Hi there,</p>
	
			<p>I'm Alexey Antipov, the creator behind the Notion-Google Tasks Sync service. I noticed that you started setting up the sync but didn't get a chance to finish it. I wanted to personally check in and see if everything is okay.</p>
	
			<p>Is there something about the connection setup process that's holding you back? I understand these steps can sometimes be a bit tricky. If you're facing any challenges or have questions, I'm here to help. Just hit reply to this email, and I'll do my best to assist you.</p>
	
			<p>I created this service to make task management seamless and stress-free, and I'm really keen to see you get the most out of it. Your feedback and experience are invaluable to me.</p>
	
			<p>Looking forward to hearing from you!</p>
	
			<div class="signature">
				Best,<br>
				Alexey Antipov<br>
				<a href="https://alexei.me/" target="_blank">alexei.me</a>
			</div>
	
			<div class="ps">
				P.S. If you’ve already finished setting up and have started using the service, I’d love to hear about your experience so far!
			</div>
		</div>
	</body>
	</html>
	`;
}

function getTextBody() {
	return `Hi there,


	I'm Alexey Antipov, the creator behind the Notion-Google Tasks Sync service. I noticed that you started setting up the sync but didn't get a chance to finish it. I wanted to personally check in and see if everything is okay.
	
	
	Is there something about the connection setup process that's holding you back? I understand these steps can sometimes be a bit tricky. If you're facing any challenges or have questions, I'm here to help. Just hit reply to this email, and I'll do my best to assist you.
	
	
	I created this service to make task management seamless and stress-free, and I'm really keen to see you get the most out of it. Your feedback and experience are invaluable to me.
	
	
	Looking forward to hearing from you!
	
	
	Best,
	Alexey Antipov
	alexei.me [https://alexei.me/]
	
	
	P.S. If you’ve already finished setting up and have started using the service, I’d love to hear about your experience so far!`;
}
