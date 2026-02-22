import { paraglideVitePlugin } from '@inlang/paraglide-js'
import { sveltekit } from '@sveltejs/kit/vite';
import { defineConfig } from 'vite';
import devtoolsJson from 'vite-plugin-devtools-json';
import tailwindcss from '@tailwindcss/vite';

export default defineConfig({
	plugins: [
		paraglideVitePlugin({
			project: './project.inlang',
			outdir: './src/lib/paraglide',
			strategy: ['url', 'cookie', 'baseLocale']
		}),
		tailwindcss(),
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
