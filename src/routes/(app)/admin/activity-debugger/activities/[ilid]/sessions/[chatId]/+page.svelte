<script lang="ts">
	import { page } from '$app/state';
	import { resolve } from '$app/paths';
	import { AlertTriangle, ArrowLeft, Bot, Braces, CalendarClock, CheckCircle2, CircleDollarSign, Cpu, Database, Fingerprint, MessageSquareText, Radar, Settings2, User, Wrench } from 'lucide-svelte';
	import JsonViewer from '$lib/components/activity-debugger/JsonViewer.svelte';
	import RawSections from '$lib/components/activity-debugger/RawSections.svelte';
	import type { ActivityDebuggerRequestRound, ActivityDebuggerTimelineEvent } from '$lib/types/activityDebugger';
	import type { PageData } from './$types';

	let { data }: { data: PageData } = $props();
	let selectedEventId = $state<string | null>(null);
	let selectedEvent = $derived<ActivityDebuggerTimelineEvent | null>(
		data.detail.timeline.find((event) => event.id === selectedEventId) ?? data.detail.timeline[0] ?? null
	);
	let selectedRoundId = $state<string | null>(null);
	let selectedRound = $derived<ActivityDebuggerRequestRound | null>(
		data.detail.requestRounds.find((round) => round.id === selectedRoundId) ??
			data.detail.requestRounds[0] ??
			null
	);

	const tabs = [
		{ id: 'timeline', label: 'Timeline' },
		{ id: 'rounds', label: 'Rondas exactas' },
		{ id: 'prompts', label: 'Prompts' },
		{ id: 'usage', label: 'Uso y costes' },
		{ id: 'metadata', label: 'Metadata' },
		{ id: 'raw', label: 'Raw JSON' }
	] as const;
	let sessionBaseHref = $derived(resolve(
		`/admin/activity-debugger/activities/${data.detail.activity.activityId}/sessions/${data.detail.chat.id}`
	));

	function formatDate(value: string | null): string {
		if (!value) return 'Sin fecha';
		return new Date(value).toLocaleString('es-ES', {
			day: '2-digit',
			month: '2-digit',
			year: 'numeric',
			hour: '2-digit',
			minute: '2-digit',
			second: '2-digit'
		});
	}

	function formatCurrency(value: number): string {
		return new Intl.NumberFormat('es-ES', {
			style: 'currency',
			currency: 'USD',
			maximumFractionDigits: value < 1 ? 4 : 2
		}).format(value);
	}

	function tabHref(tabId: string): string {
		const params = new URLSearchParams(page.url.search);
		params.set('tab', tabId);
		const query = params.toString();
		return query ? `${sessionBaseHref}?${query}` : sessionBaseHref;
	}

	function densityHref(density: string): string {
		const params = new URLSearchParams(page.url.search);
		params.set('density', density);
		const query = params.toString();
		return query ? `${sessionBaseHref}?${query}` : sessionBaseHref;
	}

	function eventTone(event: ActivityDebuggerTimelineEvent): string {
		if (event.status === 'error' || event.status === 'failed' || event.status === 'rejected') {
			return 'border-rose-200 bg-rose-50/80 dark:border-rose-900/60 dark:bg-rose-950/25';
		}
		if (event.kind === 'tool_call' || event.kind === 'tool_result') {
			return 'border-amber-200 bg-amber-50/80 dark:border-amber-900/60 dark:bg-amber-950/25';
		}
		if (event.kind === 'usage') {
			return 'border-fuchsia-200 bg-fuchsia-50/80 dark:border-fuchsia-900/60 dark:bg-fuchsia-950/25';
		}
		if (event.kind === 'config_snapshot' || event.kind === 'session_marker') {
			return 'border-sky-200 bg-sky-50/80 dark:border-sky-900/60 dark:bg-sky-950/25';
		}
		return 'border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-950/60';
	}

	function promptCardClasses(origin: string): string {
		switch (origin) {
			case 'stored':
				return 'border-sky-200 bg-sky-50/80 dark:border-sky-900/60 dark:bg-sky-950/30';
			case 'derived_current':
				return 'border-amber-200 bg-amber-50/80 dark:border-amber-900/60 dark:bg-amber-950/30';
			default:
				return 'border-slate-200 bg-slate-50/80 dark:border-slate-800 dark:bg-slate-900/60';
		}
	}

	function focusBadgeClasses(active: boolean): string {
		return active
			? 'border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-900/60 dark:bg-emerald-950/30 dark:text-emerald-300'
			: 'border-slate-200 bg-white/70 text-slate-600 dark:border-slate-700 dark:bg-slate-950/60 dark:text-slate-300';
	}

	function roundTone(round: ActivityDebuggerRequestRound): string {
		if (round.status === 'error') {
			return 'border-rose-200 bg-rose-50/80 dark:border-rose-900/60 dark:bg-rose-950/25';
		}
		if (round.hasCacheHit) {
			return 'border-emerald-200 bg-emerald-50/80 dark:border-emerald-900/60 dark:bg-emerald-950/25';
		}
		return 'border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-950/60';
	}
