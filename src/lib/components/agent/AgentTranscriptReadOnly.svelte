<script lang="ts">
	import { Bot, Clock3, Copy, Keyboard, PencilLine, User, Wrench } from 'lucide-svelte';
	import UIComponentRenderer from './UIComponentRenderer.svelte';
	import ImmersiveToolOverlay from './ImmersiveToolOverlay.svelte';
	import {
		getUIComponentRegistryEntry,
		isImmersiveUIComponentEntry
	} from './ui/registry';
	import { formatDate } from '$lib/helpers/dateUtils';
	import type {
		AgentDisplayMessage,
		AgentDisplayPart,
		AgentUserMessageMetrics
	} from '$lib/types/agent';
	import { uiComponentRequiresResponse } from '$lib/utils/agentUI';
	import { renderMarkdownMath } from '$lib/utils';

	interface Props {
		messages: AgentDisplayMessage[];
		messageMetricsById?: Record<string, AgentUserMessageMetrics>;
		emptyMessage?: string;
	}

	type UIComponentDisplayPart = Extract<AgentDisplayPart, { kind: 'ui-component' }>;

	let {
		messages,
		messageMetricsById = {},
		emptyMessage = 'No hay mensajes registrados para esta sesión.'
	}: Props = $props();

	let activeImmersiveUI = $state<UIComponentDisplayPart | null>(null);
	let expandedMetrics = $state<Record<string, boolean>>({});

	function renderMarkdown(content: string): string {
		try {
			return renderMarkdownMath(content, { stripAgentMarkers: true });
		} catch {
			return content
				.replace(/\[\[DONE\]\]/g, '')
				.replace(/\[\[CONTEXTO_RAG\]\][\s\S]*?\[\[FIN_CONTEXTO_RAG\]\]/g, '')
				.trim();
		}
	}

	function toolStatusLabel(status: string): string {
		switch (status) {
			case 'completed':
				return 'Completada';
			case 'failed':
				return 'Fallida';
			case 'rejected':
				return 'Rechazada';
			case 'awaiting_confirmation':
				return 'Pendiente de confirmacion';
			case 'awaiting_ui_response':
				return 'Pendiente de respuesta';
			case 'executing':
				return 'En ejecucion';
			case 'pending':
				return 'Pendiente';
			default:
				return status;
		}
	}

	function toolStatusClasses(status: string): { badge: string; panel: string } {
		switch (status) {
			case 'completed':
				return {
					badge:
						'border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-900/70 dark:bg-emerald-950/40 dark:text-emerald-300',
					panel:
						'border-emerald-200/80 bg-emerald-50/70 dark:border-emerald-900/70 dark:bg-emerald-950/20'
				};
			case 'failed':
			case 'rejected':
				return {
					badge:
						'border-rose-200 bg-rose-50 text-rose-700 dark:border-rose-900/70 dark:bg-rose-950/40 dark:text-rose-300',
					panel:
						'border-rose-200/80 bg-rose-50/70 dark:border-rose-900/70 dark:bg-rose-950/20'
				};
			default:
				return {
					badge:
						'border-amber-200 bg-amber-50 text-amber-700 dark:border-amber-900/70 dark:bg-amber-950/40 dark:text-amber-300',
					panel:
						'border-amber-200/80 bg-amber-50/70 dark:border-amber-900/70 dark:bg-amber-950/20'
				};
		}
	}

	function formatJson(value: unknown): string {
		if (value === undefined || value === null) return '';
		try {
			return JSON.stringify(value, null, 2);
		} catch {
			return String(value);
		}
	}

	function getUiTitle(part: UIComponentDisplayPart): string {
		return typeof part.props.title === 'string' && part.props.title.trim().length > 0
			? part.props.title
			: part.componentKey;
	}

	function isImmersivePart(part: UIComponentDisplayPart): boolean {
		return isImmersiveUIComponentEntry(getUIComponentRegistryEntry(part.componentKey));
	}

	function canOpenImmersive(part: UIComponentDisplayPart): boolean {
		return isImmersivePart(part);
	}

	function openImmersive(part: UIComponentDisplayPart) {
		if (!canOpenImmersive(part)) return;
		activeImmersiveUI = part;
	}

	function closeImmersive() {
		activeImmersiveUI = null;
	}

	function toggleMetrics(messageId: string) {
		expandedMetrics = {
			...expandedMetrics,
			[messageId]: !expandedMetrics[messageId]
		};
	}

	function getImmersiveSubtitle(part: UIComponentDisplayPart): string {
		return part.userResponse
			? 'Resultado guardado. Esta reproduccion es de solo lectura.'
			: uiComponentRequiresResponse(part.componentKey)
				? 'Vista de solo lectura del componente mostrado al alumno. No hay respuesta guardada.'
				: 'Vista de solo lectura del componente generado por el agente.';
	}

	function formatTime(seconds: number): string {
		if (seconds < 60) return `${seconds} segundos`;
		const minutes = Math.floor(seconds / 60);
		const remainingSeconds = seconds % 60;
		return `${minutes} min ${remainingSeconds} seg`;
	}

	function formatNumber(value: number): string {
		return value.toLocaleString();
	}
