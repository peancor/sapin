import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { normalizePath } from 'vite';
import { paraglideVitePlugin } from '@inlang/paraglide-js'
import { sveltekit } from '@sveltejs/kit/vite';
import { defineConfig } from 'vite';
import devtoolsJson from 'vite-plugin-devtools-json';
import { viteStaticCopy } from 'vite-plugin-static-copy';
import tailwindcss from '@tailwindcss/vite';
import { prepareTikzjaxBrowserRuntimeAssets } from './scripts/prepare-tikzjax-browser-tex-files.mjs';

const generatedTikzjaxBrowserRuntimeDir = prepareTikzjaxBrowserRuntimeAssets();
const tikzjaxRuntimeVersion = createHash('sha1')
	.update(readFileSync(`${generatedTikzjaxBrowserRuntimeDir}/.prepared.json`, 'utf8'))
	.digest('hex')
	.slice(0, 8);
const tikzjaxRuntimePublicDir = `vendor/tikzjax-${tikzjaxRuntimeVersion}`;

export default defineConfig({
	define: {
		'globalThis.__TIKZJAX_RUNTIME_PUBLIC_DIR__': JSON.stringify(tikzjaxRuntimePublicDir)
	},
	plugins: [
		paraglideVitePlugin({
			project: './project.inlang',
			outdir: './src/lib/paraglide',
			strategy: ['url', 'cookie', 'baseLocale']
		}),
		tailwindcss(),
		viteStaticCopy({
			targets: [
				{
					src: `${normalizePath(generatedTikzjaxBrowserRuntimeDir)}/**/*`,
					dest: tikzjaxRuntimePublicDir
				},
				{
					src: 'node_modules/node-tikzjax/css/**/*',
					dest: 'vendor/node-tikzjax'
				}
			]
		}),
		sveltekit(),
		devtoolsJson(),
	],
	css: {
		// Make sure there is no 'postcss' section configured for Tailwind integration here.
		// If a 'postcss' section exists (e.g., added by the CLI or for other plugins like Autoprefixer),
		// ensure it does NOT include the Tailwind CSS plugin.
		// postcss: { plugins: [] },

		// A community recommendation (might help with Vite plugin issues):
		// transformer: 'lightningcss'
	},
});
