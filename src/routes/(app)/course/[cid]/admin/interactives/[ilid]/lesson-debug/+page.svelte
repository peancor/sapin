<script lang="ts">
	import { goto } from '$app/navigation';
	import { resolve } from '$app/paths';
	import { page } from '$app/state';
	import type { PageProps } from './$types';

	import AgentTranscriptReadOnly from '$lib/components/agent/AgentTranscriptReadOnly.svelte';
	import RawSections from '$lib/components/activity-debugger/RawSections.svelte';
	import LessonRuntimePanel from '$lib/components/lesson/LessonRuntimePanel.svelte';
	import { formatDate } from '$lib/helpers/dateUtils';
	import type { LessonDebugBlockSummary, LessonDebugPreviewMode } from '$lib/types/lessonDebug';
	import {
		ArrowLeft,
		ArrowRightCircle,
		Bug,
		CalendarClock,
		ChevronRight,
		Clock3,
		Flag,
		Play,
		RefreshCcw,
		SquareTerminal
	} from 'lucide-svelte';

	type InspectorTab = 'definition' | 'resolved' | 'state' | 'transitions' | 'agent' | 'events';

	let { data }: PageProps = $props();
	let pendingAction = $state<string | null>(null);
	let actionError = $state('');
	let activeTab = $state<InspectorTab>(
		(page.url.searchParams.get('tab') as InspectorTab | null) ?? 'definition'
	);

	const snapshot = $derived.by(() => data.snapshot);
	const selectedSessionId = $derived.by(
		() => snapshot.sessionOptions.find((session) => session.isSelected)?.id ?? ''
	);
	const definitionSections = $derived.by(() => [
		{
			id: 'original-block',
			label: 'Bloque original',
			description: 'Definición persistida en la revisión activa.',
			data: snapshot.inspector.originalBlock
		},
		{
			id: 'graph-summary',
			label: 'Grafo',
			description: 'Entradas, salidas y contrato del bloque.',
			data: snapshot.inspector.graph
		}
	]);
	const resolvedSections = $derived.by(() => [
		{
			id: 'resolved-block',
			label: 'Bloque resuelto',
			description: 'Plantillas aplicadas con el estado actual de la preview.',
			data: snapshot.inspector.resolvedBlock
		}
	]);
	const stateSections = $derived.by(() => [
		{
			id: 'block-state',
			label: 'Estado agregado',
			description: 'Último estado consolidado del bloque.',
			data: snapshot.inspector.state
		},
		{
			id: 'latest-visit',
			label: 'Última visita',
			description: 'Instantánea de la visita más reciente del bloque.',
			data: snapshot.inspector.latestVisit
		}
	]);
	const eventSections = $derived.by(() => [
		{
			id: 'block-events',
			label: 'Eventos del bloque',
			description: 'Eventos filtrados para la selección actual.',
			data: snapshot.inspector.sessionEvents
		},
		{
			id: 'session-events',
			label: 'Eventos de sesión',
			description: 'Timeline completo de la sesión preview.',
			data: snapshot.events
		}
	]);
	const tabItems: Array<{ id: InspectorTab; label: string }> = [
		{ id: 'definition', label: 'Definición' },
		{ id: 'resolved', label: 'Resuelto' },
		{ id: 'state', label: 'Estado' },
		{ id: 'transitions', label: 'Transiciones' },
		{ id: 'agent', label: 'Agent/Tools' },
		{ id: 'events', label: 'Eventos' }
	];

	function buildHref(
		changes: Partial<Record<'mode' | 'sessionId' | 'blockId' | 'tab', string | null>>
	): string {
		const params = new URLSearchParams(page.url.search);

		for (const [key, value] of Object.entries(changes)) {
			if (value === null || value === '') {
				params.delete(key);
				continue;
			}
			params.set(key, value);
		}

		const query = params.toString();
		return query ? `${page.url.pathname}?${query}` : page.url.pathname;
	}

	function blockKindTone(summary: LessonDebugBlockSummary): string {
		if (summary.isSelected) {
			return 'border-sky-300 bg-sky-50 text-sky-900 dark:border-sky-700 dark:bg-sky-950/30 dark:text-sky-50';
		}
		if (summary.isCurrent) {
			return 'border-emerald-300 bg-emerald-50 text-emerald-900 dark:border-emerald-700 dark:bg-emerald-950/30 dark:text-emerald-50';
		}
		if (summary.hasAlerts) {
			return 'border-amber-300 bg-amber-50 text-amber-900 dark:border-amber-700 dark:bg-amber-950/30 dark:text-amber-50';
		}
		return 'border-slate-200 bg-white text-slate-900 hover:border-slate-300 dark:border-slate-800 dark:bg-slate-950/50 dark:text-slate-100';
	}

	function visualBadge(summary: LessonDebugBlockSummary): string {
		if (summary.isCurrent) return 'Actual';
		if (summary.completed) return 'Completado';
		if (summary.visualState === 'visited') return 'Visitado';
		return 'Pendiente';
	}

	async function postJson(url: string, payload: unknown) {
		const response = await fetch(url, {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify(payload)
		});
		const result = (await response.json().catch(() => ({}))) as {
			error?: string;
			sessionId?: string;
		};
		if (!response.ok) {
			throw new Error(result.error || 'La operación no se pudo completar');
		}
		return result;
	}

	async function runAction(actionId: string, callback: () => Promise<void>) {
		pendingAction = actionId;
		actionError = '';
		try {
			await callback();
		} catch (error) {
			actionError = error instanceof Error ? error.message : 'La operación no se pudo completar';
		} finally {
			pendingAction = null;
		}
	}

	async function switchPreviewMode(mode: LessonDebugPreviewMode) {
		if (mode === snapshot.previewMode) return;
		await goto(buildHref({ mode, sessionId: null, blockId: null }), {
			invalidateAll: true,
			keepFocus: true
		});
	}

	async function selectSession(sessionId: string) {
		await goto(buildHref({ sessionId, blockId: null }), {
			invalidateAll: true,
			keepFocus: true,
			noScroll: true
		});
	}

	async function selectBlock(blockId: string) {
		await goto(buildHref({ blockId }), {
			invalidateAll: true,
			keepFocus: true,
			noScroll: true
		});
	}

	async function selectTab(tab: InspectorTab) {
		activeTab = tab;
		await goto(buildHref({ tab }), {
			replaceState: true,
			noScroll: true,
			keepFocus: true
		});
	}

	async function createPreviewSession() {
		await runAction('new-session', async () => {
			const result = await postJson(
				`/api/lesson/${page.params.ilid}/preview/session/debug/select-or-create`,
				{
					courseId: page.params.cid,
					previewMode: snapshot.previewMode,
					forceNew: true
				}
			);
			await goto(buildHref({ sessionId: result.sessionId ?? null, blockId: null }), {
				invalidateAll: true
			});
		});
	}

	async function resetPreviewSession() {
		if (!selectedSessionId) return;
		await runAction('reset-session', async () => {
			const result = await postJson(
				`/api/lesson/${page.params.ilid}/preview/session/${selectedSessionId}/debug/reset`,
				{
					courseId: page.params.cid
				}
			);
			await goto(buildHref({ sessionId: result.sessionId ?? null, blockId: null }), {
				invalidateAll: true
			});
		});
	}

	async function jumpToBlock(blockId: string) {
		if (!selectedSessionId) return;
		await runAction(`jump-${blockId}`, async () => {
			await postJson(
				`/api/lesson/${page.params.ilid}/preview/session/${selectedSessionId}/debug/jump`,
				{
					courseId: page.params.cid,
					blockId
				}
			);
			await goto(buildHref({ blockId }), {
				invalidateAll: true
			});
		});
	}

	async function handleSessionReplaced(sessionId: string) {
		await goto(buildHref({ sessionId, blockId: null }), {
			invalidateAll: true
		});
	}
