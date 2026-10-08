import { defineConfig } from '@playwright/test';

export default defineConfig({
	testDir: './tests/e2e',
	fullyParallel: false,
	workers: 1,
	timeout: 90_000,
	expect: { timeout: 15_000 },
	outputDir: 'output/e2e/results',
	reporter: [['list'], ['html', { outputFolder: 'output/e2e/report', open: 'never' }]],
	use: {
		baseURL: 'http://127.0.0.1:4187',
		browserName: 'chromium',
		trace: 'retain-on-failure',
		screenshot: 'only-on-failure'
	},
	webServer: {
		command: 'node scripts/e2e-server.mjs',
		url: 'http://127.0.0.1:4187/login',
		reuseExistingServer: false,
		timeout: 300_000
	}
});
