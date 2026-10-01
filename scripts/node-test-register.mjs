import { register } from 'node:module';
import { pathToFileURL, URL } from 'node:url';

register(
	new URL('./node-test-sveltekit-alias-loader.mjs', import.meta.url),
	pathToFileURL(`${process.cwd()}/`)
);
