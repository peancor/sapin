<script lang="ts">
	import katex from 'katex';
	import 'katex/dist/katex.min.css';
	import { preprocessMathExpressions } from '$lib/utils/mathPreprocessor';

	let { text }: { text: string } = $props();

	// Only the math renderer creates markup; student/model text stays in text nodes.
	function renderText(value: string) {
		return (node: HTMLDivElement) => {
			node.replaceChildren();
			const normalized = preprocessMathExpressions(value);
			const pattern = /\$\$([\s\S]+?)\$\$|(?<!\\)\$([^$\n]+?)(?<!\\)\$/g;
			let cursor = 0;
			for (const match of normalized.matchAll(pattern)) {
				node.append(document.createTextNode(normalized.slice(cursor, match.index)));
				const math = document.createElement('span');
				try {
					katex.render(match[1] ?? match[2], math, {
						displayMode: match[1] !== undefined,
						throwOnError: false,
						trust: false,
						strict: 'ignore',
						maxExpand: 1000
					});
				} catch {
					math.textContent = match[0];
				}
				node.append(math);
				cursor = (match.index ?? 0) + match[0].length;
			}
			node.append(document.createTextNode(normalized.slice(cursor)));
		};
	}
</script>

<div
	class="min-w-0 overflow-x-auto leading-relaxed break-words whitespace-pre-wrap"
	{@attach renderText(text)}
></div>
