export const GOOGLE_TOKEN_URI = 'https://oauth2.googleapis.com/token';
// TODO: make the max tasks limit smaller before going to production
export const GOOGLE_MAX_TASKS = 100; // Google Tasks API returns max 100 tasks per request. Default is 20
export const COMPLETION_MAP_TIMEOUT_DAYS = 7; // Days since a task was completed in Google/Notion after which it the mapping should be removed (to keep only active tasks there)
