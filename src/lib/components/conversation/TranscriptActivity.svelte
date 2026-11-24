<script lang="ts">
	import SafeHtml from '$lib/components/SafeHtml.svelte';
	import JxgPlot from '$lib/components/charts/jsxgraph/JxgPlot.svelte';
	import { graphPlotPropsSchema } from '$lib/components/charts/jsxgraph/schema';
	import TikzjaxBrowserRenderer from '$lib/components/tikzjax/TikzjaxBrowserRenderer.svelte';
	import type { TikzjaxBrowserRenderRequest } from '$lib/types/tikzjax';
	import { buildSvgDataUri } from '$lib/utils/svgDiagram';
	import { resultRecord } from '$lib/utils/agentToolActivity';
	import type { AgentDisplayPart } from '$lib/types/agent';
	import { renderMarkdownMath } from '$lib/utils';
	import * as m from '$lib/paraglide/messages';
	import TranscriptTestResults from './TranscriptTestResults.svelte';
	import { resolveTimedQuizConfig } from '../agent/ui/shared/timed-quiz';
	import { cognitiveTestTitles, testInstructions } from './transcriptTestData';

	let { part }: { part: Extract<AgentDisplayPart, { kind: 'ui-component' }> } = $props();
	const componentProps = $derived(part.props);
	const key = $derived(part.componentKey);
	const response = $derived(part.userResponse);
	const title = $derived(
		typeof componentProps.title === 'string' && componentProps.title.trim()
			? componentProps.title
			: fallbackTitle(key)
	);
	const questions = $derived(
		Array.isArray(componentProps.questions) ? componentProps.questions.map(resultRecord) : []
	);
	const cards = $derived(
		Array.isArray(componentProps.cards) ? componentProps.cards.map(resultRecord) : []
	);
	const tikzRequest = $derived(resultRecord(componentProps.request));
	let tikzState = $state<'pending' | 'ready' | 'error'>('pending');

	function fallbackTitle(component: string) {
		if (component === 'FlashcardDeck') return m.transcript_cards();
		if (['QuizCard', 'TimedQuizCard', 'ImmersiveTimedQuiz'].includes(component))
			return m.transcript_quiz();
		if (component === 'GraphPlotCard') return m.transcript_plot();
		if (component === 'SharedImageCard')
			return typeof componentProps.name === 'string' ? componentProps.name : m.transcript_image();
		if (component === 'SvgDiagramCard' || component === 'TikzjaxDiagramCard')
			return m.transcript_diagram();
		return Object.hasOwn(cognitiveTestTitles, component)
			? cognitiveTestTitles[component]()
			: m.transcript_activity();
	}
</script>

