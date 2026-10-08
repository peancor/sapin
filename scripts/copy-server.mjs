import { copyFile } from 'node:fs/promises';

await copyFile(
	new URL('../myserver.js', import.meta.url),
	new URL('../build/myserver.js', import.meta.url)
);
