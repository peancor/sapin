<script lang="ts">
	import { onMount } from 'svelte';
	import SafeHtml from '$lib/components/SafeHtml.svelte';
	import AgentToolActivity from '$lib/components/agent/AgentToolActivity.svelte';
	import type { AgentDisplayMessage } from '$lib/types/agent';
	import { renderMarkdownMath } from '$lib/utils';
	import { renderInteractiveMessage } from '$lib/utils/markdownMath';
	import * as m from '$lib/paraglide/messages';
	import { getLocale } from '$lib/paraglide/runtime';
	import 'katex/dist/katex.min.css';
	import TranscriptActivity from './TranscriptActivity.svelte';

	let {
		title,
		createdAt,
		messages,
		classic = false
	}: {
		title: string;
		createdAt: Date;
		messages: AgentDisplayMessage[];
		classic?: boolean;
	} = $props();
	let hydrated = $state(false);
	onMount(() => {
		hydrated = true;
	});
	const formatTime = (date: Date) =>
		date.toLocaleString(getLocale(), { dateStyle: 'medium', timeStyle: 'short' });
</script>

<article data-conversation-transcript data-hydrated={hydrated} class="transcript">
	<header class="transcript-heading">
		<h1>{title}</h1>
		<time datetime={createdAt.toISOString()}>{formatTime(createdAt)}</time>
	</header>
	{#each messages as message (message.id)}
		<section class="turn" class:textOnly={message.parts.every((part) => part.kind === 'text')}>
			<header class="byline">
				<h2>{message.role === 'user' ? m.transcript_student() : m.transcript_assistant()}</h2>
				<time datetime={message.createdAt.toISOString()}>{formatTime(message.createdAt)}</time>
			</header>
			{#each message.parts as part, i (`${message.id}-${i}`)}
				{#if part.kind === 'text'}
					<div class="prose prose-sm max-w-none">
						<SafeHtml
							html={classic
								? renderInteractiveMessage(part.content, message.role === 'user')
								: renderMarkdownMath(part.content, { stripAgentMarkers: true })}
						/>
					</div>
				{:else if part.kind === 'image'}
					<figure>
						<img src={part.url} alt={part.displayName ?? m.transcript_image()} />
						{#if part.displayName}<figcaption>{part.displayName}</figcaption>{/if}
					</figure>
				{:else if part.kind === 'ui-component'}
					<TranscriptActivity {part} />
				{/if}
			{/each}
			<AgentToolActivity parts={message.parts} expanded />
		</section>
	{:else}
		<p>{m.transcript_empty()}</p>
	{/each}
</article>

<style>
	.transcript {
		color-scheme: light;
		color: #182e3a;
		background: #fff;
		margin-inline: auto;
		width: 100%;
		max-width: 53rem;
		padding: clamp(1rem, 3vw, 2rem);
		line-height: 1.5;
		overflow-wrap: anywhere;
	}
	.transcript-heading {
		padding-bottom: 1rem;
		border-bottom: 2px solid #1f6354;
	}
	h1 {
		font-weight: 700;
		font-size: 1.65rem;
		line-height: 1.15;
		margin-bottom: 0.35rem;
	}
	.turn {
		border-bottom: 1px solid #d6dfdf;
		padding: 1rem 0;
	}
	.byline {
		display: flex;
		align-items: baseline;
		flex-wrap: wrap;
		gap: 0.75rem;
		margin-bottom: 0.5rem;
	}
	.byline h2 {
		font-size: 1rem;
		color: #175548;
		font-weight: 700;
	}
	time,
	figcaption {
		color: #485c61;
		font-size: 0.85em;
	}
	figure {
		margin-block: 0.65rem;
	}
	.transcript :global(img),
	.transcript :global(figure svg) {
		max-width: 100%;
		max-height: 175mm;
		object-fit: contain;
	}
	.transcript :global(table) {
		width: 100%;
		border-collapse: collapse;
		font-size: 0.9em;
	}
	.transcript :global(th),
	.transcript :global(td) {
		text-align: start;
		vertical-align: top;
		padding: 0.35em;
		border-bottom: 1px solid #dadfe1;
	}
	.transcript :global(th) {
		color: #294e4c;
	}
	.transcript :global(pre) {
		white-space: pre-wrap;
		overflow-wrap: anywhere;
	}
	@media print {
		.transcript {
			max-width: none;
			padding: 0;
			color: #162e31;
			font-size: 10.5pt;
			print-color-adjust: exact;
		}
		.byline,
		.transcript-heading,
		.transcript :global(h3),
		.transcript :global(h4) {
			break-after: avoid;
		}
		.textOnly,
		figure,
		.transcript :global(figure),
		.transcript :global(tr) {
			break-inside: avoid;
		}
		.transcript :global(.katex-display),
		.transcript :global(pre) {
			overflow: visible;
		}
		.transcript :global(.prose) {
			max-width: 100%;
		}
	}
</style>