</script>

<div class="min-h-screen bg-[radial-gradient(circle_at_top_left,_rgba(14,165,233,0.08),_transparent_22%),radial-gradient(circle_at_top_right,_rgba(16,185,129,0.08),_transparent_18%),linear-gradient(180deg,_#f8fafc_0%,_#eef2ff_100%)] dark:bg-[radial-gradient(circle_at_top_left,_rgba(14,165,233,0.1),_transparent_22%),radial-gradient(circle_at_top_right,_rgba(16,185,129,0.08),_transparent_18%),linear-gradient(180deg,_#020617_0%,_#111827_100%)]">
	<div class="sticky top-0 z-20 border-b border-white/70 bg-white/85 backdrop-blur-xl dark:border-slate-800 dark:bg-slate-950/85">
		<div class="mx-auto flex max-w-[1800px] items-center gap-4 px-4 py-4 sm:px-6">
			<a
				href={resolve(`/course/${page.params.cid}/admin/interactives/${page.params.ilid}`)}
				class="inline-flex h-10 w-10 items-center justify-center rounded-2xl border border-slate-200 bg-white text-slate-600 transition-colors hover:border-sky-300 hover:text-sky-700 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300 dark:hover:border-sky-700 dark:hover:text-sky-200"
				aria-label="Volver a la actividad"
			>
				<ArrowLeft class="h-4 w-4" />
			</a>

			<div class="min-w-0 flex-1">
				<p class="text-[11px] font-semibold uppercase tracking-[0.24em] text-sky-700 dark:text-sky-300">
					Lesson debugger
				</p>
				<h1 class="truncate text-lg font-semibold text-slate-900 dark:text-white sm:text-xl">
					{snapshot.activity.name}
				</h1>
			</div>

			<div class="hidden items-center gap-2 xl:flex">
				<span class="rounded-full border border-slate-200 bg-white px-3 py-1 text-xs font-medium text-slate-600 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300">
					Bloque actual: {snapshot.currentBlockId}
				</span>
				<span class="rounded-full border border-slate-200 bg-white px-3 py-1 text-xs font-medium text-slate-600 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300">
					Seleccionado: {snapshot.selectedBlockId}
				</span>
			</div>
		</div>
	</div>

	<div class="mx-auto max-w-[1800px] space-y-6 px-4 py-6 sm:px-6">
		{#if actionError}
			<div class="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700 dark:border-rose-900/60 dark:bg-rose-950/25 dark:text-rose-200">
				{actionError}
			</div>
		{/if}

		<div class="grid gap-6 xl:grid-cols-[320px_minmax(0,1.3fr)_420px]">
			<aside class="space-y-5 xl:sticky xl:top-24 xl:self-start">
				<section class="rounded-[28px] border border-slate-200/80 bg-white/95 p-5 shadow-sm dark:border-slate-800 dark:bg-slate-900/88">
					<div class="flex items-center gap-3">
						<div class="rounded-2xl bg-sky-100 p-3 text-sky-700 dark:bg-sky-950/50 dark:text-sky-300">
							<Bug class="h-5 w-5" />
						</div>
						<div>
							<p class="text-sm font-semibold text-slate-900 dark:text-white">Controles</p>
							<p class="text-xs text-slate-500 dark:text-slate-400">
								Sesiones preview reales y navegación libre.
							</p>
						</div>
					</div>

					<div class="mt-5 space-y-4">
						<div class="grid grid-cols-2 gap-2">
							<button
								type="button"
								class={`rounded-2xl border px-3 py-2 text-sm font-medium transition-colors ${
									snapshot.previewMode === 'draft'
										? 'border-sky-500 bg-sky-500 text-white'
										: 'border-slate-200 bg-white text-slate-700 hover:border-sky-300 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200'
								}`}
								onclick={() => switchPreviewMode('draft')}
								disabled={pendingAction !== null}
							>
								Draft
							</button>
							<button
								type="button"
								class={`rounded-2xl border px-3 py-2 text-sm font-medium transition-colors ${
									snapshot.previewMode === 'published'
										? 'border-sky-500 bg-sky-500 text-white'
										: 'border-slate-200 bg-white text-slate-700 hover:border-sky-300 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200'
								}`}
								onclick={() => switchPreviewMode('published')}
								disabled={pendingAction !== null}
							>
								Published
							</button>
						</div>

						<label class="block">
							<span class="mb-2 block text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-500 dark:text-slate-400">
								Sesión preview
							</span>
							<select
								class="w-full rounded-2xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 dark:border-slate-700 dark:bg-slate-900 dark:text-white"
								value={selectedSessionId}
								onchange={(event) => selectSession((event.currentTarget as HTMLSelectElement).value)}
								disabled={pendingAction !== null}
							>
								{#each snapshot.sessionOptions as session (session.id)}
									<option value={session.id}>
										Intento #{session.attemptNumber} · {session.status} · {formatDate(session.lastActiveAt)}
									</option>
								{/each}
							</select>
						</label>

						<div class="grid gap-2">
							<button
								type="button"
								class="inline-flex items-center justify-center gap-2 rounded-2xl bg-slate-900 px-4 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-slate-700 disabled:opacity-50 dark:bg-sky-500 dark:text-slate-950 dark:hover:bg-sky-400"
								onclick={createPreviewSession}
								disabled={pendingAction !== null}
							>
								<Play class="h-4 w-4" />
								Nueva sesión preview
							</button>
							<button
								type="button"
								class="inline-flex items-center justify-center gap-2 rounded-2xl border border-slate-200 px-4 py-2.5 text-sm font-medium text-slate-700 transition-colors hover:border-slate-300 hover:bg-slate-50 disabled:opacity-50 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-800"
								onclick={resetPreviewSession}
								disabled={!selectedSessionId || pendingAction !== null}
							>
								<RefreshCcw class="h-4 w-4" />
								Reiniciar sesión
							</button>
							<button
								type="button"
								class="inline-flex items-center justify-center gap-2 rounded-2xl border border-slate-200 px-4 py-2.5 text-sm font-medium text-slate-700 transition-colors hover:border-slate-300 hover:bg-slate-50 disabled:opacity-50 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-800"
								onclick={() => jumpToBlock(snapshot.blockSummaries.find((block) => block.isEntry)?.blockId ?? snapshot.currentBlockId)}
								disabled={pendingAction !== null}
							>
								<Flag class="h-4 w-4" />
								Ir al entry block
							</button>
							{#if snapshot.selectedBlockId !== snapshot.currentBlockId}
								<button
									type="button"
									class="inline-flex items-center justify-center gap-2 rounded-2xl border border-slate-200 px-4 py-2.5 text-sm font-medium text-slate-700 transition-colors hover:border-slate-300 hover:bg-slate-50 disabled:opacity-50 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-800"
									onclick={() => jumpToBlock(snapshot.selectedBlockId)}
									disabled={pendingAction !== null}
								>
									<ArrowRightCircle class="h-4 w-4" />
									Saltar a este bloque
								</button>
							{/if}
						</div>
					</div>
				</section>

				<section class="rounded-[28px] border border-slate-200/80 bg-white/95 p-5 shadow-sm dark:border-slate-800 dark:bg-slate-900/88">
					<div class="flex items-center justify-between gap-3">
						<div>
							<p class="text-sm font-semibold text-slate-900 dark:text-white">Bloques</p>
							<p class="text-xs text-slate-500 dark:text-slate-400">
								Selecciona cualquier nodo para inspeccionarlo.
							</p>
						</div>
						<span class="rounded-full border border-slate-200 px-2.5 py-1 text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-500 dark:border-slate-700 dark:text-slate-400">
							{snapshot.blockSummaries.length}
						</span>
					</div>

					<div class="mt-4 space-y-3">
						{#each snapshot.blockSummaries as summary (summary.blockId)}
							<button
								type="button"
								class={`w-full rounded-[24px] border px-4 py-4 text-left transition-colors ${blockKindTone(summary)}`}
								onclick={() => selectBlock(summary.blockId)}
							>
								<div class="flex items-start justify-between gap-3">
									<div class="min-w-0">
										<div class="flex flex-wrap items-center gap-2">
											<p class="truncate text-sm font-semibold">{summary.title}</p>
											{#if summary.isEntry}
												<span class="rounded-full bg-slate-900/10 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.14em] dark:bg-white/10">
													Entrada
												</span>
											{/if}
										</div>
										<p class="mt-1 text-xs uppercase tracking-[0.16em] opacity-70">
											{summary.kind} · {summary.blockId}
										</p>
									</div>
									<ChevronRight class="mt-0.5 h-4 w-4 shrink-0 opacity-60" />
								</div>

								<div class="mt-3 flex flex-wrap gap-2 text-[11px] font-medium">
									<span class="rounded-full bg-black/5 px-2.5 py-1 dark:bg-white/10">
										{visualBadge(summary)}
									</span>
									<span class="rounded-full bg-black/5 px-2.5 py-1 dark:bg-white/10">
										Visitas: {summary.visitCount}
									</span>
									{#if summary.revisited}
										<span class="rounded-full bg-black/5 px-2.5 py-1 dark:bg-white/10">Revisita</span>
									{/if}
									{#if summary.hasAlerts}
										<span class="rounded-full bg-black/5 px-2.5 py-1 dark:bg-white/10">Alertas</span>
									{/if}
								</div>
							</button>
						{/each}
					</div>
				</section>
			</aside>

			<section class="min-w-0 space-y-5">
				<div class="rounded-[30px] border border-slate-200/80 bg-white/92 p-5 shadow-sm dark:border-slate-800 dark:bg-slate-900/88">
					<div class="grid gap-4 md:grid-cols-3">
						<div class="rounded-2xl bg-slate-100/80 px-4 py-3 dark:bg-slate-800/80">
							<p class="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500 dark:text-slate-400">
								Intento
							</p>
							<p class="mt-1 text-lg font-semibold text-slate-900 dark:text-white">
								#{snapshot.sessionOptions.find((session) => session.isSelected)?.attemptNumber ?? '—'}
							</p>
						</div>
						<div class="rounded-2xl bg-slate-100/80 px-4 py-3 dark:bg-slate-800/80">
							<p class="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500 dark:text-slate-400">
								Modo
							</p>
							<p class="mt-1 text-lg font-semibold text-slate-900 capitalize dark:text-white">
								{snapshot.previewMode}
							</p>
						</div>
						<div class="rounded-2xl bg-slate-100/80 px-4 py-3 dark:bg-slate-800/80">
							<p class="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500 dark:text-slate-400">
								Bloque actual
							</p>
							<p class="mt-1 text-lg font-semibold text-slate-900 dark:text-white">
								{snapshot.currentBlockId}
							</p>
						</div>
					</div>
				</div>

				<LessonRuntimePanel
					data={snapshot.runtimeView}
					backHref={resolve(`/course/${page.params.cid}/admin/interactives/${page.params.ilid}`)}
					backLabel="Volver a la actividad"
					onSessionReplaced={handleSessionReplaced}
				/>
			</section>

			<aside class="space-y-5 xl:sticky xl:top-24 xl:self-start">
				<section class="rounded-[30px] border border-slate-200/80 bg-white/92 shadow-sm dark:border-slate-800 dark:bg-slate-900/88">
					<div class="border-b border-slate-200/80 px-5 py-4 dark:border-slate-800">
						<div class="flex items-center gap-3">
							<div class="rounded-2xl bg-emerald-100 p-3 text-emerald-700 dark:bg-emerald-950/50 dark:text-emerald-300">
								<SquareTerminal class="h-5 w-5" />
							</div>
							<div>
								<p class="text-sm font-semibold text-slate-900 dark:text-white">Inspector técnico</p>
								<p class="text-xs text-slate-500 dark:text-slate-400">
									{snapshot.inspector.blockId} · {snapshot.inspector.originalBlock.kind}
								</p>
							</div>
						</div>
					</div>

					<div class="border-b border-slate-200/80 px-3 py-3 dark:border-slate-800">
						<div class="flex flex-wrap gap-2">
							{#each tabItems as tab (tab.id)}
								<button
									type="button"
									class={`rounded-full px-3 py-1.5 text-xs font-semibold transition-colors ${
										activeTab === tab.id
											? 'bg-slate-900 text-white dark:bg-sky-500 dark:text-slate-950'
											: 'bg-slate-100 text-slate-600 hover:bg-slate-200 dark:bg-slate-800 dark:text-slate-300 dark:hover:bg-slate-700'
									}`}
									onclick={() => selectTab(tab.id)}
								>
									{tab.label}
								</button>
							{/each}
						</div>
					</div>

					<div class="space-y-4 px-5 py-5">
						{#if activeTab === 'definition'}
							<div class="space-y-4">
								<div class="grid gap-3 sm:grid-cols-2">
									<div class="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 dark:border-slate-800 dark:bg-slate-950/50">
										<p class="text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-500 dark:text-slate-400">Entradas</p>
										<p class="mt-1 text-sm font-medium text-slate-900 dark:text-white">
											{snapshot.inspector.graph.incomingBlockIds.length
												? snapshot.inspector.graph.incomingBlockIds.join(', ')
												: 'Ninguna'}
										</p>
									</div>
									<div class="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 dark:border-slate-800 dark:bg-slate-950/50">
										<p class="text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-500 dark:text-slate-400">Salidas</p>
										<p class="mt-1 text-sm font-medium text-slate-900 dark:text-white">
											{snapshot.inspector.graph.outgoingBlockIds.length
												? snapshot.inspector.graph.outgoingBlockIds.join(', ')
												: 'Ninguna'}
										</p>
									</div>
								</div>

								<RawSections sections={definitionSections} />
							</div>
						{:else if activeTab === 'resolved'}
							<RawSections sections={resolvedSections} />
						{:else if activeTab === 'state'}
							<div class="space-y-4">
								<div class="grid gap-3 sm:grid-cols-2">
									<div class="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 dark:border-slate-800 dark:bg-slate-950/50">
										<p class="text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-500 dark:text-slate-400">Visit count</p>
										<p class="mt-1 text-base font-semibold text-slate-900 dark:text-white">
											{snapshot.inspector.state?.visitCount ?? 0}
										</p>
									</div>
									<div class="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 dark:border-slate-800 dark:bg-slate-950/50">
										<p class="text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-500 dark:text-slate-400">Última visita</p>
										<p class="mt-1 text-sm font-medium text-slate-900 dark:text-white">
											{snapshot.inspector.latestVisit
												? `#${snapshot.inspector.latestVisit.visitNumber}`
												: 'Sin visitas'}
										</p>
									</div>
								</div>

								<RawSections sections={stateSections} />
							</div>
						{:else if activeTab === 'transitions'}
							<div class="space-y-3">
								{#if snapshot.inspector.transitions.length === 0}
									<div class="rounded-2xl border border-dashed border-slate-300 px-4 py-6 text-sm text-slate-500 dark:border-slate-700 dark:text-slate-400">
										Este bloque no tiene salidas evaluables.
									</div>
								{:else}
									{#each snapshot.inspector.transitions as transition (transition.id)}
										<div class="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-4 dark:border-slate-800 dark:bg-slate-950/50">
											<div class="flex flex-wrap items-center gap-2">
												<span class={`rounded-full px-2.5 py-1 text-[11px] font-semibold uppercase tracking-[0.14em] ${
													transition.matches
														? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300'
														: 'bg-slate-200 text-slate-700 dark:bg-slate-800 dark:text-slate-300'
												}`}>
													{transition.kind}
												</span>
												<span class="text-sm font-semibold text-slate-900 dark:text-white">
													{transition.label || transition.targetBlockId}
												</span>
												<span class="text-xs text-slate-500 dark:text-slate-400">
													→ {transition.targetBlockId}
												</span>
											</div>
											<p class="mt-3 text-sm text-slate-700 dark:text-slate-200">{transition.reason}</p>
											{#if transition.source}
												<div class="mt-3 rounded-xl bg-white px-3 py-3 text-xs text-slate-600 dark:bg-slate-900 dark:text-slate-300">
													<p><span class="font-semibold">Source:</span> {transition.source}</p>
													<p class="mt-1"><span class="font-semibold">Operator:</span> {transition.operator}</p>
													<p class="mt-1"><span class="font-semibold">Actual:</span> {JSON.stringify(transition.actualValue)}</p>
													<p class="mt-1"><span class="font-semibold">Expected:</span> {JSON.stringify(transition.expectedValue)}</p>
												</div>
											{/if}
										</div>
									{/each}
								{/if}
							</div>
						{:else if activeTab === 'agent'}
							<div class="space-y-4">
								{#if !snapshot.inspector.agentTranscript}
									<div class="rounded-2xl border border-dashed border-slate-300 px-4 py-6 text-sm text-slate-500 dark:border-slate-700 dark:text-slate-400">
										Este bloque no tiene transcript agéntico asociado.
									</div>
								{:else if snapshot.inspector.agentTranscript.mode === 'agent'}
									<AgentTranscriptReadOnly
										messages={snapshot.inspector.agentTranscript.runtimeMessages}
										emptyMessage="No hay mensajes visibles en esta conversación agéntica."
									/>
								{:else}
									<div class="space-y-3">
										{#each snapshot.inspector.agentTranscript.basicMessages as message (message.id)}
											<article class="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-4 dark:border-slate-800 dark:bg-slate-950/50">
												<div class="flex items-center justify-between gap-3">
													<p class="text-xs font-semibold uppercase tracking-[0.16em] text-slate-500 dark:text-slate-400">
														{message.type}
													</p>
													<p class="text-xs text-slate-500 dark:text-slate-400">
														{formatDate(message.createdAt)}
													</p>
												</div>
												<p class="mt-3 whitespace-pre-wrap text-sm text-slate-800 dark:text-slate-100">
													{message.content}
												</p>
											</article>
										{/each}
									</div>
								{/if}
							</div>
						{:else}
							<div class="space-y-4">
								<div class="space-y-3">
									{#each snapshot.inspector.visits as visit (visit.visitId)}
										<div class="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-4 dark:border-slate-800 dark:bg-slate-950/50">
											<div class="flex flex-wrap items-center gap-2">
												<span class="rounded-full bg-slate-900/10 px-2.5 py-1 text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-700 dark:bg-white/10 dark:text-slate-300">
													Visita {visit.visitNumber}
												</span>
												<span class="text-sm font-medium text-slate-900 dark:text-white">
													{visit.status}
												</span>
											</div>
											<div class="mt-3 flex flex-wrap gap-4 text-xs text-slate-500 dark:text-slate-400">
												<span class="inline-flex items-center gap-1">
													<Clock3 class="h-3.5 w-3.5" />
													{formatDate(visit.enteredAt)}
												</span>
												{#if visit.completedAt}
													<span class="inline-flex items-center gap-1">
														<CalendarClock class="h-3.5 w-3.5" />
														{formatDate(visit.completedAt)}
													</span>
												{/if}
											</div>
										</div>
									{/each}
								</div>

								<RawSections sections={eventSections} />
							</div>
						{/if}
					</div>
				</section>
			</aside>
		</div>
	</div>
</div>
