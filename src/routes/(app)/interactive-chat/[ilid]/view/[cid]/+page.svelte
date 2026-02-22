<script lang="ts">
	import { marked } from 'marked';
	import katex from 'katex';
	import markedKatex from 'marked-katex-extension';
	import 'katex/dist/katex.min.css';
	import type { PageData } from './$types';
	import { preprocessMathExpressions } from '$lib/utils';
	import { onMount } from 'svelte';
	import { BarChart, PieChart } from 'lucide-svelte';

	marked.use(markedKatex({ throwOnError: false, nonStandard: true }));

	let { data }: { data: PageData } = $props();
	let showStatsSummary = $state(false);
	let showMetadata = $state<Record<string, boolean>>({});

	// Interfaces para las métricas
	interface MessageMetrics {
		keystrokeCount: number;
		pasteCount: number;
		charCount: number;
		wordCount: number;
		timeSpentSeconds: number;
		editCount: number;
		deleteCount: number;
		startTimestamp: number;
		deviceInfo: {
			isMobile: boolean;
			userAgent: string;
			screenSize: string;
		};
	}

	// Métricas globales calculadas
	interface GlobalStats {
		totalMessages: number;
		totalUserMessages: number;
		totalAssistantMessages: number;
		averageResponseTime: number;
		totalKeystrokeCount: number;
		totalPasteCount: number;
		averageCharCount: number;
		averageWordCount: number;
		averageTimeSpent: number;
		mobileUsage: number;
		desktopUsage: number;
	}

	let globalStats = $state<GlobalStats>({
		totalMessages: 0,
		totalUserMessages: 0,
		totalAssistantMessages: 0,
		averageResponseTime: 0,
		totalKeystrokeCount: 0,
		totalPasteCount: 0,
		averageCharCount: 0,
		averageWordCount: 0,
		averageTimeSpent: 0,
		mobileUsage: 0,
		desktopUsage: 0
	});

	function processThinkTags(content: string) {
		return content.replace(/<think>(.*?)<\/think>/gs, '<div class="think-block">$1</div>');
	}

	function processContent(content: string) {
		// Lista de palabras a filtrar
		const wordsToFilter = ['[[DONE]]'];

		// Filtrar las palabras no deseadas
		let filteredContent = content;
		for (const word of wordsToFilter) {
			filteredContent = filteredContent.replace(word, '');
		}

		// First preprocess math expressions
		const mathProcessed = preprocessMathExpressions(filteredContent); // Use filteredContent instead of content
		// Then process think tags
		return processThinkTags(mathProcessed);
	}

	// Format date for display
	function formatDate(timestamp: number | Date): string {
		const date = timestamp instanceof Date ? timestamp : new Date(timestamp);
		return date.toLocaleString();
	}

	// Parsear metadatos JSON
	function parseMetadata(metadataStr: string | null): MessageMetrics | null {
		if (!metadataStr) return null;
		try {
			return JSON.parse(metadataStr) as MessageMetrics;
		} catch (e) {
			console.error('Error parsing metadata:', e);
			return null;
		}
	}

	// Formatear tiempo en formato legible
	function formatTime(seconds: number): string {
		if (seconds < 60) return `${seconds} segundos`;
		const minutes = Math.floor(seconds / 60);
		const remainingSeconds = seconds % 60;
		return `${minutes} min ${remainingSeconds} seg`;
	}

	// Formatear valor con separador de miles
	function formatNumber(num: number): string {
		return num.toLocaleString();
	}

	// Alternar visualización de metadatos para un mensaje específico
	function toggleMetadata(id: string) {
		showMetadata[id] = !showMetadata[id];
		showMetadata = { ...showMetadata };
	}

	// Calcular estadísticas globales
	function calculateGlobalStats() {
		const userMessages = data.messages.filter((msg) => msg.type === 'USER');
		const assistantMessages = data.messages.filter((msg) => msg.type === 'ASSISTANT');

		let totalKeystrokeCount = 0;
		let totalPasteCount = 0;
		let totalCharCount = 0;
		let totalWordCount = 0;
		let totalTimeSpent = 0;
		let mobileCount = 0;
		let validMetadataCount = 0;

		// Procesar métricas de mensajes de usuario
		userMessages.forEach((msg) => {
			const metrics = parseMetadata(msg.metadata);
			if (metrics) {
				validMetadataCount++;
				totalKeystrokeCount += metrics.keystrokeCount || 0;
				totalPasteCount += metrics.pasteCount || 0;
				totalCharCount += metrics.charCount || 0;
				totalWordCount += metrics.wordCount || 0;
				totalTimeSpent += metrics.timeSpentSeconds || 0;

				if (metrics.deviceInfo?.isMobile) {
					mobileCount++;
				}
			}
		});

		globalStats = {
			totalMessages: data.messages.length,
			totalUserMessages: userMessages.length,
			totalAssistantMessages: assistantMessages.length,
			averageResponseTime: 0, // Calculado más adelante
			totalKeystrokeCount,
			totalPasteCount,
			averageCharCount: validMetadataCount ? Math.round(totalCharCount / validMetadataCount) : 0,
			averageWordCount: validMetadataCount ? Math.round(totalWordCount / validMetadataCount) : 0,
			averageTimeSpent: validMetadataCount ? Math.round(totalTimeSpent / validMetadataCount) : 0,
			mobileUsage: validMetadataCount ? Math.round((mobileCount / validMetadataCount) * 100) : 0,
			desktopUsage: validMetadataCount
				? Math.round(((validMetadataCount - mobileCount) / validMetadataCount) * 100)
				: 0
		};
	}

	onMount(() => {
		calculateGlobalStats();
	});