</script>

<div class="space-y-5">
	{#if messages.length === 0}
		<div
			class="rounded-3xl border border-dashed border-slate-300 bg-white/70 px-6 py-10 text-center text-sm text-slate-500 dark:border-slate-700 dark:bg-slate-900/60 dark:text-slate-400"
		>
			{emptyMessage}
		</div>
	{:else}
		{#each messages as message (message.id)}
			<section
				class="flex gap-3 sm:gap-4 {message.role === 'user' ? 'justify-end' : 'justify-start'}"
			>
				{#if message.role === 'assistant'}
					<div
						class="mt-1 hidden h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-emerald-100 text-emerald-700 shadow-sm dark:bg-emerald-950/60 dark:text-emerald-300 sm:flex"
					>
						<Bot class="h-5 w-5" />
					</div>
				{/if}

				<div class="w-full max-w-4xl">
					<div
						class={`overflow-hidden rounded-3xl border shadow-sm ${
							message.role === 'user'
								? 'border-sky-200 bg-sky-50/90 dark:border-sky-900/60 dark:bg-sky-950/25'
								: 'border-slate-200 bg-white/95 dark:border-slate-700 dark:bg-slate-900/90'
						}`}
					>
						<div
							class={`flex items-center justify-between border-b px-4 py-3 text-xs font-semibold uppercase tracking-[0.18em] ${
								message.role === 'user'
									? 'border-sky-200/80 text-sky-700 dark:border-sky-900/60 dark:text-sky-300'
									: 'border-slate-200/80 text-slate-500 dark:border-slate-700 dark:text-slate-400'
							}`}
						>
							<span class="inline-flex items-center gap-2">
								{#if message.role === 'user'}
									<User class="h-4 w-4" />
									Alumno
								{:else}
									<Bot class="h-4 w-4" />
									Agente
								{/if}
							</span>
							<span class="normal-case tracking-normal">{formatDate(message.createdAt)}</span>
						</div>

						<div class="space-y-4 px-4 py-4 sm:px-5">
							{#each message.parts as part, index (`${message.id}-${index}`)}
								{#if part.kind === 'text' && part.content}
									<div
										class={`prose prose-sm max-w-none break-words ${
											message.role === 'user'
												? 'prose-sky dark:prose-invert'
												: 'dark:prose-invert'
										}`}
									>
										{@html renderMarkdown(part.content)}
									</div>
								{:else if part.kind === 'tool-call'}
									{@const tone = toolStatusClasses(part.status)}
									<div class={`rounded-2xl border ${tone.panel}`}>
										<div class="flex flex-wrap items-center gap-2 px-4 py-3">
											<div class="flex min-w-0 flex-1 items-center gap-2">
												<div
													class="flex h-8 w-8 shrink-0 items-center justify-center rounded-2xl bg-slate-900/5 text-slate-600 dark:bg-white/5 dark:text-slate-300"
												>
													<Wrench class="h-4 w-4" />
												</div>
												<div class="min-w-0">
													<p class="truncate text-sm font-semibold text-slate-900 dark:text-slate-100">
														{part.toolDisplayName}
													</p>
													<p class="text-xs text-slate-500 dark:text-slate-400">
														{part.toolName}
													</p>
												</div>
											</div>

											<span
												class={`rounded-full border px-2.5 py-1 text-[11px] font-semibold uppercase tracking-[0.16em] ${tone.badge}`}
											>
												{toolStatusLabel(part.status)}
											</span>

											{#if part.durationMs}
												<span
													class="inline-flex items-center gap-1 text-xs text-slate-500 dark:text-slate-400"
												>
													<Clock3 class="h-3.5 w-3.5" />
													{part.durationMs} ms
												</span>
											{/if}
										</div>

										<details class="border-t border-black/5 px-4 py-3 dark:border-white/10">
											<summary
												class="cursor-pointer text-sm font-medium text-slate-700 dark:text-slate-200"
											>
												Ver detalle tecnico
											</summary>

											<div class="mt-3 space-y-3">
												{#if Object.keys(part.args).length > 0}
													<div>
														<p class="mb-1 text-xs font-semibold uppercase tracking-[0.16em] text-slate-500 dark:text-slate-400">
															Argumentos
														</p>
														<pre
															class="overflow-x-auto rounded-2xl bg-slate-950 px-3 py-3 text-xs text-slate-100"
														>{formatJson(part.args)}</pre>
													</div>
												{/if}

												{#if part.result !== undefined}
													<div>
														<p class="mb-1 text-xs font-semibold uppercase tracking-[0.16em] text-slate-500 dark:text-slate-400">
															Resultado
														</p>
														<pre
															class="overflow-x-auto rounded-2xl bg-slate-950 px-3 py-3 text-xs text-slate-100"
														>{formatJson(part.result)}</pre>
													</div>
												{/if}
											</div>
										</details>
									</div>
								{:else if part.kind === 'ui-component'}
									<div class="rounded-3xl border border-slate-200/80 bg-white/80 p-2 dark:border-slate-700 dark:bg-slate-900/70">
										<UIComponentRenderer
											instanceId={part.instanceId}
											componentKey={part.componentKey}
											props={part.props}
											interactive={false}
											initialUserResponse={part.userResponse}
											apiBase=""
											onOpenImmersive={canOpenImmersive(part) ? () => openImmersive(part) : undefined}
										/>
									</div>
								{/if}
							{/each}

							{#if message.role === 'user' && messageMetricsById[message.id]}
								<div class="border-t border-sky-200/80 pt-3 dark:border-sky-900/60">
									<button
										type="button"
										class="text-xs font-medium text-sky-700 transition-colors hover:text-sky-900 dark:text-sky-300 dark:hover:text-sky-100"
										onclick={() => toggleMetrics(message.id)}
									>
										{expandedMetrics[message.id] ? 'Ocultar métricas' : 'Ver métricas'}
									</button>

									{#if expandedMetrics[message.id]}
										{@const metrics = messageMetricsById[message.id]}
										<div class="mt-3 rounded-3xl bg-sky-100/80 p-4 text-sm text-slate-700 dark:bg-sky-950/35 dark:text-slate-200">
											<h4 class="text-sm font-semibold text-slate-900 dark:text-slate-100">
												Métricas de escritura
											</h4>
											<div class="mt-3 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
												<div class="rounded-2xl bg-white/70 px-3 py-3 dark:bg-slate-900/60">
													<p class="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-500 dark:text-slate-400">
														<Keyboard class="h-3.5 w-3.5" />
														Pulsaciones
													</p>
													<p class="mt-1 font-semibold text-slate-900 dark:text-slate-100">
														{formatNumber(metrics.keystrokeCount)}
													</p>
												</div>
												<div class="rounded-2xl bg-white/70 px-3 py-3 dark:bg-slate-900/60">
													<p class="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-500 dark:text-slate-400">
														<Copy class="h-3.5 w-3.5" />
														Pegados
													</p>
													<p class="mt-1 font-semibold text-slate-900 dark:text-slate-100">
														{metrics.pasteCount}
													</p>
												</div>
												<div class="rounded-2xl bg-white/70 px-3 py-3 dark:bg-slate-900/60">
													<p class="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-500 dark:text-slate-400">
														<Clock3 class="h-3.5 w-3.5" />
														Tiempo
													</p>
													<p class="mt-1 font-semibold text-slate-900 dark:text-slate-100">
														{formatTime(metrics.timeSpentSeconds)}
													</p>
												</div>
												<div class="rounded-2xl bg-white/70 px-3 py-3 dark:bg-slate-900/60">
													<p class="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-500 dark:text-slate-400">
														<PencilLine class="h-3.5 w-3.5" />
														Ediciones
													</p>
													<p class="mt-1 font-semibold text-slate-900 dark:text-slate-100">
														{metrics.editCount}
													</p>
												</div>
											</div>

											<div class="mt-3 grid gap-2 text-xs sm:grid-cols-2 xl:grid-cols-4">
												<div>Caracteres: {formatNumber(metrics.charCount)}</div>
												<div>Palabras: {formatNumber(metrics.wordCount)}</div>
												<div>Borrados: {formatNumber(metrics.deleteCount)}</div>
												<div>
													Dispositivo: {metrics.deviceInfo.isMobile ? 'Móvil' : 'Escritorio'}
												</div>
											</div>

											{#if metrics.deviceInfo.userAgent || metrics.deviceInfo.screenSize}
												<details class="mt-3">
													<summary class="cursor-pointer text-xs font-medium text-slate-600 dark:text-slate-300">
														Detalles del dispositivo
													</summary>
													<div class="mt-2 space-y-1 text-xs text-slate-600 dark:text-slate-300">
														<div>Pantalla: {metrics.deviceInfo.screenSize || 'N/A'}</div>
														<div class="break-all">
															UA: {metrics.deviceInfo.userAgent || 'N/A'}
														</div>
													</div>
												</details>
											{/if}
										</div>
									{/if}
								</div>
							{/if}
						</div>
					</div>
				</div>

				{#if message.role === 'user'}
					<div
						class="mt-1 hidden h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-sky-100 text-sky-700 shadow-sm dark:bg-sky-950/60 dark:text-sky-300 sm:flex"
					>
						<User class="h-5 w-5" />
					</div>
				{/if}
			</section>
		{/each}
	{/if}
</div>

{#if activeImmersiveUI?.userResponse}
	<ImmersiveToolOverlay
		open={true}
		title={getUiTitle(activeImmersiveUI)}
		subtitle={getImmersiveSubtitle(activeImmersiveUI)}
		onclose={closeImmersive}
	>
		<UIComponentRenderer
			instanceId={activeImmersiveUI.instanceId}
			componentKey={activeImmersiveUI.componentKey}
			props={activeImmersiveUI.props}
			interactive={false}
			initialUserResponse={activeImmersiveUI.userResponse}
			apiBase=""
			renderMode="immersive"
		/>
	</ImmersiveToolOverlay>
{/if}
