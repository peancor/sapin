<script lang="ts">
	import { Card, Button } from 'flowbite-svelte';
	import { marked } from 'marked';
	import { createDocxFromMarkdown } from '$lib/utils/docx-export';
	import { insightsStore } from '$lib/stores/insights';
	import { Download, RefreshCw, Trash2, Info } from 'lucide-svelte';
	import fileSaver from 'file-saver';

	const { saveAs } = fileSaver;

	interface Props {
		content: string;
		generatedAt: string | null;
		activityName: string;
		ilid: string;
	}

	let { content, generatedAt, activityName, ilid }: Props = $props();

	let isExportingDocx = $state(false);
	let isExportingMd = $state(false);

	async function exportToDocx() {
		if (isExportingDocx || !content) return;

		isExportingDocx = true;
		try {
			const tokens = marked.lexer(content);

			let title = 'Informe de Insights';
			if (tokens.length > 0 && tokens[0].type === 'heading') {
				title = tokens[0].text;
			} else if (activityName) {
				title = `Informe de Insights: ${activityName}`;
			}

			const blob = await createDocxFromMarkdown(title, generatedAt || '', tokens);

			const filename = activityName
				? `insights_${activityName.replace(/\s+/g, '_')}.docx`
				: `insights_report.docx`;

			saveAs(blob, filename);
		} catch (error) {
			console.error('Error exporting to DOCX:', error);
			alert('Error al exportar el informe a DOCX. Por favor, intentalo de nuevo.');
		} finally {
			isExportingDocx = false;
		}
	}

	async function exportToMarkdown() {
		if (isExportingMd || !content) return;

		isExportingMd = true;
		try {
			const blob = new Blob([content], { type: 'text/markdown;charset=utf-8' });

			const filename = activityName
				? `insights_${activityName.replace(/\s+/g, '_')}.md`
				: `insights_report.md`;

			saveAs(blob, filename);
		} catch (error) {
			console.error('Error exporting to Markdown:', error);
			alert('Error al exportar el informe a Markdown. Por favor, intentalo de nuevo.');
		} finally {
			isExportingMd = false;
		}
	}

	function handleRegenerate() {
		insightsStore.setActiveView('generate');
	}

	function handleClearCache() {
		if (confirm('Seguro que deseas borrar el informe almacenado en cache?')) {
			insightsStore.clearCache(ilid);
		}
	}
</script>

<div class="space-y-4">
	{#if content}
		<!-- Report Card -->
		<Card class="w-full" size="xl">
			<div class="p-4 md:p-6">
				<!-- Header -->
				<div class="mb-6 flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
					<div>
						<h2 class="text-xl font-bold text-gray-900 md:text-2xl dark:text-white">
							Informe de Insights
						</h2>
						{#if generatedAt}
							<p class="mt-1 text-sm text-gray-500 dark:text-gray-400">
								Generado el {generatedAt}
							</p>
						{/if}
					</div>

					<!-- Actions -->
					<div class="flex flex-wrap gap-2">
						<Button color="blue" size="sm" onclick={exportToDocx} disabled={isExportingDocx}>
							{#if isExportingDocx}
								<svg class="mr-2 h-4 w-4 animate-spin" viewBox="0 0 24 24">
									<circle
										class="opacity-25"
										cx="12"
										cy="12"
										r="10"
										stroke="currentColor"
										stroke-width="4"
										fill="none"
									/>
									<path
										class="opacity-75"
										fill="currentColor"
										d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"
									/>
								</svg>
							{:else}
								<Download size={16} class="mr-2" />
							{/if}
							DOCX
						</Button>

						<Button color="blue" size="sm" onclick={exportToMarkdown} disabled={isExportingMd}>
							{#if isExportingMd}
								<svg class="mr-2 h-4 w-4 animate-spin" viewBox="0 0 24 24">
									<circle
										class="opacity-25"
										cx="12"
										cy="12"
										r="10"
										stroke="currentColor"
										stroke-width="4"
										fill="none"
									/>
									<path
										class="opacity-75"
										fill="currentColor"
										d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"
									/>
								</svg>
							{:else}
								<Download size={16} class="mr-2" />
							{/if}
							MD
						</Button>

						<Button color="light" size="sm" onclick={handleRegenerate}>
							<RefreshCw size={16} class="mr-2" />
							Nuevo
						</Button>
					</div>
				</div>

				<!-- Cache Notice -->
				<div
					class="mb-4 flex items-center justify-between rounded-lg border border-blue-200 bg-blue-50 p-3 dark:border-blue-800 dark:bg-blue-900/20"
				>
					<div class="flex items-center gap-2 text-blue-700 dark:text-blue-300">
						<Info size={16} />
						<span class="text-sm"> Este informe esta almacenado en cache local. </span>
					</div>
					<button
						onclick={handleClearCache}
						class="flex items-center gap-1 text-sm text-blue-600 hover:underline dark:text-blue-400"
					>
						<Trash2 size={14} />
						Borrar
					</button>
				</div>

				<!-- Report Content -->
				<div
					class="prose dark:prose-invert prose-sm md:prose-base lg:prose-lg max-w-none overflow-x-auto"
				>
					{@html marked.parse(content)}
				</div>
			</div>
		</Card>
	{:else}
		<!-- Empty State -->
		<div class="py-16 text-center">
			<div
				class="mb-4 inline-flex h-20 w-20 items-center justify-center rounded-full bg-gray-100 dark:bg-gray-700"
			>
				<svg class="h-10 w-10 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
					<path
						stroke-linecap="round"
						stroke-linejoin="round"
						stroke-width="2"
						d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"
					/>
				</svg>
			</div>
			<h3 class="mb-2 text-xl font-semibold text-gray-900 dark:text-white">
				No hay informe generado
			</h3>
			<p class="mb-6 text-gray-500 dark:text-gray-400">
				Ve a la seccion "Generar" para crear un nuevo informe de insights.
			</p>
			<Button color="blue" onclick={() => insightsStore.setActiveView('generate')}>
				Generar Informe
			</Button>
		</div>
	{/if}
</div>

<style>
	:global(.prose table) {
		font-size: 0.9em;
		overflow-x: auto;
		display: block;
		max-width: 100%;
	}

	:global(.prose pre) {
		overflow-x: auto;
	}

	:global(.prose blockquote) {
		border-left-color: #3b82f6;
	}
</style>
