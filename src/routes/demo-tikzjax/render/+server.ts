import { json, type RequestHandler } from '@sveltejs/kit';
import {
	renderTikzInSubprocess,
	TikzjaxRenderProcessError,
	type TikzjaxRenderOptions
} from '$lib/server/utils/tikzjaxRenderProcess';
import { z } from 'zod';

const requestSchema = z.object({
	source: z.string().min(1)
});

const supportedPackages = new Set([
	'chemfig',
	'tikz-cd',
	'circuitikz',
	'pgfplots',
	'array',
	'amsmath',
	'amstext',
	'amsfonts',
	'amssymb',
	'tikz-3dplot'
]);

const preambleLinePattern = /^\\(?:usepackage|usetikzlibrary|pgfplotsset|ctikzset|tikzset|definecolor|colorlet|def|newcommand|renewcommand|providecommand|input)\b/;
let renderQueue = Promise.resolve();
const tikzjaxRenderOptions: TikzjaxRenderOptions = {
	embedFontCss: true,
	fontCssUrl: '/vendor/node-tikzjax/fonts.css',
	showConsole: false
};

function getDetectedPackages(source: string): string[] {
	return [...source.matchAll(/\\usepackage(?:\[[^\]]*\])?\{([^}]*)\}/g)]
		.flatMap((match) => (match[1] ?? '').split(','))
		.map((name) => name.trim())
		.filter(Boolean);
}

function normalizeSource(source: string): {
	normalizedSource: string;
	notes: string[];
	detectedPackages: string[];
} {
	const trimmedSource = source.trim();
	const notes: string[] = [];

	if (!trimmedSource) {
		throw new Error('Pega una fuente TeX antes de renderizar.');
	}

	const withoutDocumentClass = trimmedSource.replace(/\\documentclass(?:\[[^\]]*\])?\{[^}]*\}\s*/g, '');
	if (withoutDocumentClass !== trimmedSource) {
		notes.push('Se eliminó \\documentclass porque node-tikzjax ya usa standalone internamente.');
	}

	const detectedPackages = [...new Set(getDetectedPackages(withoutDocumentClass))];
	const unsupportedPackages = detectedPackages.filter((pkg) => !supportedPackages.has(pkg));
	if (unsupportedPackages.length) {
		notes.push(`Se detectaron paquetes fuera de la lista documentada: ${unsupportedPackages.join(', ')}.`);
	}

	if (/\\begin\{document\}/.test(withoutDocumentClass)) {
		return {
			normalizedSource: withoutDocumentClass,
			notes,
			detectedPackages
		};
	}

	const lines = withoutDocumentClass.split(/\r?\n/);
	let bodyStartIndex = lines.findIndex((line) => {
		const trimmedLine = line.trim();
		return trimmedLine.length > 0 && !preambleLinePattern.test(trimmedLine);
	});

	if (bodyStartIndex === -1) {
		bodyStartIndex = lines.length;
	}

	const preamble = lines.slice(0, bodyStartIndex).join('\n').trim();
	const body = lines.slice(bodyStartIndex).join('\n').trim();
	const wrappedBody = body || '\\begin{tikzpicture}\n\\end{tikzpicture}';

	notes.push('Se añadió \\begin{document}...\\end{document} automáticamente.');

	return {
		normalizedSource: [preamble, '\\begin{document}', wrappedBody, '\\end{document}']
			.filter(Boolean)
			.join('\n\n'),
		notes,
		detectedPackages
	};
}
async function renderSerially<T>(callback: () => Promise<T>): Promise<T> {
	const previous = renderQueue;
	let release: () => void;
	const next = new Promise<void>((resolve) => {
		release = resolve;
	});
	const run = previous.then(callback);
	renderQueue = run.then(() => next, () => next);

	try {
		return await run;
	} finally {
		release!();
	}
}

export const POST: RequestHandler = async ({ request }) => {
	try {
		const parsedBody = requestSchema.safeParse(await request.json());
		if (!parsedBody.success) {
			return json({ error: 'Payload inválido.' }, { status: 400 });
		}

		const { normalizedSource, notes, detectedPackages } = normalizeSource(parsedBody.data.source);
		const svg = await renderSerially(() => renderTikzInSubprocess(normalizedSource, tikzjaxRenderOptions));

		return json({
			svg,
			normalizedSource,
			notes,
			detectedPackages
		});
	} catch (error) {
		console.error('[demo-tikzjax/render] Error rendering TeX:', error);
		const status = error instanceof TikzjaxRenderProcessError ? error.status : 400;
		const details = error instanceof TikzjaxRenderProcessError ? error.details : undefined;
		return json(
			{
				error: error instanceof Error ? error.message : 'No se pudo renderizar el diagrama.',
				...(details ? { details } : {})
			},
			{ status }
		);
	}
};
