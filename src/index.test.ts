import { unstable_dev } from 'wrangler';
import type { UnstableDevWorker } from 'wrangler';
import { describe, beforeAll, afterAll, it, expect } from 'vitest';

describe('Test D1', () => {
	let worker: UnstableDevWorker;

	beforeAll(async () => {
		worker = await unstable_dev('src/index.ts', {
			experimental: { disableExperimentalWarning: true },
		});
	});

	afterAll(async () => {
		await worker.stop();
	});

	it('should return an array of users for sync', async () => {
		const expectedResults = [{ email: 'two@example.com' }, { email: 'three@example.com' }];
		const resp = await worker.fetch('/users-for-sync');
		if (resp) {
			expect(resp.status).toBe(200);
			const data = await resp.json();
			expect(data).toMatchObject(expectedResults);
		}
	});
});
