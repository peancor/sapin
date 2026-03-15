import { tikzBrowserSupportedPackages } from '$lib/constants/tikzExamples';
import type { TikzjaxBrowserPrepareInput, TikzjaxBrowserPreparedDiagram } from '$lib/types/tikzjax';

const preambleLinePattern =
	/^\\(?:documentclass|usepackage|usetikzlibrary|pgfplotsset|ctikzset|tikzset|definecolor|colorlet|def|newcommand|renewcommand|providecommand)\b/;

const forbiddenCommands = [
	{
		pattern: /\\(?:write18|openout|openin|read)\b/,
		message: 'La fuente TikZ no puede usar comandos de lectura/escritura del sistema.'
	},
	{
		pattern: /\\(?:includegraphics|includesvg)\b/,
		message: 'La fuente TikZ no puede depender de recursos gráficos externos.'
	},
	{
		pattern: /\\(?:input|include)\b/,
		message: 'La fuente TikZ no puede depender de archivos TeX externos.'
	}
] as const;

export function splitCommaSeparatedList(value: string): string[] {
	return value
		.split(',')
		.map((item) => item.trim())
		.filter(Boolean);
}

function unique(items: string[]): string[] {
	return [...new Set(items)];
}

function extractPackagesFromPreamble(preamble: string): Record<string, string> {
	const packages: Record<string, string> = {};

	for (const match of preamble.matchAll(/\\usepackage(?:\[([^\]]*)\])?\{([^}]*)\}/g)) {
		const packageOptions = match[1] ?? '';
		const packageNames = splitCommaSeparatedList(match[2] ?? '');

		for (const packageName of packageNames) {
			packages[packageName] = packageOptions;
		}
	}

	return packages;
}

function extractTikzLibrariesFromPreamble(preamble: string): string[] {
	const libraries: string[] = [];

	for (const match of preamble.matchAll(/\\usetikzlibrary\{([^}]*)\}/g)) {
		libraries.push(...splitCommaSeparatedList(match[1] ?? ''));
	}

	return unique(libraries);
}

function cleanPreamble(preamble: string): string {
	return preamble
		.replace(/\\documentclass(?:\[[^\]]*\])?\{[^}]*\}/g, '')
		.replace(/\\usepackage(?:\[[^\]]*\])?\{[^}]*\}/g, '')
		.replace(/\\usetikzlibrary\{[^}]*\}/g, '')
		.replace(/^[\t ]*$/gm, '')
		.trim();
}

function stringifyPackagesMap(packages: Record<string, string>): string {
	const entries = Object.entries(packages);

	if (!entries.length) {
		return '';
	}

	return JSON.stringify(Object.fromEntries(entries), null, 2);
}

function splitPreambleAndBody(source: string): {
	preamble: string;
	body: string;
} {
	const lines = source.split(/\r?\n/);
	let bodyStartIndex = lines.findIndex((line) => {
		const trimmedLine = line.trim();
		return trimmedLine.length > 0 && !preambleLinePattern.test(trimmedLine);
	});

	if (bodyStartIndex === -1) {
		bodyStartIndex = lines.length;
	}

	return {
		preamble: lines.slice(0, bodyStartIndex).join('\n').trim(),
		body: lines.slice(bodyStartIndex).join('\n').trim()
	};
}

function assertNoForbiddenCommands(source: string) {
	for (const rule of forbiddenCommands) {
		if (rule.pattern.test(source)) {
			throw new Error(rule.message);
		}
	}
}

export function prepareTikzjaxBrowserDiagram(
	input: TikzjaxBrowserPrepareInput
): TikzjaxBrowserPreparedDiagram {
	const rawSource = input.source.trim();

	if (!rawSource) {
		throw new Error('Pega una fuente TikZ o TeX antes de renderizar.');
	}

	assertNoForbiddenCommands(rawSource);

	let normalizedSource = rawSource;
	let detectedPackages: Record<string, string> = {};
	let detectedLibraries: string[] = [];
	let detectedPreamble = '';
	const notes: string[] = [];

	const documentMatch = rawSource.match(/([\s\S]*?)\\begin\{document\}([\s\S]*?)\\end\{document\}/);

	if (documentMatch) {
		const preamble = (documentMatch[1] ?? '').trim();
		normalizedSource = (documentMatch[2] ?? '').trim();
		detectedPackages = extractPackagesFromPreamble(preamble);
		detectedLibraries = extractTikzLibrariesFromPreamble(preamble);
		detectedPreamble = cleanPreamble(preamble);
		notes.push(
			'Se extrajo el contenido de \\begin{document}...\\end{document} para adaptarlo al runtime del navegador.'
		);
	} else {
		const { preamble, body } = splitPreambleAndBody(rawSource);

		if (preamble) {
			normalizedSource = body || normalizedSource;
			detectedPackages = extractPackagesFromPreamble(preamble);
			detectedLibraries = extractTikzLibrariesFromPreamble(preamble);
			detectedPreamble = cleanPreamble(preamble);
			notes.push('Se extrajeron instrucciones de preámbulo iniciales sin necesidad de \\begin{document}.');
		}
	}

	if (!normalizedSource.trim()) {
		throw new Error('La fuente TikZ no contiene cuerpo renderizable tras normalizar el documento.');
	}

	const manualPackages = unique((input.texPackages ?? []).map((item) => item.trim()).filter(Boolean));
	const manualLibraries = unique((input.tikzLibraries ?? []).map((item) => item.trim()).filter(Boolean));
	const mergedPackages = {
		...detectedPackages,
		...Object.fromEntries(manualPackages.map((packageName) => [packageName, '']))
	};
	const mergedLibraries = unique([...detectedLibraries, ...manualLibraries]);
	const mergedPreamble = [detectedPreamble, input.addToPreamble?.trim()].filter(Boolean).join('\n');

	const detectedPackageNames = Object.keys(detectedPackages);
	const unsupportedPackages = Object.keys(mergedPackages).filter(
		(packageName) =>
			!tikzBrowserSupportedPackages.includes(
				packageName as (typeof tikzBrowserSupportedPackages)[number]
			)
	);

	if (detectedPackageNames.length) {
		notes.push(`Paquetes detectados: ${detectedPackageNames.join(', ')}.`);
	}

	if (manualPackages.length) {
		notes.push(`Paquetes añadidos manualmente: ${manualPackages.join(', ')}.`);
	}

	if (detectedLibraries.length) {
		notes.push(`Librerías detectadas: ${detectedLibraries.join(', ')}.`);
	}

	if (manualLibraries.length) {
		notes.push(`Librerías añadidas manualmente: ${manualLibraries.join(', ')}.`);
	}

	if (unsupportedPackages.length) {
		throw new Error(
			`TikZJax en navegador no soporta estos paquetes: ${unsupportedPackages.join(', ')}.`
		);
	}

	return {
		request: {
			source: normalizedSource,
			texPackagesJson: stringifyPackagesMap(mergedPackages),
			tikzLibraries: mergedLibraries.join(', '),
			addToPreamble: mergedPreamble,
			showConsole: input.showConsole ?? true,
			disableCache: input.disableCache ?? true,
			ariaLabel: input.ariaLabel?.trim() || 'Diagrama renderizado por TikZJax en el navegador',
			width: input.width?.trim() || '420',
			height: input.height?.trim() || '240'
		},
		normalizedSource,
		normalizationNotes: notes,
		detectedPackages: Object.keys(mergedPackages),
		detectedLibraries: mergedLibraries,
		unsupportedPackages
	};
}