{#snippet markdown(content: unknown, inline = false)}
	{#if typeof content === 'string'}<SafeHtml html={renderMarkdownMath(content, { inline })} />{/if}
{/snippet}

<div class="activity">
	<h3>{title}</h3>
	{#if ['QuizCard', 'TimedQuizCard', 'ImmersiveTimedQuiz'].includes(key)}
		{#if key !== 'QuizCard'}
			{@const config = resolveTimedQuizConfig({
				difficulty: componentProps.difficulty,
				timerByDifficultySec: resultRecord(componentProps.timerByDifficultySec)
			})}
			<p>
				{m.transcript_quiz_time({
					count: questions.length,
					seconds:
						typeof response?.timePerQuestionSec === 'number'
							? response.timePerQuestionSec
							: config.timePerQuestionSec
				})}
			</p>
		{/if}
		{#if typeof response?.score === 'number'}<p>
				{m.transcript_score({ score: Math.round(response.score * 100) })}
			</p>{/if}
		{#if !response}<p>{m.transcript_pending()}</p>{/if}
		{#each questions as question, i (`${part.instanceId}:q:${i}`)}
			{@const result = resultRecord(
				Array.isArray(response?.questionResults) ? response.questionResults[i] : null
			)}
			{@const answer =
				result.selectedIndex ??
				(Array.isArray(response?.answers) ? response.answers[i] : undefined)}
			<div class="question">
				<h4>{i + 1}. {@render markdown(question.question, true)}</h4>
				<ol type="A">
					{#each Array.isArray(question.options) ? question.options : [] as option, j (`${i}:${j}`)}
						<li>
							{@render markdown(option, true)}
							{#if answer === j}<strong> · {m.transcript_selected()}</strong>{/if}
							{#if response && question.correctIndex === j}<span>
									· {m.transcript_correct()}</span
								>{/if}
						</li>
					{/each}
				</ol>
				{#if result.timedOut === true}<p>{m.transcript_timeout()}</p>
				{:else if response && (typeof answer !== 'number' || answer < 0)}<p>
						{m.transcript_pending()}
					</p>{/if}
				{#if typeof result.responseMs === 'number'}<p>
						{m.transcript_time({ ms: result.responseMs })}
					</p>{/if}
				{#if response}{@render markdown(question.explanation)}{/if}
			</div>
		{/each}
	{:else if key === 'FlashcardDeck'}
		<p>
			{typeof response?.cardsReviewed === 'number'
				? m.transcript_reviewed({ count: response.cardsReviewed })
				: m.transcript_pending()}
		</p>
		{#each cards as card, i (`${part.instanceId}:card:${i}`)}
			<div class="question">
				<h4>{i + 1}. {@render markdown(card.front, true)}</h4>
				{@render markdown(card.back)}
			</div>
		{/each}
	{:else if key === 'GraphPlotCard'}
		{@const graph = graphPlotPropsSchema.safeParse(componentProps)}
		{#if graph.success}<figure><JxgPlot plot={graph.data} staticView /></figure>
		{:else}<p data-transcript-resource="error">{m.transcript_visual_error()}</p>{/if}
	{:else if key === 'SvgDiagramCard' || key === 'SharedImageCard'}
		{@const src =
			key === 'SvgDiagramCard' && typeof componentProps.svg === 'string'
				? buildSvgDataUri(componentProps.svg)
				: typeof componentProps.fileId === 'string'
					? '/api/files/' + encodeURIComponent(componentProps.fileId)
					: undefined}
		{#if src}
			<figure>
				<img {src} alt={String(componentProps.ariaLabel ?? componentProps.caption ?? title)} />
				{#if typeof componentProps.caption === 'string'}<figcaption>
						{componentProps.caption}
					</figcaption>{/if}
			</figure>
		{:else}<p data-transcript-resource="error">{m.transcript_visual_error()}</p>{/if}
	{:else if key === 'TikzjaxDiagramCard'}
		{#if typeof tikzRequest.source === 'string'}
			<figure data-transcript-resource={tikzState}>
				<TikzjaxBrowserRenderer
					request={tikzRequest as unknown as TikzjaxBrowserRenderRequest}
					containerClass="my-2"
					hostClass="tikzjax-scaled-container max-w-full"
					onRenderFinished={() => (tikzState = 'ready')}
					onRuntimeError={() => (tikzState = 'error')}
				/>
				{#if tikzState === 'error'}<p>{m.transcript_visual_error()}</p>{/if}
				{#if typeof componentProps.caption === 'string'}<figcaption>
						{componentProps.caption}
					</figcaption>{/if}
			</figure>
		{:else}<p data-transcript-resource="error">{m.transcript_visual_error()}</p>{/if}
	{:else if Object.hasOwn(cognitiveTestTitles, key)}
		{#if key === 'ExecutiveFlexibilityTest'}
			<p>
				{componentProps.testType === 'wcst' ? 'Wisconsin Card Sorting Test' : 'Trail Making Test'}
			</p>
		{:else if componentProps.testType === 'sdmt'}
			<p>Symbol Digit Modalities Test</p>
		{/if}
		{@render markdown(testInstructions(key, componentProps))}
		{#if key === 'SustainedAttentionTest' || (key === 'AttentionControlTest' && componentProps.testType === 'go_no_go')}
			<p>
				{m.transcript_go_rule({
					go: typeof componentProps.goStimulus === 'string' ? componentProps.goStimulus : 'GO',
					stop:
						typeof componentProps.noGoStimulus === 'string' ? componentProps.noGoStimulus : 'STOP'
				})}
			</p>
		{/if}
		<TranscriptTestResults
			{response}
			preview={key === 'ExecutiveFlexibilityTest' || componentProps.testType === 'sdmt'}
		/>
	{:else}
		<p>{m.transcript_unknown()}</p>
	{/if}
</div>

<style>
	.activity {
		margin-block: 0.8rem;
		border-left: 3px solid #acc8c0;
		padding-inline-start: 0.9rem;
	}
	h3,
	h4 {
		font-weight: 650;
		margin-block: 0.35em;
	}
	.question {
		margin-block: 0.7em;
	}
	ol {
		list-style: upper-alpha;
		padding-inline-start: 1.8em;
	}
	li {
		padding-inline-start: 0.2em;
	}
	p,
	figcaption {
		font-size: 0.9em;
	}
	@media print {
		.activity,
		.question {
			break-inside: avoid;
		}
		h4 {
			break-after: avoid;
		}
		li {
			break-inside: avoid;
		}
	}
</style>