</script>

<div class="flex h-full max-h-full flex-col overflow-hidden bg-gray-50 dark:bg-gray-900">
	<!-- Chat header with activity and student info -->
	<div
		class="chat-header border-b border-gray-200 bg-white px-4 py-3 shadow-sm dark:border-gray-700 dark:bg-gray-800"
	>
		<div class="flex flex-col justify-between md:flex-row">
			<div class="mb-2 md:mb-0">
				<h2 class="text-lg font-semibold text-gray-900 dark:text-gray-100">{data.activity.name}</h2>
				<p class="text-sm text-gray-600 dark:text-gray-400">
					{data.activity.description || 'No description available'}
				</p>
			</div>
			<div class="flex items-center">
				<div class="mr-4 text-right">
					<p class="text-sm font-medium text-gray-900 dark:text-gray-100">
						Estudiante: {data.student.username}
					</p>
					<p class="text-xs text-gray-600 dark:text-gray-400">{data.student.email}</p>
				</div>
				<div class="h-10 w-10 overflow-hidden rounded-full bg-gray-200 dark:bg-gray-700">
					{#if data.student.image}
						<img
							src={data.student.image}
							alt={data.student.username}
							class="h-full w-full object-cover"
						/>
					{:else}
						<div
							class="flex h-full w-full items-center justify-center text-gray-500 dark:text-gray-400"
						>
							{data.student.username.substring(0, 1).toUpperCase()}
						</div>
					{/if}
				</div>
			</div>
		</div>
		<div class="mt-2 flex items-center justify-between text-xs text-gray-500 dark:text-gray-400">
			<span>Tipo: {data.activity.type}</span>
			<span>Creado: {formatDate(data.createdAt)}</span>
			<span>Actualizado: {formatDate(data.updatedAt)}</span>
		</div>
	</div>

	<!-- Estadísticas globales -->
	<div class="border-b border-gray-200 bg-white dark:border-gray-700 dark:bg-gray-800">
		<button
			class="flex w-full items-center justify-between px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-100 dark:text-gray-300 dark:hover:bg-gray-700"
			onclick={() => (showStatsSummary = !showStatsSummary)}
		>
			<div class="flex items-center">
				<BarChart class="mr-2" size={16} />
				<span>Resumen de Estadísticas de Interacción</span>
			</div>
			<span class="text-xs">{showStatsSummary ? '▲' : '▼'}</span>
		</button>

		{#if showStatsSummary}
			<div class="border-t border-gray-200 bg-gray-50 p-4 dark:border-gray-700 dark:bg-gray-900">
				<div class="grid grid-cols-1 gap-4 md:grid-cols-3">
					<!-- Panel de mensajes -->
					<div class="rounded-lg bg-white p-4 shadow dark:bg-gray-800">
						<h3 class="mb-2 text-sm font-semibold text-gray-700 dark:text-gray-300">Mensajes</h3>
						<div class="space-y-2">
							<div class="flex justify-between">
								<span class="text-xs text-gray-600 dark:text-gray-400">Total mensajes:</span>
								<span class="text-xs font-medium">{globalStats.totalMessages}</span>
							</div>
							<div class="flex justify-between">
								<span class="text-xs text-gray-600 dark:text-gray-400">Mensajes de usuario:</span>
								<span class="text-xs font-medium">{globalStats.totalUserMessages}</span>
							</div>
							<div class="flex justify-between">
								<span class="text-xs text-gray-600 dark:text-gray-400">Mensajes del asistente:</span
								>
								<span class="text-xs font-medium">{globalStats.totalAssistantMessages}</span>
							</div>
						</div>
					</div>

					<!-- Panel de comportamiento de escritura -->
					<div class="rounded-lg bg-white p-4 shadow dark:bg-gray-800">
						<h3 class="mb-2 text-sm font-semibold text-gray-700 dark:text-gray-300">
							Comportamiento de Escritura
						</h3>
						<div class="space-y-2">
							<div class="flex justify-between">
								<span class="text-xs text-gray-600 dark:text-gray-400">Total de pulsaciones:</span>
								<span class="text-xs font-medium"
									>{formatNumber(globalStats.totalKeystrokeCount)}</span
								>
							</div>
							<div class="flex justify-between">
								<span class="text-xs text-gray-600 dark:text-gray-400"
									>Total de pegados (paste):</span
								>
								<span class="text-xs font-medium">{globalStats.totalPasteCount}</span>
							</div>
							<div class="flex justify-between">
								<span class="text-xs text-gray-600 dark:text-gray-400">Promedio de caracteres:</span
								>
								<span class="text-xs font-medium">{globalStats.averageCharCount}</span>
							</div>
							<div class="flex justify-between">
								<span class="text-xs text-gray-600 dark:text-gray-400">Promedio de palabras:</span>
								<span class="text-xs font-medium">{globalStats.averageWordCount}</span>
							</div>
						</div>
					</div>

					<!-- Panel de tiempos y dispositivos -->
					<div class="rounded-lg bg-white p-4 shadow dark:bg-gray-800">
						<h3 class="mb-2 text-sm font-semibold text-gray-700 dark:text-gray-300">
							Tiempos y Dispositivos
						</h3>
						<div class="space-y-2">
							<div class="flex justify-between">
								<span class="text-xs text-gray-600 dark:text-gray-400"
									>Tiempo medio por mensaje:</span
								>
								<span class="text-xs font-medium">{formatTime(globalStats.averageTimeSpent)}</span>
							</div>
							<div class="flex justify-between">
								<span class="text-xs text-gray-600 dark:text-gray-400">Uso desde móvil:</span>
								<span class="text-xs font-medium">{globalStats.mobileUsage}%</span>
							</div>
							<div class="flex justify-between">
								<span class="text-xs text-gray-600 dark:text-gray-400">Uso desde escritorio:</span>
								<span class="text-xs font-medium">{globalStats.desktopUsage}%</span>
							</div>
						</div>
					</div>
				</div>
			</div>
		{/if}
	</div>

	<!-- Chat messages -->
	<div class="chat-container mb-3 min-h-0 flex-1 overflow-y-auto">
		<div class="flex flex-col gap-2 p-2">
			{#each data.messages as message}
				{#if !(message.content.trim().startsWith('[[') && message.content.trim().endsWith(']]'))}
					<div class="flex flex-col {message.type === 'USER' ? 'items-end' : 'items-start'}">
						<div
							class="markdown max-w-[96%] rounded-2xl px-4 py-2
                            {message.type === 'USER'
								? 'bg-blue-200 text-white dark:bg-blue-700'
								: 'bg-white text-gray-900 shadow-sm dark:bg-gray-800 dark:text-gray-100'}"
						>
							<div class="prose max-w-none dark:prose-invert">
								{@html marked(processContent(message.content))}
							</div>

							{#if message.type === 'USER' && message.metadata}
								<div class="mt-2 flex justify-end">
									<button
										class="flex items-center text-xs text-blue-600 hover:underline dark:text-blue-400"
										onclick={() => toggleMetadata(message.id)}
									>
										<span>{showMetadata[message.id] ? 'Ocultar métricas' : 'Ver métricas'}</span>
									</button>
								</div>

								{#if showMetadata[message.id]}
									{@const metrics = parseMetadata(message.metadata)}
									{#if metrics}
										<div
											class="mt-1 rounded bg-blue-100 p-2 text-xs text-gray-700 dark:bg-blue-800 dark:text-gray-200"
										>
											<h4 class="mb-1 font-semibold">Métricas de escritura:</h4>
											<div class="grid grid-cols-2 gap-x-4 gap-y-1">
												<div>Pulsaciones: {formatNumber(metrics.keystrokeCount || 0)}</div>
												<div>Pegados: {metrics.pasteCount || 0}</div>
												<div>Caracteres: {metrics.charCount || 0}</div>
												<div>Palabras: {metrics.wordCount || 0}</div>
												<div>Tiempo: {formatTime(metrics.timeSpentSeconds || 0)}</div>
												<div>Borrados: {metrics.deleteCount || 0}</div>
												<div>Ediciones: {metrics.editCount || 0}</div>
												<div>
													Dispositivo: {metrics.deviceInfo?.isMobile ? 'Móvil' : 'Escritorio'}
												</div>
											</div>
											{#if metrics.deviceInfo}
												<details class="mt-1">
													<summary class="cursor-pointer">Detalles del dispositivo</summary>
													<div class="mt-1 pl-2">
														<div>Pantalla: {metrics.deviceInfo.screenSize || 'N/A'}</div>
														<div class="truncate" title={metrics.deviceInfo.userAgent || ''}>
															UA: {metrics.deviceInfo.userAgent?.substring(0, 50)}...
														</div>
													</div>
												</details>
											{/if}
										</div>
									{/if}
								{/if}
							{/if}
						</div>
						<div class="mt-1 px-2 text-xs text-gray-500 dark:text-gray-400">
							{formatDate(message.createdAt)}
						</div>
					</div>
				{/if}
			{/each}
		</div>
	</div>
</div>

<style>
	.chat-container {
		display: flex;
		flex-direction: column;
		height: 100%;
		gap: 0.5rem;
		padding: 0.5rem;
		overflow-y: auto;
		position: relative;
	}

	.markdown :global(h1) {
		font-size: 1.125rem;
		font-weight: 700;
		color: var(--text-color);
	}

	.markdown :global(p) {
		color: var(--text-color);
	}

	.markdown :global(a) {
		text-decoration: underline;
		color: var(--link-color);
	}

	.markdown :global(ul),
	.markdown :global(ol) {
		padding-left: 1.25rem;
		color: var(--text-color);
	}

	.markdown :global(ul) {
		list-style-type: disc;
	}

	.markdown :global(ol) {
		list-style-type: decimal;
	}

	.markdown :global(code) {
		border-radius: 0.25rem;
		background-color: var(--code-bg);
		padding: 0.125rem 0.25rem;
	}

	.markdown :global(pre) {
		overflow-x: auto;
		border-radius: 0.25rem;
		background-color: var(--code-bg);
		padding: 0.75rem;
	}

	.markdown {
		transition: min-height 0.3s ease;
	}

	.markdown :global(.think-block) {
		margin: 0.5rem 0;
		border-radius: 0.5rem;
		border-left: 4px solid var(--accent-color);
		background-color: var(--think-bg);
		padding: 1rem;
		font-style: italic;
		color: var(--text-color);
	}

	:global(.dark) .markdown :global(.think-block) {
		background-color: rgba(91, 33, 182, 0.3);
		color: rgb(243, 244, 246);
	}

	:root {
		--text-color: #111827;
		--link-color: #3b82f6;
		--code-bg: #f3f4f6;
		--accent-color: #8b5cf6;
		--think-bg: #ede9fe;
	}

	:global(.dark) {
		--text-color: #f3f4f6;
		--link-color: #60a5fa;
		--code-bg: #374151;
		--accent-color: #a78bfa;
		--think-bg: rgba(91, 33, 182, 0.3);
	}

	/* Custom scrollbar styling for webkit browsers */
	.chat-container::-webkit-scrollbar {
		width: 6px;
	}

	.chat-container::-webkit-scrollbar-track {
		background: transparent;
	}

	.chat-container::-webkit-scrollbar-thumb {
		background-color: #d1d5db;
		border-radius: 3px;
	}

	:global(.dark) .chat-container::-webkit-scrollbar-thumb {
		background-color: #4b5563;
	}
</style>