</script>

<div class="space-y-6">
	<section class="overflow-hidden rounded-[2rem] border border-slate-200 bg-[radial-gradient(circle_at_top_left,_rgba(14,165,233,0.14),_transparent_25%),radial-gradient(circle_at_top_right,_rgba(16,185,129,0.12),_transparent_18%),linear-gradient(180deg,_#ffffff_0%,_#f8fafc_100%)] p-6 dark:border-slate-800 dark:bg-[radial-gradient(circle_at_top_left,_rgba(14,165,233,0.18),_transparent_25%),radial-gradient(circle_at_top_right,_rgba(16,185,129,0.12),_transparent_18%),linear-gradient(180deg,_#020617_0%,_#0f172a_100%)]">
		<div class="flex flex-col gap-5">
			<div class="flex flex-wrap items-center justify-between gap-4">
				<div>
					<a href={resolve(`/admin/activity-debugger/activities/${data.detail.activity.activityId}`)} class="inline-flex items-center gap-2 text-sm font-medium text-slate-600 hover:text-sky-700 dark:text-slate-300 dark:hover:text-sky-300">
						<ArrowLeft class="h-4 w-4" />
						Volver a la actividad
					</a>
					<p class="mt-4 text-[11px] font-semibold uppercase tracking-[0.24em] text-sky-700 dark:text-sky-300">Session Debugger</p>
					<h1 class="mt-2 text-2xl font-black tracking-tight text-slate-900 dark:text-white sm:text-3xl">
						{data.detail.student.username}
					</h1>
					<p class="mt-2 text-sm text-slate-600 dark:text-slate-300">
						{data.detail.activity.activityName} · chatId {data.detail.chat.id}
					</p>
					<div class="mt-4 flex flex-wrap items-center gap-2 text-xs">
						<span class={`rounded-full border px-2.5 py-1 font-semibold uppercase tracking-[0.14em] ${focusBadgeClasses(data.detail.captureConfig.enabled)}`}>
							Captura global {data.detail.captureConfig.enabled ? 'activa' : 'apagada'}
						</span>
						<span class={`rounded-full border px-2.5 py-1 font-semibold uppercase tracking-[0.14em] ${focusBadgeClasses(!!data.detail.activityCaptureFocus?.enabled && !data.detail.activityCaptureFocus.isExpired)}`}>
							Foco actividad {data.detail.activityCaptureFocus?.enabled && !data.detail.activityCaptureFocus.isExpired ? 'activo' : 'inactivo'}
						</span>
						<span class={`rounded-full border px-2.5 py-1 font-semibold uppercase tracking-[0.14em] ${focusBadgeClasses(!!data.detail.sessionCaptureFocus?.enabled && !data.detail.sessionCaptureFocus.isExpired)}`}>
							Foco sesión {data.detail.sessionCaptureFocus?.enabled && !data.detail.sessionCaptureFocus.isExpired ? 'activo' : 'inactivo'}
						</span>
					</div>
				</div>

				<div class="flex flex-wrap items-center gap-2">
					<a href={resolve('/admin/activity-debugger/settings')} class="inline-flex items-center gap-2 rounded-2xl border border-slate-200 px-3 py-2 text-sm font-medium text-slate-700 dark:border-slate-800 dark:text-slate-300">
						<Settings2 class="h-4 w-4" />
						Settings
					</a>
					<form method="POST" action="?/toggleSessionCaptureFocus">
						<input type="hidden" name="enable" value={data.detail.sessionCaptureFocus?.enabled && !data.detail.sessionCaptureFocus.isExpired ? 'false' : 'true'} />
						<input type="hidden" name="reason" value="Activado rapidamente desde la vista de sesion" />
						<button
							type="submit"
							class={`inline-flex items-center gap-2 rounded-2xl px-3 py-2 text-sm font-semibold ${
								data.detail.sessionCaptureFocus?.enabled && !data.detail.sessionCaptureFocus.isExpired
									? 'border border-rose-200 bg-rose-50 text-rose-700 dark:border-rose-900/60 dark:bg-rose-950/30 dark:text-rose-300'
									: 'bg-slate-900 text-white dark:bg-sky-500 dark:text-slate-950'
							}`}
						>
							<Radar class="h-4 w-4" />
							{data.detail.sessionCaptureFocus?.enabled && !data.detail.sessionCaptureFocus.isExpired ? 'Desactivar foco' : 'Activar foco'}
						</button>
					</form>
					<a href={densityHref('comfortable')} class={`rounded-2xl border px-3 py-2 text-sm font-medium ${data.density === 'comfortable' ? 'border-sky-500 bg-sky-500 text-white' : 'border-slate-200 text-slate-600 dark:border-slate-800 dark:text-slate-300'}`}>Comfortable</a>
					<a href={densityHref('compact')} class={`rounded-2xl border px-3 py-2 text-sm font-medium ${data.density === 'compact' ? 'border-sky-500 bg-sky-500 text-white' : 'border-slate-200 text-slate-600 dark:border-slate-800 dark:text-slate-300'}`}>Compact</a>
				</div>
			</div>

			<div class="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
				<div class="rounded-2xl border border-white/70 bg-white/80 px-4 py-4 dark:border-slate-800 dark:bg-slate-950/70">
					<div class="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-500 dark:text-slate-400"><User class="h-3.5 w-3.5" /> Alumno</div>
					<p class="mt-2 text-sm font-semibold text-slate-900 dark:text-white">{data.detail.student.email}</p>
					<p class="mt-1 text-xs text-slate-500 dark:text-slate-400">{data.detail.student.alias || 'Sin alias'}</p>
				</div>
				<div class="rounded-2xl border border-white/70 bg-white/80 px-4 py-4 dark:border-slate-800 dark:bg-slate-950/70">
					<div class="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-500 dark:text-slate-400"><MessageSquareText class="h-3.5 w-3.5" /> Estado</div>
					<p class="mt-2 text-sm font-semibold text-slate-900 dark:text-white">{data.detail.session.status}</p>
					<p class="mt-1 text-xs text-slate-500 dark:text-slate-400">Iniciada {formatDate(data.detail.session.startedAt)}</p>
				</div>
				<div class="rounded-2xl border border-white/70 bg-white/80 px-4 py-4 dark:border-slate-800 dark:bg-slate-950/70">
					<div class="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-500 dark:text-slate-400"><Cpu class="h-3.5 w-3.5" /> Tokens</div>
					<p class="mt-2 text-2xl font-bold text-slate-900 dark:text-white">{data.detail.session.totalTokens.toLocaleString('es-ES')}</p>
					<p class="mt-1 text-xs text-slate-500 dark:text-slate-400">{data.detail.usage.logs.length} llamadas IA</p>
				</div>
				<div class="rounded-2xl border border-white/70 bg-white/80 px-4 py-4 dark:border-slate-800 dark:bg-slate-950/70">
					<div class="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-500 dark:text-slate-400"><CircleDollarSign class="h-3.5 w-3.5" /> Coste</div>
					<p class="mt-2 text-sm font-semibold text-slate-900 dark:text-white">{formatCurrency(data.detail.session.totalEstimatedCost)}</p>
					<p class="mt-1 text-xs text-slate-500 dark:text-slate-400">Última actividad {formatDate(data.detail.session.lastActivityAt)}</p>
				</div>
			</div>
		</div>
	</section>

	<nav class="flex flex-wrap gap-2">
		{#each tabs as tab (tab.id)}
			<a
				href={tabHref(tab.id)}
				class={`rounded-2xl border px-4 py-2 text-sm font-medium transition-colors ${
					data.tab === tab.id
						? 'border-sky-500 bg-sky-500 text-white'
						: 'border-slate-200 text-slate-600 hover:border-slate-300 hover:text-slate-900 dark:border-slate-800 dark:text-slate-300 dark:hover:text-white'
				}`}
			>
				{tab.label}
			</a>
		{/each}
	</nav>

	{#if data.tab === 'timeline'}
		<section class="grid gap-6 xl:grid-cols-[1.2fr_0.8fr]">
			<div class="space-y-4">
				{#each data.detail.timeline as event (event.id)}
					<button
						type="button"
						class={`w-full rounded-[1.6rem] border p-4 text-left transition-all ${eventTone(event)} ${selectedEvent?.id === event.id ? 'ring-2 ring-sky-500/60' : ''} ${data.density === 'compact' ? 'py-3' : 'py-4'}`}
						onclick={() => (selectedEventId = event.id)}
					>
						<div class="flex flex-wrap items-start justify-between gap-3">
							<div class="min-w-0 flex-1">
								<div class="flex flex-wrap items-center gap-2">
									<p class="text-sm font-semibold text-slate-900 dark:text-white">{event.title}</p>
									<span class="rounded-full border border-current/20 px-2 py-1 text-[10px] font-semibold uppercase tracking-[0.14em] text-slate-500 dark:text-slate-300">{event.kind}</span>
									{#if event.role}
										<span class="rounded-full border border-current/20 px-2 py-1 text-[10px] uppercase tracking-[0.14em] text-slate-500 dark:text-slate-300">{event.role}</span>
									{/if}
								</div>
								<p class={`mt-2 text-sm text-slate-700 dark:text-slate-200 ${data.density === 'compact' ? 'line-clamp-2' : ''}`}>{event.summary}</p>
							</div>
							<div class="text-xs text-slate-500 dark:text-slate-400">{formatDate(event.timestamp)}</div>
						</div>
					</button>
				{/each}
			</div>

			<div class="xl:sticky xl:top-24 xl:self-start">
				<div class="rounded-[2rem] border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-800 dark:bg-slate-950/70">
					{#if selectedEvent}
						<div class="flex items-center gap-2">
							<Braces class="h-4 w-4 text-slate-400" />
							<p class="text-sm font-semibold text-slate-900 dark:text-white">{selectedEvent.title}</p>
						</div>
						<p class="mt-2 text-xs text-slate-500 dark:text-slate-400">{selectedEvent.kind} · {selectedEvent.source} · {formatDate(selectedEvent.timestamp)}</p>
						<p class="mt-4 whitespace-pre-wrap text-sm text-slate-700 dark:text-slate-200">{selectedEvent.summary}</p>

						{#if selectedEvent.metrics}
							<div class="mt-5 rounded-2xl border border-slate-200 bg-slate-50 p-4 dark:border-slate-800 dark:bg-slate-900/60">
								<p class="text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-500 dark:text-slate-400">Métricas</p>
								<div class="mt-3 grid gap-3 sm:grid-cols-2">
									{#each Object.entries(selectedEvent.metrics) as [key, value] (`${selectedEvent.id}-${key}`)}
										<div class="rounded-xl border border-slate-200 bg-white px-3 py-3 dark:border-slate-800 dark:bg-slate-950/70">
											<p class="text-[11px] uppercase tracking-[0.14em] text-slate-500 dark:text-slate-400">{key}</p>
											<p class="mt-1 break-all text-sm text-slate-800 dark:text-slate-200">{typeof value === 'string' ? value : JSON.stringify(value)}</p>
										</div>
									{/each}
								</div>
							</div>
						{/if}

						<div class="mt-5">
							<JsonViewer value={selectedEvent.raw} heightClass="max-h-[28rem]" />
						</div>
					{:else}
						<p class="text-sm text-slate-500 dark:text-slate-400">Selecciona un evento para inspeccionarlo.</p>
					{/if}
				</div>
			</div>
		</section>
	{:else if data.tab === 'rounds'}
		<section class="space-y-5">
			<div class="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
				<div class="rounded-2xl border border-slate-200 bg-white px-4 py-4 dark:border-slate-800 dark:bg-slate-950/60">
					<div class="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-500 dark:text-slate-400"><Fingerprint class="h-3.5 w-3.5" /> Rondas</div>
					<p class="mt-2 text-2xl font-bold text-slate-900 dark:text-white">{data.detail.requestRounds.length}</p>
					<p class="mt-1 text-xs text-slate-500 dark:text-slate-400">Solo rondas capturadas de forma exacta</p>
				</div>
				<div class="rounded-2xl border border-slate-200 bg-white px-4 py-4 dark:border-slate-800 dark:bg-slate-950/60">
					<div class="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-500 dark:text-slate-400"><Cpu class="h-3.5 w-3.5" /> Cache hits</div>
					<p class="mt-2 text-2xl font-bold text-slate-900 dark:text-white">{data.detail.requestRounds.filter((round) => round.hasCacheHit).length}</p>
					<p class="mt-1 text-xs text-slate-500 dark:text-slate-400">Con cacheReadTokens reportados</p>
				</div>
				<div class="rounded-2xl border border-slate-200 bg-white px-4 py-4 dark:border-slate-800 dark:bg-slate-950/60">
					<div class="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-500 dark:text-slate-400"><Bot class="h-3.5 w-3.5" /> RAG</div>
					<p class="mt-2 text-2xl font-bold text-slate-900 dark:text-white">{data.detail.requestRounds.filter((round) => round.ragContextUsed).length}</p>
					<p class="mt-1 text-xs text-slate-500 dark:text-slate-400">Rondas con contexto RAG efectivo</p>
				</div>
				<div class="rounded-2xl border border-slate-200 bg-white px-4 py-4 dark:border-slate-800 dark:bg-slate-950/60">
					<div class="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-500 dark:text-slate-400"><MessageSquareText class="h-3.5 w-3.5" /> Memoria</div>
					<p class="mt-2 text-2xl font-bold text-slate-900 dark:text-white">{data.detail.requestRounds.filter((round) => round.memoryContextUsed).length}</p>
					<p class="mt-1 text-xs text-slate-500 dark:text-slate-400">Rondas con contexto dinámico de memoria</p>
				</div>
			</div>

			{#if data.detail.requestRounds.length === 0}
				<div class="rounded-[1.6rem] border border-dashed border-slate-300 bg-slate-50 px-5 py-10 text-center text-sm text-slate-500 dark:border-slate-700 dark:bg-slate-900/40 dark:text-slate-400">
					No hay rondas exactas capturadas todavía para esta sesión.
				</div>
			{:else}
				<div class="grid gap-6 xl:grid-cols-[1.05fr_0.95fr]">
					<div class="space-y-4">
						{#each data.detail.requestRounds as round (round.id)}
							<button
								type="button"
								class={`w-full rounded-[1.6rem] border p-4 text-left transition-all ${roundTone(round)} ${selectedRound?.id === round.id ? 'ring-2 ring-sky-500/60' : ''}`}
								onclick={() => (selectedRoundId = round.id)}
							>
								<div class="flex flex-wrap items-start justify-between gap-3">
									<div class="min-w-0 flex-1">
										<div class="flex flex-wrap items-center gap-2">
											<p class="text-sm font-semibold text-slate-900 dark:text-white">{round.roundType}</p>
											<span class="rounded-full border border-current/20 px-2 py-1 text-[10px] font-semibold uppercase tracking-[0.14em] text-slate-500 dark:text-slate-300">{round.status}</span>
											{#if round.hasCacheHit}
												<span class="rounded-full border border-emerald-200 bg-emerald-50 px-2 py-1 text-[10px] font-semibold uppercase tracking-[0.14em] text-emerald-700 dark:border-emerald-900/60 dark:bg-emerald-950/25 dark:text-emerald-300">cache hit</span>
											{/if}
										</div>
										<p class="mt-2 text-sm text-slate-700 dark:text-slate-200">{round.modelName || 'Sin modelo'} · {round.inputTokens} in / {round.outputTokens} out · {round.durationMs ?? 'N/A'} ms</p>
										<p class="mt-2 text-xs text-slate-500 dark:text-slate-400">
											system {round.comparison.sameSystemPromptHash === null ? 'n/a' : round.comparison.sameSystemPromptHash ? 'same' : 'diff'} ·
											messages {round.comparison.sameMessagesHash === null ? 'n/a' : round.comparison.sameMessagesHash ? 'same' : 'diff'} ·
											rag {round.comparison.sameRagContextHash === null ? 'n/a' : round.comparison.sameRagContextHash ? 'same' : 'diff'}
										</p>
										<p class="mt-2 text-xs text-slate-500 dark:text-slate-400">{round.cacheStrategy || 'Sin estrategia cacheable'} · {round.cacheReadTokens ? `${round.cacheReadTokens} read` : '0 read'} · {round.cacheWriteTokens ? `${round.cacheWriteTokens} write` : '0 write'}</p>
									</div>
									<div class="text-xs text-slate-500 dark:text-slate-400">{formatDate(round.startedAt)}</div>
								</div>
							</button>
						{/each}
					</div>

					<div class="xl:sticky xl:top-24 xl:self-start">
						<div class="rounded-[2rem] border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-800 dark:bg-slate-950/70">
							{#if selectedRound}
								<div class="flex items-center gap-2">
									<Fingerprint class="h-4 w-4 text-slate-400" />
									<p class="text-sm font-semibold text-slate-900 dark:text-white">Ronda {selectedRound.id}</p>
								</div>
								<p class="mt-2 text-xs text-slate-500 dark:text-slate-400">{selectedRound.roundType} · {selectedRound.modelName || 'Sin modelo'} · {formatDate(selectedRound.startedAt)}</p>

								<div class="mt-5 grid gap-3 sm:grid-cols-2">
									<div class="rounded-xl border border-slate-200 bg-slate-50 px-3 py-3 dark:border-slate-800 dark:bg-slate-900/60">
										<p class="text-[11px] uppercase tracking-[0.14em] text-slate-500 dark:text-slate-400">Tokens</p>
										<p class="mt-1 text-sm text-slate-800 dark:text-slate-200">{selectedRound.inputTokens} / {selectedRound.outputTokens} / {selectedRound.totalTokens}</p>
									</div>
									<div class="rounded-xl border border-slate-200 bg-slate-50 px-3 py-3 dark:border-slate-800 dark:bg-slate-900/60">
										<p class="text-[11px] uppercase tracking-[0.14em] text-slate-500 dark:text-slate-400">Cache</p>
										<p class="mt-1 text-sm text-slate-800 dark:text-slate-200">{selectedRound.cacheReadTokens ? `${selectedRound.cacheReadTokens} read` : 'Sin cache hit'}</p>
										<p class="mt-1 text-xs text-slate-500 dark:text-slate-400">{selectedRound.cacheWriteTokens ? `${selectedRound.cacheWriteTokens} write` : 'Sin cache write'}</p>
										<p class="mt-1 text-xs text-slate-500 dark:text-slate-400">{selectedRound.cacheStrategy || 'Sin estrategia cacheable'}</p>
									</div>
									<div class="rounded-xl border border-slate-200 bg-slate-50 px-3 py-3 dark:border-slate-800 dark:bg-slate-900/60">
										<p class="text-[11px] uppercase tracking-[0.14em] text-slate-500 dark:text-slate-400">RAG</p>
										<p class="mt-1 text-sm text-slate-800 dark:text-slate-200">{selectedRound.ragContextUsed ? 'Sí' : 'No'}</p>
									</div>
									<div class="rounded-xl border border-slate-200 bg-slate-50 px-3 py-3 dark:border-slate-800 dark:bg-slate-900/60">
										<p class="text-[11px] uppercase tracking-[0.14em] text-slate-500 dark:text-slate-400">Memoria</p>
										<p class="mt-1 text-sm text-slate-800 dark:text-slate-200">{selectedRound.memoryContextUsed ? 'Sí' : 'No'}</p>
									</div>
								</div>

								<div class="mt-5 space-y-4">
									<div class="rounded-2xl border border-slate-200 bg-slate-50 p-4 dark:border-slate-800 dark:bg-slate-900/60">
										<p class="text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-500 dark:text-slate-400">Comparación con ronda anterior</p>
										<div class="mt-3 grid gap-3 sm:grid-cols-2">
											<div class="rounded-xl border border-slate-200 bg-white px-3 py-3 dark:border-slate-800 dark:bg-slate-950/70"><p class="text-[11px] uppercase tracking-[0.14em] text-slate-500 dark:text-slate-400">system hash</p><p class="mt-1 text-sm text-slate-800 dark:text-slate-200">{selectedRound.comparison.sameSystemPromptHash === null ? 'n/a' : selectedRound.comparison.sameSystemPromptHash ? 'same' : 'diff'}</p></div>
											<div class="rounded-xl border border-slate-200 bg-white px-3 py-3 dark:border-slate-800 dark:bg-slate-950/70"><p class="text-[11px] uppercase tracking-[0.14em] text-slate-500 dark:text-slate-400">messages hash</p><p class="mt-1 text-sm text-slate-800 dark:text-slate-200">{selectedRound.comparison.sameMessagesHash === null ? 'n/a' : selectedRound.comparison.sameMessagesHash ? 'same' : 'diff'}</p></div>
											<div class="rounded-xl border border-slate-200 bg-white px-3 py-3 dark:border-slate-800 dark:bg-slate-950/70"><p class="text-[11px] uppercase tracking-[0.14em] text-slate-500 dark:text-slate-400">rag hash</p><p class="mt-1 text-sm text-slate-800 dark:text-slate-200">{selectedRound.comparison.sameRagContextHash === null ? 'n/a' : selectedRound.comparison.sameRagContextHash ? 'same' : 'diff'}</p></div>
											<div class="rounded-xl border border-slate-200 bg-white px-3 py-3 dark:border-slate-800 dark:bg-slate-950/70"><p class="text-[11px] uppercase tracking-[0.14em] text-slate-500 dark:text-slate-400">tools hash</p><p class="mt-1 text-sm text-slate-800 dark:text-slate-200">{selectedRound.comparison.sameToolsHash === null ? 'n/a' : selectedRound.comparison.sameToolsHash ? 'same' : 'diff'}</p></div>
										</div>
									</div>

									<div class="rounded-2xl border border-slate-200 bg-slate-50 p-4 dark:border-slate-800 dark:bg-slate-900/60">
										<p class="text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-500 dark:text-slate-400">Prompt exacto</p>
										<p class="mt-3 whitespace-pre-wrap text-sm text-slate-700 dark:text-slate-200">{selectedRound.systemPromptExact || 'No disponible'}</p>
									</div>

									<div class="rounded-2xl border border-slate-200 bg-slate-50 p-4 dark:border-slate-800 dark:bg-slate-900/60">
										<p class="text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-500 dark:text-slate-400">Payload completo</p>
										<div class="mt-3">
											<JsonViewer value={selectedRound.requestPayload} heightClass="max-h-[18rem]" />
										</div>
									</div>

									<div class="rounded-2xl border border-slate-200 bg-slate-50 p-4 dark:border-slate-800 dark:bg-slate-900/60">
										<p class="text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-500 dark:text-slate-400">Bloques serializados</p>
										<div class="mt-3 space-y-4">
											<div>
												<p class="mb-2 text-xs font-semibold uppercase tracking-[0.14em] text-slate-500 dark:text-slate-400">messagesExact</p>
												<JsonViewer value={selectedRound.messagesExact} heightClass="max-h-[12rem]" />
											</div>
											<div>
												<p class="mb-2 text-xs font-semibold uppercase tracking-[0.14em] text-slate-500 dark:text-slate-400">toolsExact</p>
												<JsonViewer value={selectedRound.toolsExact} heightClass="max-h-[12rem]" />
											</div>
											<div>
												<p class="mb-2 text-xs font-semibold uppercase tracking-[0.14em] text-slate-500 dark:text-slate-400">requestOptions</p>
												<JsonViewer value={selectedRound.requestOptions} heightClass="max-h-[12rem]" />
											</div>
											<div>
												<p class="mb-2 text-xs font-semibold uppercase tracking-[0.14em] text-slate-500 dark:text-slate-400">ragContextExact</p>
												<JsonViewer value={selectedRound.ragContextExact} heightClass="max-h-[12rem]" />
											</div>
											<div>
												<p class="mb-2 text-xs font-semibold uppercase tracking-[0.14em] text-slate-500 dark:text-slate-400">ragSources</p>
												<JsonViewer value={selectedRound.ragSources} heightClass="max-h-[12rem]" />
											</div>
											<div>
												<p class="mb-2 text-xs font-semibold uppercase tracking-[0.14em] text-slate-500 dark:text-slate-400">memoryContextExact</p>
												<JsonViewer value={selectedRound.memoryContextExact} heightClass="max-h-[12rem]" />
											</div>
										</div>
									</div>

									<div class="rounded-2xl border border-slate-200 bg-slate-50 p-4 dark:border-slate-800 dark:bg-slate-900/60">
										<p class="text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-500 dark:text-slate-400">Respuesta y uso</p>
										<div class="mt-3 space-y-4">
											<JsonViewer value={selectedRound.responseSummary} heightClass="max-h-[12rem]" />
											<JsonViewer value={selectedRound.providerUsage} heightClass="max-h-[12rem]" />
										</div>
									</div>
								</div>
							{:else}
								<p class="text-sm text-slate-500 dark:text-slate-400">Selecciona una ronda para inspeccionarla.</p>
							{/if}
						</div>
					</div>
				</div>
			{/if}
		</section>
	{:else if data.tab === 'prompts'}
		<section class="grid gap-4 xl:grid-cols-2">
			{#each Object.values(data.detail.prompts) as prompt (prompt.label)}
				<article class={`rounded-[2rem] border p-5 ${promptCardClasses(prompt.origin)}`}>
					<div class="flex flex-wrap items-center gap-2">
						<p class="text-sm font-semibold text-slate-900 dark:text-white">{prompt.label}</p>
						<span class="rounded-full border border-current/20 px-2.5 py-1 text-[11px] font-semibold uppercase tracking-[0.14em]">{prompt.origin}</span>
					</div>
					<p class="mt-3 whitespace-pre-wrap text-sm text-slate-700 dark:text-slate-200">{prompt.value || 'No disponible'}</p>
					{#if prompt.note}
						<p class="mt-3 text-xs text-slate-500 dark:text-slate-400">{prompt.note}</p>
					{/if}
				</article>
			{/each}
		</section>
	{:else if data.tab === 'usage'}
		<section class="space-y-5 rounded-[2rem] border border-slate-200 bg-white p-6 dark:border-slate-800 dark:bg-slate-950/60">
			<div class="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
				<div class="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-4 dark:border-slate-800 dark:bg-slate-900/60">
					<p class="text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-500 dark:text-slate-400">Requests</p>
					<p class="mt-2 text-2xl font-bold text-slate-900 dark:text-white">{data.detail.usage.requestCount}</p>
				</div>
				<div class="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-4 dark:border-slate-800 dark:bg-slate-900/60">
					<p class="text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-500 dark:text-slate-400">Tokens</p>
					<p class="mt-2 text-2xl font-bold text-slate-900 dark:text-white">{data.detail.usage.totalTokens.toLocaleString('es-ES')}</p>
				</div>
				<div class="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-4 dark:border-slate-800 dark:bg-slate-900/60">
					<p class="text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-500 dark:text-slate-400">Coste</p>
					<p class="mt-2 text-2xl font-bold text-slate-900 dark:text-white">{formatCurrency(data.detail.usage.totalEstimatedCost)}</p>
				</div>
				<div class="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-4 dark:border-slate-800 dark:bg-slate-900/60">
					<p class="text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-500 dark:text-slate-400">Duración media</p>
					<p class="mt-2 text-2xl font-bold text-slate-900 dark:text-white">{data.detail.usage.averageDurationMs} ms</p>
				</div>
			</div>

			<div class="overflow-x-auto">
				<table class="min-w-full divide-y divide-slate-200 dark:divide-slate-800">
					<thead class="bg-slate-50/80 dark:bg-slate-900/80">
						<tr class="text-left text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500 dark:text-slate-400">
							<th class="px-4 py-3">Fecha</th>
							<th class="px-4 py-3">Modelo</th>
							<th class="px-4 py-3">Tokens</th>
							<th class="px-4 py-3">Duración</th>
							<th class="px-4 py-3">Coste</th>
							<th class="px-4 py-3">Estado</th>
						</tr>
					</thead>
					<tbody class="divide-y divide-slate-200 dark:divide-slate-800">
						{#each data.detail.usage.logs as log (log.id)}
							<tr>
								<td class="px-4 py-4 text-xs text-slate-600 dark:text-slate-300">{formatDate(log.createdAt)}</td>
								<td class="px-4 py-4 text-sm text-slate-700 dark:text-slate-300">{log.modelName || 'Sin modelo'}</td>
								<td class="px-4 py-4 text-sm text-slate-700 dark:text-slate-300">{log.inputTokens} / {log.outputTokens} / {log.totalTokens}</td>
								<td class="px-4 py-4 text-sm text-slate-700 dark:text-slate-300">{log.durationMs ?? 'N/A'} ms</td>
								<td class="px-4 py-4 text-sm font-semibold text-slate-900 dark:text-white">{formatCurrency(log.estimatedCost)}</td>
								<td class="px-4 py-4">
									{#if log.success}
										<span class="inline-flex items-center gap-1 rounded-full border border-emerald-200 bg-emerald-50 px-2.5 py-1 text-[11px] font-semibold uppercase tracking-[0.14em] text-emerald-700 dark:border-emerald-900/60 dark:bg-emerald-950/30 dark:text-emerald-300">
											<CheckCircle2 class="h-3.5 w-3.5" />
											OK
										</span>
									{:else}
										<span class="inline-flex items-center gap-1 rounded-full border border-rose-200 bg-rose-50 px-2.5 py-1 text-[11px] font-semibold uppercase tracking-[0.14em] text-rose-700 dark:border-rose-900/60 dark:bg-rose-950/30 dark:text-rose-300">
											<AlertTriangle class="h-3.5 w-3.5" />
											Error
										</span>
									{/if}
								</td>
							</tr>
						{/each}
					</tbody>
				</table>
			</div>
		</section>
	{:else if data.tab === 'metadata'}
		<section class="grid gap-6 xl:grid-cols-2">
			<div class="space-y-4 rounded-[2rem] border border-slate-200 bg-white p-6 dark:border-slate-800 dark:bg-slate-950/60">
				<div class="flex items-center gap-2">
					<Database class="h-4 w-4 text-slate-400" />
					<h2 class="text-sm font-semibold uppercase tracking-[0.16em] text-slate-500 dark:text-slate-400">Contexto de chat</h2>
				</div>
				<div class="grid gap-3 sm:grid-cols-2">
					<div class="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-4 dark:border-slate-800 dark:bg-slate-900/60">
						<p class="text-[11px] uppercase tracking-[0.14em] text-slate-500 dark:text-slate-400">Creado</p>
						<p class="mt-2 text-sm text-slate-900 dark:text-white">{formatDate(data.detail.chat.createdAt)}</p>
					</div>
					<div class="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-4 dark:border-slate-800 dark:bg-slate-900/60">
						<p class="text-[11px] uppercase tracking-[0.14em] text-slate-500 dark:text-slate-400">Actualizado</p>
						<p class="mt-2 text-sm text-slate-900 dark:text-white">{formatDate(data.detail.chat.updatedAt)}</p>
					</div>
				</div>
				<JsonViewer value={data.detail.chat.metadata} />
			</div>

			<div class="space-y-4 rounded-[2rem] border border-slate-200 bg-white p-6 dark:border-slate-800 dark:bg-slate-950/60">
				<div class="flex items-center gap-2">
					<CalendarClock class="h-4 w-4 text-slate-400" />
					<h2 class="text-sm font-semibold uppercase tracking-[0.16em] text-slate-500 dark:text-slate-400">Resumen técnico</h2>
				</div>
				<div class="space-y-3 text-sm text-slate-700 dark:text-slate-300">
					<div class="flex items-center justify-between gap-3"><span>Mensajes</span><span class="font-semibold text-slate-900 dark:text-white">{data.detail.session.totalMessages}</span></div>
					<div class="flex items-center justify-between gap-3"><span>Tool calls</span><span class="font-semibold text-slate-900 dark:text-white">{data.detail.session.toolCallCount}</span></div>
					<div class="flex items-center justify-between gap-3"><span>UI responses</span><span class="font-semibold text-slate-900 dark:text-white">{data.detail.session.uiResponseCount}</span></div>
					<div class="flex items-center justify-between gap-3"><span>Finalizada</span><span class="font-semibold text-slate-900 dark:text-white">{data.detail.session.isFinalized ? 'Si' : 'No'}</span></div>
				</div>

				<div class="flex flex-wrap gap-2">
					{#each data.detail.session.alerts as alert (`alert-${alert}`)}
						<span class="rounded-full border border-slate-200 px-2.5 py-1 text-[11px] text-slate-600 dark:border-slate-700 dark:text-slate-300">{alert}</span>
					{/each}
				</div>
			</div>
		</section>
	{:else}
		<RawSections sections={data.detail.rawSections} />
	{/if}
</div>
