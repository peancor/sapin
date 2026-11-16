import prettier from 'eslint-config-prettier';
import js from '@eslint/js';
import { includeIgnoreFile } from '@eslint/compat';
import { defineConfig } from 'eslint/config';
import svelte from 'eslint-plugin-svelte';
import globals from 'globals';
import { fileURLToPath } from 'node:url';
import ts from 'typescript-eslint';
import svelteConfig from './svelte.config.js';

const gitignorePath = fileURLToPath(new URL('./.gitignore', import.meta.url));

export default defineConfig(
	includeIgnoreFile(gitignorePath),
	{
		// Paraglide se regenera en cada build; `.claude/` contiene estado local y worktrees completos
		ignores: ['src/lib/paraglide/**', 'project.inlang/cache/**', '.claude/**']
	},
	js.configs.recommended,
	ts.configs.recommended,
	svelte.configs.recommended,
	prettier,
	svelte.configs.prettier,
	{
		languageOptions: {
			globals: {
				...globals.browser,
				...globals.node
			}
		},
		rules: {
			// TypeScript ya detecta identificadores no definidos; `no-undef` da falsos positivos con tipos
			'no-undef': 'off'
		}
	},
	{
		// Los módulos con runas (`*.svelte.ts`) también necesitan el parser de TypeScript
		files: ['**/*.svelte', '**/*.svelte.ts', '**/*.svelte.js'],
		languageOptions: {
			parserOptions: {
				extraFileExtensions: ['.svelte'],
				parser: ts.parser,
				// Permite a las reglas de Svelte conocer la configuración real (runas, alias, Kit)
				svelteConfig
			}
		}
	}
);
