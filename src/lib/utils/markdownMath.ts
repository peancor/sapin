import { marked } from 'marked';
import markedKatex from 'marked-katex-extension';
import { preprocessMathExpressions } from './mathPreprocessor';

let mathMarkdownConfigured = false;

function stripAgentInternalMarkers(content: string): string {
	return content
		.replace(/\[\[DONE\]\]/g, '')
		.replace(/\[\[CONTEXTO_RAG\]\][\s\S]*?\[\[FIN_CONTEXTO_RAG\]\]/g, '');
}

export function ensureMathMarkdownConfigured(): void {
	if (mathMarkdownConfigured) return;

	marked.use(markedKatex({ throwOnError: false, nonStandard: true }));
	mathMarkdownConfigured = true;
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

	ensureMathMarkdownConfigured();

	let processed = content ?? '';
	if (stripAgentMarkers) {
		processed = stripAgentInternalMarkers(processed);
	}

	processed = preprocessMathExpressions(processed.trim());

	return inline ? (marked.parseInline(processed) as string) : (marked.parse(processed) as string);
}
