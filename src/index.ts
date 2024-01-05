import { drizzle } from 'drizzle-orm/d1';
import { and, isNotNull, lte } from 'drizzle-orm';
import { users } from '@/schema';
import { syncUser } from './helpers/sync.js';
const BATCH_SIZE = 100; // CF limit

const handler: ExportedHandler<Env, string> = {
	/**
	 * CRON job: fetch users from DB and send them to the Queue
	 * It fetches users with  successfully established sync (lastSynced is not null)
	 * who have been synced more than 5 minutes ago and
	 */
	async scheduled(event, env, ctx) {
		console.log('CRON job started', event.cron);
		switch (event.cron) {
			case '* * * * *':
				ctx.waitUntil(handleScheduledSync(env));
				break;
			case '0 8 * * *': // Every day at 8:00 AM
				ctx.waitUntil(handleScheduledSendAlmostUsers(env));
				break;
		}
		console.log('CRON job finished');
	},

	/**
	 * Consumer: process messages (emails) from the queue feeded by the scheduled task
	 * Sync user's Google Tasks with Notion.
	 */
	async queue(batch, env, ctx) {
		// There is only one message in the batch because we set "max_batch_size" to 1 in the wrangler.toml config
		ctx.waitUntil(handleQueue(batch.messages[0].body, env));
	},
};

export default handler;

/**
 * Send emails to users who haven't been synced for 24 hours
 * and ask them if they need help
 */
async function handleScheduledSendAlmostUsers(env: Env): Promise<void> {
	console.log('Sending emails to almost users');
	// TODO: fetch emails from DB
	const emails = ['alexey@notion-google-tasks-sync.com'];
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
	console.log('Mailjet response', response);
}

async function handleScheduledSync(env: Env): Promise<void> {
	const db = drizzle(env.DB, { logger: true });
	const fiveMinAgo = new Date(Date.now() - 5 * 60 * 1000);
	let usersData: { email: string }[];

	try {
		usersData = await db
			.select({ email: users.email })
			.from(users)
			.where(and(isNotNull(users.lastSynced), lte(users.lastSynced, fiveMinAgo)));
		console.log('Users fetched:', usersData.length);
	} catch (error) {
		console.error('Error fetching users data', error);
		throw new Error('Error fetching users data', { cause: error });
	}

	try {
		const emails = usersData.map(({ email }) => email);
		const emailsBatches = splitEmailsIntoBatches(emails);
		for (const emailBatch of emailsBatches) {
			const queueBatch = emailBatch.map((email) => ({ body: email }));
			await env.QUEUE.sendBatch(queueBatch);
		}
	} catch (error) {
		console.error('Error sending batch', error);
		throw new Error('Error sending batch', { cause: error });
	}
}

function splitEmailsIntoBatches(emails: string[]): string[][] {
	let result = [];
	for (let i = 0; i < emails.length; i += BATCH_SIZE) {
		let chunk = emails.slice(i, i + BATCH_SIZE);
		result.push(chunk);
	}
	return result;
}

/**
 * If the function throws, the message won't be re-queued and retried
 * because we set "max_retries" to 0 in the wrangler.toml config.
 * We don't need retries because we depend on lastSynced timestamp in our DB
 * The return value is ignored: it should return either a value or a promise.
 */
async function handleQueue(email: string, env: Env) {
	try {
		await syncUser(email, env);
		console.log('User synced successfully');
	} catch (error) {
		console.error('Error handling queue', error);
		throw new Error('Error handling queue', { cause: error });
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
