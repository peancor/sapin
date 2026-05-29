import { Marked } from 'marked';
import markedKatex from 'marked-katex-extension';
import { preprocessMathExpressions } from './mathPreprocessor';

let mathMarkdownRenderer: Marked | null = null;

function stripAgentInternalMarkers(content: string): string {
	return content
		.replace(/\[\[DONE\]\]/g, '')
		.replace(/\[\[CONTEXTO_RAG\]\][\s\S]*?\[\[FIN_CONTEXTO_RAG\]\]/g, '');
}

export function ensureMathMarkdownConfigured(): Marked {
	if (mathMarkdownRenderer) return mathMarkdownRenderer;

	mathMarkdownRenderer = new Marked(markedKatex({ throwOnError: false, nonStandard: true }));
	return mathMarkdownRenderer;
}

interface RenderMarkdownMathOptions {
	inline?: boolean;
	stripAgentMarkers?: boolean;
}

export function renderMarkdownMath(
	content: string | null | undefined,
	options: RenderMarkdownMathOptions = {}
): string {
	const { inline = false, stripAgentMarkers = false } = options;

	const renderer = ensureMathMarkdownConfigured();

	let processed = content ?? '';
	if (stripAgentMarkers) {
		processed = stripAgentInternalMarkers(processed);
	}

	processed = preprocessMathExpressions(processed.trim());

	return inline
		? (renderer.parseInline(processed) as string)
		: (renderer.parse(processed) as string);
}
