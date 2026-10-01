import { pathToFileURL } from 'node:url';
import { fileURLToPath } from 'node:url';
import { existsSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';

function resolveFileCandidate(candidate) {
	if (existsSync(candidate) && statSync(candidate).isFile()) {
		return candidate;
	}

	for (const extension of ['.ts', '.js', '.mjs', '.svelte']) {
		const fileCandidate = `${candidate}${extension}`;
		if (existsSync(fileCandidate) && statSync(fileCandidate).isFile()) {
			return fileCandidate;
		}
	}

	for (const indexFile of ['index.ts', 'index.js', 'index.mjs']) {
		const indexCandidate = path.join(candidate, indexFile);
		if (existsSync(indexCandidate) && statSync(indexCandidate).isFile()) {
			return indexCandidate;
		}
	}

	return null;
}

function resolveTsUrl(specifier, parentURL) {
	if (!parentURL) {
		return null;
	}

	if (!specifier.startsWith('.') && !path.isAbsolute(specifier)) {
		return null;
	}

	const parentPath = fileURLToPath(parentURL);
	const basePath = path.isAbsolute(specifier)
		? specifier
		: path.resolve(path.dirname(parentPath), specifier);
	const candidate = resolveFileCandidate(basePath);

	return candidate ? pathToFileURL(candidate).href : null;
}

function moduleUrl(source) {
	return `data:text/javascript,${encodeURIComponent(source)}`;
}

export async function resolve(specifier, context, nextResolve) {
	if (specifier === '$env/dynamic/private' || specifier === '$env/dynamic/public') {
		return {
			shortCircuit: true,
			url: moduleUrl(`
				const defaults = {
					DATABASE_URL: 'local.db',
					SECRET_KEY: '0000000000000000000000000000000000000000000000000000000000000000'
				};
				export const env = new Proxy(process.env, {
					get(target, property) {
						return target[property] ?? defaults[property] ?? '';
					}
				});
			`)
		};
	}

	if (specifier === '$env/static/private') {
		return {
			shortCircuit: true,
			url: moduleUrl(`
				export const DATABASE_URL = process.env.DATABASE_URL ?? 'local.db';
				export const ORIGIN = process.env.ORIGIN ?? '';
				export const MODERATE_PROMPTS = process.env.MODERATE_PROMPTS ?? '';
				export const ENABLE_TELEGRAM_NOTIFICATIONS = process.env.ENABLE_TELEGRAM_NOTIFICATIONS ?? '';
				export const TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN ?? '';
				export const TELEGRAM_CHAT_ID = process.env.TELEGRAM_CHAT_ID ?? '';
				export const EMBEDDINGS_OPENROUTER_API_KEY = process.env.EMBEDDINGS_OPENROUTER_API_KEY ?? '';
				export const OPENAI_MODERATION_API_KEY = process.env.OPENAI_MODERATION_API_KEY ?? '';
				export const SECRET_KEY = process.env.SECRET_KEY ?? '0000000000000000000000000000000000000000000000000000000000000000';
			`)
		};
	}

	if (specifier === '$app/environment') {
		return {
			shortCircuit: true,
			url: moduleUrl(
				"export const browser = false; export const building = false; export const dev = true; export const version = 'test';"
			)
		};
	}

	if (specifier === '$app/paths') {
		return {
			shortCircuit: true,
			url: moduleUrl(
				"export const base = ''; export const assets = ''; export function resolve(path) { return path; }"
			)
		};
	}

	if (specifier.endsWith('?raw')) {
		const rawSpecifier = specifier.slice(0, -4);
		const parentPath = context.parentURL ? fileURLToPath(context.parentURL) : process.cwd();
		const rawPath = rawSpecifier.startsWith('$lib/')
			? path.resolve(process.cwd(), 'src', 'lib', rawSpecifier.slice(5))
			: rawSpecifier.startsWith('.') || path.isAbsolute(rawSpecifier)
				? path.resolve(path.dirname(parentPath), rawSpecifier)
				: path.resolve(process.cwd(), rawSpecifier);
		const resolved = resolveFileCandidate(rawPath);

		if (resolved) {
			return {
				shortCircuit: true,
				url: moduleUrl(`export default ${JSON.stringify(readFileSync(resolved, 'utf8'))};`)
			};
		}
	}

	if (specifier === '$lib') {
		return {
			shortCircuit: true,
			url: pathToFileURL(path.join(process.cwd(), 'src', 'lib', 'index.ts')).href
		};
	}

	if (specifier.startsWith('$lib/')) {
		const candidate = path.join(process.cwd(), 'src', 'lib', specifier.slice(5));
		const resolved = resolveFileCandidate(candidate);
		return {
			shortCircuit: true,
			url: pathToFileURL(resolved ?? candidate).href
		};
	}

	const tsUrl = resolveTsUrl(specifier, context.parentURL);
	if (tsUrl) {
		return {
			shortCircuit: true,
			url: tsUrl
		};
	}

	return nextResolve(specifier, context);
}

export async function load(url, context, nextLoad) {
	if (url.endsWith('.svelte')) {
		return {
			format: 'module',
			shortCircuit: true,
			source: 'export default class SvelteComponentStub {}'
		};
	}

	if (url.includes('?raw')) {
		const rawUrl = new URL(url);
		const rawPath = fileURLToPath(rawUrl);
		return {
			format: 'module',
			shortCircuit: true,
			source: `export default ${JSON.stringify(readFileSync(rawPath, 'utf8'))};`
		};
	}

	const result = await nextLoad(url, context);
	if (url.endsWith('.ts')) {
		const source = String(result.source ?? readFileSync(fileURLToPath(url), 'utf8'));
		if (source.includes('import.meta.glob')) {
			return {
				...result,
				source: source.replace(/import\.meta\.glob\([^)]*\)/g, '({})')
			};
		}
	}

	return result;
}
