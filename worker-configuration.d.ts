interface Env {
	GOOGLE_CLIENT_ID: string;
	GOOGLE_CLIENT_SECRET: string;
	MAILJET_API_KEY: string;
	MAILJET_SECRET_KEY: string;
	SENTRY_DSN: string;
	QUEUE: Queue;
	DB: D1Database;
	ENVIRONMENT: 'development' | undefined;
}
