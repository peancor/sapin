import { mkdtempSync, mkdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { spawn, spawnSync } from 'node:child_process';
import { createServer } from 'node:http';

// Always create a fresh database: never accept the user's DATABASE_URL.
mkdirSync('output/e2e', { recursive: true });
const root = mkdtempSync(resolve('output/e2e/run-'));
const env = {
	...process.env,
	NODE_ENV: 'test',
	HOST: '127.0.0.1',
	PORT: '4187',
	DATABASE_URL: resolve(root, 'test.db'),
	ORIGIN: 'http://127.0.0.1:4187',
	SECRET_KEY: '0'.repeat(64),
	PUBLIC_TURNSTILE_SITE_KEY: '',
	TURNSTILE_SECRET_KEY: '',
	MODERATE_PROMPTS: 'false',
	ENABLE_TELEGRAM_NOTIFICATIONS: 'false',
	TELEGRAM_BOT_TOKEN: '',
	TELEGRAM_CHAT_ID: '',
	EMBEDDINGS_OPENROUTER_API_KEY: '',
	OPENAI_MODERATION_API_KEY: '',
	QDRANT_URL: 'http://127.0.0.1:1',
	QDRANT_API_KEY: '',
	FILES_STORAGE_PATH: resolve(root, 'files'),
	FILES_TEMP_PATH: resolve(root, 'temp'),
	FILES_DELETED_PATH: resolve(root, 'deleted')
};
const seed = spawnSync(
	process.execPath,
	['--import', './scripts/node-test-register.mjs', 'scripts/e2e-seed.ts', env.DATABASE_URL],
	{ env, stdio: 'inherit' }
);
if (seed.status !== 0) process.exit(seed.status || 1);
const build = spawnSync(
	process.execPath,
	['node_modules/vite/bin/vite.js', 'build', '--mode', 'test'],
	{ env: { ...env, NODE_ENV: 'production' }, stdio: 'inherit' }
);
if (build.status !== 0) process.exit(build.status || 1);

// Read-only Qdrant fixture for the library UI. No indexing or external service is involved.
const qdrant = createServer((request, response) => {
	response.setHeader('Content-Type', 'application/json');
	if (request.method === 'GET' && request.url === '/') {
		response.end(JSON.stringify({ title: 'qdrant', version: '1.18.0' }));
	} else if (request.method === 'GET' && request.url === '/collections') {
		response.end(JSON.stringify({ result: { collections: [] }, status: 'ok', time: 0 }));
	} else {
		response.writeHead(404);
		response.end(JSON.stringify({ status: { error: 'Not provided by the E2E fixture' } }));
	}
});
await new Promise((ready, reject) => {
	qdrant.once('error', reject);
	qdrant.listen(0, '127.0.0.1', ready);
});
const address = qdrant.address();
if (!address || typeof address === 'string') throw new Error('No fixture port was allocated.');
env.QDRANT_URL = `http://127.0.0.1:${address.port}`;
const server = spawn(process.execPath, ['build/index.js'], { env, stdio: 'inherit' });
for (const signal of ['SIGINT', 'SIGTERM'])
	process.on(signal, () => {
		qdrant.close();
		server.kill(signal);
	});
server.on('exit', (code) => process.exit(code || 0));
