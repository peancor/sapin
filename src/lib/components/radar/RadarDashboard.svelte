<script lang="ts">
	import { onMount, tick, untrack } from 'svelte';
	import { page } from '$app/state';
	import { replaceState } from '$app/navigation';
	import { base, resolve } from '$app/paths';
	import { Button, Spinner } from 'flowbite-svelte';
	import {
		MessageSquare,
		Clock,
		Users,
		Sparkles,
		ArrowUpRight,
		ChevronDown,
		X,
		RefreshCw
	} from 'lucide-svelte';
	import EChart from '$lib/components/charts/EChart.svelte';
	import RadarText from '$lib/components/radar/RadarText.svelte';
	import { theme } from '$lib/stores/theme';
	import {
		radarIntentLabels,
		type RadarEvidencePage,
		type RadarHistory,
		type RadarModel,
		type RadarRunView,
		type RadarSnapshot,
		type RadarTopicView,
		type RadarWindow
	} from '$lib/types/radar';
	let {
		data
	}: {
		data: {
			course: { id: string };
			interactive: { id: string; name: string };
			radarModels: RadarModel[];
			radarHistory: RadarHistory;
		};
	} = $props();
	const api = $derived(
		`${base}/api/course/${data.course.id}/interactives/${data.interactive.id}/radar`
	);
	let history = $state<RadarHistory>(untrack(() => data.radarHistory));
	let snapshot = $state<RadarSnapshot | null>(null);
	let selectedRun = $state<string | null>(null);
	let selectedWindow = $state<RadarWindow>('recent');
	let title = $state('');
	let duration = $state(90);
	let modelId = $state(untrack(() => data.radarModels.find((model) => model.isDefault)?.id ?? ''));
	let context = $state('');
	let showStart = $state(false);
	let busy = $state(false);
	let loading = $state(false);
	let error = $state('');
	let pollingError = $state('');
	let notice = $state('');
	let editing = $state(false);
	let editedTitle = $state('');
	let editedEnd = $state('');
	let showAllTopics = $state(false);
	let topicOrder = $state<string[]>([]);
	let selectedTopic = $state<RadarTopicView | null>(null);
	let evidence = $state<RadarEvidencePage>({ evidence: [], nextOffset: null });
	let evidenceLoading = $state(false);
	let evidenceError = $state('');
	let historyLoading = $state(false);
	let lastRefreshed = $state<string | null>(null);
	let selectedEvidenceWindow = $state<RadarWindow>('recent');
	let mounted = false;
	let snapshotController: AbortController | null = null;
	let evidenceController: AbortController | null = null;
	let evidenceTrigger: HTMLButtonElement | null = null;
	let requestVersion = 0;
	let evidenceVersion = 0;
	let pollInFlight = false;
	let historyInFlight = false;

	const run = $derived(snapshot?.run ?? null);
	const topics = $derived.by(() => {
		const position = new Map(topicOrder.map((id, index) => [id, index]));
		return [...(snapshot?.topics ?? [])].sort(
			(a, b) =>
				(position.get(a.id) ?? Number.MAX_SAFE_INTEGER) -
					(position.get(b.id) ?? Number.MAX_SAFE_INTEGER) || a.id.localeCompare(b.id)
		);
	});
	const visibleTopics = $derived(showAllTopics ? topics : topics.slice(0, 5));
	const coverage = $derived(snapshot?.statistics.coverage);
	const textTotal = $derived((coverage?.processed ?? 0) + (coverage?.pending ?? 0));
	const coveragePercent = $derived(
		textTotal ? Math.round(((coverage?.processed ?? 0) / textTotal) * 100) : 0
	);
	const maxEnd = $derived(
		run ? localDateTime(new Date(new Date(run.startsAt).getTime() + 240 * 60_000)) : ''
	);
	const endLimitReached = $derived(
		run ? new Date(run.endsAt).getTime() >= new Date(run.startsAt).getTime() + 240 * 60_000 : false
	);
	const runLabels = { active: 'En curso', finalizing: 'Finalizando', finalized: 'Finalizado' };
	const analysisLabels = {
		current: 'Análisis al día',
		pending: 'Análisis pendiente',
		processing: 'Analizando mensajes',
		partial: 'Análisis parcial',
		blocked: 'Análisis detenido'
	};
	const inputClass =
		'mt-1 block w-full rounded-lg border border-gray-300 bg-gray-50 p-2.5 text-sm text-gray-900 focus:border-primary-500 focus:ring-primary-500 dark:border-gray-600 dark:bg-gray-700 dark:text-white';
	const panelClass =
		'rounded-2xl border border-gray-200 bg-white dark:border-gray-700 dark:bg-gray-800';

	function time(value: string) {
		return new Intl.DateTimeFormat('es', { hour: '2-digit', minute: '2-digit' }).format(
			new Date(value)
		);
	}
	function dateTime(value: string) {
		return new Intl.DateTimeFormat('es', {
			day: 'numeric',
			month: 'short',
			hour: '2-digit',
			minute: '2-digit'
		}).format(new Date(value));
	}
	function localDateTime(value: Date) {
		const shifted = new Date(value.getTime() - value.getTimezoneOffset() * 60_000);
		return shifted.toISOString().slice(0, 16);
	}
	function count(value: number) {
		return new Intl.NumberFormat('es').format(value);
	}
	function failure(cause: unknown) {
		return cause instanceof Error ? cause.message : 'No se ha podido completar la operación.';
	}
	function isAbort(cause: unknown) {
		return cause instanceof Error && cause.name === 'AbortError';
	}
	function topicIntents(topic: RadarTopicView) {
		return Object.entries(topic.intents)
			.sort((a, b) => (b[1] ?? 0) - (a[1] ?? 0))
			.slice(0, 3)
			.map(([intent]) => radarIntentLabels[intent as keyof typeof radarIntentLabels]);
	}

	async function request<T>(
		path: string,
		options: NonNullable<Parameters<typeof fetch>[1]> = {}
	): Promise<T> {
		const response = await fetch(`${api}${path}`, {
			...options,
			headers: { 'Content-Type': 'application/json', ...options.headers }
		});
		const payload = await response.json();
		if (!response.ok)
			throw new Error(payload.message ?? payload.error ?? 'No se ha podido cargar el radar.');
		return payload as T;
	}

	async function refreshHistory(append = false) {
		if (historyInFlight) return;
		historyInFlight = true;
		if (append) historyLoading = true;
		try {
			const next = await request<RadarHistory>(
				`/runs?offset=${append ? (history.nextOffset ?? 0) : 0}`
			);
			if (!mounted) return;
			history = append
				? {
						...next,
						runs: [
							...history.runs,
							...next.runs.filter(
								(item) => !history.runs.some((existing) => existing.id === item.id)
							)
						]
					}
				: {
						...next,
						runs: [
							...next.runs,
							...history.runs.filter(
								(item) =>
									!next.runs.some((newer) => newer.id === item.id) && item.id !== next.active?.id
							)
						],
						nextOffset:
							history.runs.length > next.runs.length ? history.nextOffset : next.nextOffset
					};
		} catch (cause) {
			if (!isAbort(cause) && mounted) pollingError = failure(cause);
		} finally {
			historyInFlight = false;
			historyLoading = false;
		}
	}

	async function refreshSnapshot(force = false) {
		if (!selectedRun || (!force && pollInFlight)) return;
		if (force) snapshotController?.abort();
		const version = ++requestVersion;
		const currentRun = selectedRun;
		const currentWindow = selectedWindow;
		const controller = new AbortController();
		snapshotController = controller;
		pollInFlight = true;
		try {
			const next = await request<RadarSnapshot>(`/runs/${currentRun}?window=${currentWindow}`, {
				signal: controller.signal
			});
			if (!mounted || version !== requestVersion) return;
			const changed = snapshot?.run.publishedVersion !== next.run.publishedVersion;
			if (changed || snapshot?.window !== next.window)
				topicOrder = next.topics.map((topic) => topic.id);
			snapshot = next;
			lastRefreshed = next.serverTime;
			pollingError = '';
			if (history.active?.id === next.run.id)
				history = { ...history, active: next.run.state === 'active' ? next.run : null };
			if (changed && selectedTopic) {
				if (next.window === selectedEvidenceWindow) {
					selectedTopic =
						next.topics.find((topic) => topic.id === selectedTopic?.id) ?? selectedTopic;
				}
				void refreshEvidence();
			}
		} catch (cause) {
			if (!isAbort(cause) && mounted && version === requestVersion) pollingError = failure(cause);
		} finally {
			if (version === requestVersion) {
				pollInFlight = false;
				loading = false;
			}
		}
	}

	function closeEvidence(restoreFocus = false) {
		evidenceController?.abort();
		evidenceVersion++;
		selectedTopic = null;
		evidence = { evidence: [], nextOffset: null };
		evidenceError = '';
		evidenceLoading = false;
		if (restoreFocus) evidenceTrigger?.focus({ preventScroll: true });
	}
	async function selectRun(id: string | null, updateUrl = true) {
		snapshotController?.abort();
		requestVersion++;
		pollInFlight = false;
		selectedRun = id;
		snapshot = null;
		error = '';
		pollingError = '';
		notice = '';
		editing = false;
		showAllTopics = false;
		topicOrder = [];
		showStart = false;
		closeEvidence();
		if (updateUrl) {
			const url = new URL(page.url);
			if (id) url.searchParams.set('run', id);
			else url.searchParams.delete('run');
			// The current SvelteKit URL already contains the resolved base path and locale.
			// eslint-disable-next-line svelte/no-navigation-without-resolve
			replaceState(url, page.state);
		}
		if (id) {
			loading = true;
			await refreshSnapshot(true);
		} else loading = false;
	}
	async function changeWindow(value: RadarWindow) {
		if (selectedWindow === value) return;
		selectedWindow = value;
		showAllTopics = false;
		await refreshSnapshot(true);
	}
	async function openEvidence(topic: RadarTopicView, trigger: HTMLButtonElement) {
		closeEvidence();
		evidenceTrigger = trigger;
		selectedTopic = topic;
		selectedEvidenceWindow = selectedWindow;
		await tick();
		document.getElementById('radar-evidence')?.focus();
		await refreshEvidence();
	}
	async function refreshEvidence(append = false) {
		if (!selectedTopic || !selectedRun) return;
		evidenceController?.abort();
		const version = ++evidenceVersion;
		const controller = new AbortController();
		evidenceController = controller;
		const path = `/runs/${selectedRun}/topics/${selectedTopic.id}/evidence`;
		const targetLength = append ? 0 : Math.max(evidence.evidence.length, 1);
		let offset = append ? (evidence.nextOffset ?? 0) : 0;
		let collected: RadarEvidencePage['evidence'] = [];
		evidenceLoading = true;
		evidenceError = '';
		try {
			let next: RadarEvidencePage;
			do {
				next = await request<RadarEvidencePage>(
					`${path}?offset=${offset}&window=${selectedEvidenceWindow}`,
					{ signal: controller.signal }
				);
				collected = [...collected, ...next.evidence];
				offset = next.nextOffset ?? 0;
			} while (!append && next.nextOffset !== null && collected.length < targetLength);
			if (!mounted || version !== evidenceVersion) return;
			evidence = {
				evidence: append
					? [
							...evidence.evidence,
							...collected.filter(
								(item) => !evidence.evidence.some((existing) => existing.id === item.id)
							)
						]
					: collected,
				nextOffset: next.nextOffset
			};
		} catch (cause) {
			if (!isAbort(cause) && mounted && version === evidenceVersion) {
				evidenceError = failure(cause);
				evidence = { evidence: [], nextOffset: null };
			}
		} finally {
			if (version === evidenceVersion) evidenceLoading = false;
		}
	}

	async function startRun(event: SubmitEvent) {
		event.preventDefault();
		busy = true;
		error = '';
		notice = '';
		try {
			const created = await request<RadarRunView>('/runs', {
				method: 'POST',
				body: JSON.stringify({
					title: title.trim(),
					durationMinutes: duration,
					modelId,
					context: context.trim() || undefined
				})
			});
			history = { ...history, active: created };
			await selectRun(created.id);
			await refreshHistory();
		} catch (cause) {
			error = failure(cause);
		} finally {
			busy = false;
		}
	}
	async function runAction(action: 'analyze' | 'stop') {
		if (!run) return;
		busy = true;
		error = '';
		notice = '';
		try {
			await request<RadarRunView>(`/runs/${run.id}/${action}`, { method: 'POST' });
			await refreshSnapshot(true);
			await refreshHistory();
			notice =
				action === 'analyze'
					? 'Análisis solicitado. Los resultados se actualizarán aquí.'
					: 'Intervalo cerrado. Se completará el análisis de los mensajes pendientes.';
		} catch (cause) {
			error = failure(cause);
		} finally {
			busy = false;
		}
	}
	function editRun() {
		if (!run) return;
		editedTitle = run.title;
		editedEnd = localDateTime(new Date(run.endsAt));
		editing = true;
	}
	async function saveRun(event: SubmitEvent) {
		event.preventDefault();
		if (!run) return;
		busy = true;
		error = '';
		try {
			const endsAt = new Date(editedEnd).toISOString();
			const changedEnd = new Date(endsAt).getTime() > new Date(run.endsAt).getTime();
			await request<RadarRunView>(`/runs/${run.id}`, {
				method: 'PATCH',
				body: JSON.stringify({ title: editedTitle.trim(), ...(changedEnd ? { endsAt } : {}) })
			});
			editing = false;
			await refreshSnapshot(true);
			await refreshHistory();
		} catch (cause) {
			error = failure(cause);
		} finally {
			busy = false;
		}
	}

	const chartAxisStyle = $derived({
		axisLabel: { color: $theme === 'dark' ? '#cbd5e1' : '#475569' },
		axisLine: { lineStyle: { color: $theme === 'dark' ? '#64748b' : '#9ca3af' } },
		splitLine: { lineStyle: { color: $theme === 'dark' ? '#475569' : '#e5e7eb' } }
	});
	const minuteOptions = $derived({
		animation: false,
		aria: { enabled: true },
		grid: { left: 38, right: 16, top: 16, bottom: 32 },
		tooltip: { trigger: 'axis', renderMode: 'richText' },
		xAxis: {
			...chartAxisStyle,
			type: 'category',
			data: snapshot?.statistics.perMinute.map((item) => time(item.at)) ?? [],
			boundaryGap: true,
			axisTick: { show: false }
		},
		yAxis: { ...chartAxisStyle, type: 'value', minInterval: 1 },
		series: [
			{
				name: 'Mensajes',
				type: 'bar',
				itemStyle: { color: '#0ea5e9', borderRadius: [3, 3, 0, 0] },
				data: snapshot?.statistics.perMinute.map((item) => item.messages) ?? []
			}
		]
	});
	const distributionOptions = $derived({
		animation: false,
		aria: { enabled: true },
		grid: { left: 38, right: 16, top: 16, bottom: 32 },
		tooltip: { trigger: 'axis', renderMode: 'richText' },
		xAxis: {
			...chartAxisStyle,
			type: 'category',
			data: snapshot?.statistics.distribution.map((item) => String(item.messages)) ?? [],
			axisTick: { show: false }
		},
		yAxis: { ...chartAxisStyle, type: 'value', minInterval: 1 },
		series: [
			{
				name: 'Estudiantes',
				type: 'bar',
				itemStyle: { color: '#ef562f', borderRadius: [3, 3, 0, 0] },
				data: snapshot?.statistics.distribution.map((item) => item.students) ?? []
			}
		]
	});

	onMount(() => {
		mounted = true;
		// Hydration may mount this component before the SvelteKit router is initialized.
		// Loading the initial selection must not perform shallow navigation.
		void selectRun(page.url.searchParams.get('run') ?? history.active?.id ?? null, false);
		function poll() {
			if (document.hidden) return;
			if (selectedRun) void refreshSnapshot();
			else void refreshHistory();
		}
		const interval = window.setInterval(poll, 5000);
		document.addEventListener('visibilitychange', poll);
		return () => {
			mounted = false;
			window.clearInterval(interval);
			document.removeEventListener('visibilitychange', poll);
			snapshotController?.abort();
			evidenceController?.abort();
		};
	});
</script>

<svelte:head><title>Radar de dudas · {data.interactive.name}</title></svelte:head>

<svelte:window
	onkeydown={(event) => {
		if (event.key === 'Escape' && selectedTopic) closeEvidence(true);
	}}
/>

<div class="mx-auto max-w-[1600px] space-y-6 pb-10 text-gray-900 dark:text-white">
	<header class="flex flex-wrap items-start justify-between gap-4">
		<div>
			<p
				class="text-primary-700 dark:text-primary-400 mb-2 flex items-center gap-2 text-xs font-semibold tracking-widest uppercase"
			>
				<MessageSquare class="h-4 w-4" /> Durante la clase
			</p>
			<h1 class="text-3xl font-bold tracking-tight">Radar de dudas</h1>
			<p class="mt-2 max-w-2xl text-sm leading-6 text-gray-500 dark:text-gray-400">
				Las preguntas del alumnado, reunidas para orientar tu explicación.
			</p>
		</div>
		<div class="flex flex-wrap gap-2">
			{#if selectedRun}<Button color="alternative" onclick={() => selectRun(null)}
					>Ver historial</Button
				>{/if}
			{#if history.active && selectedRun !== history.active.id}<Button
					onclick={() => selectRun(history.active!.id)}>Abrir seguimiento en curso</Button
				>{:else if !history.active && !showStart}<Button
					onclick={() => {
						showStart = true;
					}}>Nuevo seguimiento</Button
				>{/if}
		</div>
	</header>

	{#if error}<div
			role="alert"
			class="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-800 dark:border-red-800 dark:bg-red-900/20 dark:text-red-200"
		>
			{error}
		</div>{/if}
	{#if notice}<div
			role="status"
			class="rounded-xl border border-sky-200 bg-sky-50 p-4 text-sm text-sky-900 dark:border-sky-800 dark:bg-sky-900/20 dark:text-sky-200"
		>
			{notice}
		</div>{/if}
	{#if pollingError}
		<div
			role="status"
			class="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900 dark:border-amber-800 dark:bg-amber-900/20 dark:text-amber-200"
		>
			<span>No se ha podido actualizar. {pollingError} Se conservan los últimos datos.</span><button
				class="font-semibold underline underline-offset-4"
				onclick={() => (selectedRun ? refreshSnapshot(true) : refreshHistory())}>Reintentar</button
			>
		</div>
	{/if}

	{#if showStart || (!selectedRun && !history.active && history.runs.length === 0)}
		<section class="{panelClass} overflow-hidden" aria-labelledby="start-heading">
			<div
				class="border-b border-gray-100 bg-sky-50/60 px-6 py-5 dark:border-gray-700 dark:bg-sky-950/20"
			>
				<h2 id="start-heading" class="text-lg font-semibold">
					Empieza a observar las dudas de esta clase
				</h2>
				<p class="mt-1 text-sm text-gray-600 dark:text-gray-400">
					El alumnado utiliza sus chats habituales de «{data.interactive.name}». El seguimiento
					continúa aunque cierres esta pestaña.
				</p>
			</div>
			<form class="space-y-5 p-6" onsubmit={startRun}>
				<div class="grid gap-5 md:grid-cols-[2fr_1fr_2fr]">
					<label class="text-sm font-medium"
						>Título de la clase<input
							class={inputClass}
							bind:value={title}
							placeholder="Por ejemplo, Introducción a las derivadas"
							required
							maxlength="160"
						/></label
					>
					<label class="text-sm font-medium"
						>Duración (minutos)<input
							class={inputClass}
							type="number"
							bind:value={duration}
							min="15"
							max="240"
							step="1"
							required
						/></label
					>
					<label class="text-sm font-medium"
						>Modelo de análisis<select class={inputClass} bind:value={modelId} required
							><option value="" disabled>Selecciona un modelo</option
							>{#each data.radarModels as model (model.id)}<option value={model.id}
									>{model.name}{model.isDefault ? ' · Predeterminado' : ''}</option
								>{/each}</select
						></label
					>
				</div>
				<label class="block text-sm font-medium"
					>Contexto de la explicación <span class="font-normal text-gray-500 dark:text-gray-400"
						>(opcional)</span
					><textarea
						class={inputClass}
						bind:value={context}
						rows="3"
						maxlength="4000"
						placeholder="Tema, objetivos o conceptos que vas a explicar. Ayuda a interpretar las preguntas."
					></textarea></label
				>
				{#if !data.radarModels.length}<p class="text-sm text-amber-700 dark:text-amber-300">
						No hay modelos habilitados para analizar. Un administrador debe habilitar uno antes de
						empezar.
					</p>{/if}
				<div class="flex flex-wrap items-center justify-between gap-4">
					<p class="max-w-2xl text-xs leading-5 text-gray-500 dark:text-gray-400">
						El intervalo empieza ahora. El modelo y el contexto quedan fijados durante el
						seguimiento. El análisis utiliza texto y consume la cuota de IA del docente que lo
						inicia.
					</p>
					<div class="flex gap-2">
						{#if showStart}<Button
								color="alternative"
								onclick={() => {
									showStart = false;
								}}>Cancelar</Button
							>{/if}<Button type="submit" disabled={busy || !modelId || !data.radarModels.length}
							>{#if busy}<Spinner size="4" class="me-2" />{/if}Iniciar seguimiento</Button
						>
					</div>
				</div>
			</form>
		</section>
	{/if}

	{#if loading && !snapshot}<div
			role="status"
			class="{panelClass} flex items-center justify-center gap-3 p-12 text-sm text-gray-500"
		>
			<Spinner size="5" /> Cargando seguimiento…
		</div>{/if}

	{#if snapshot && run}
		<section class="{panelClass} p-5 lg:p-6" aria-labelledby="run-heading">
			<div class="flex flex-wrap items-start justify-between gap-5">
				<div class="min-w-0">
					<div class="mb-2 flex flex-wrap items-center gap-3">
						<span
							class="flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-semibold {run.state ===
							'active'
								? 'bg-emerald-50 text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-300'
								: 'bg-gray-100 text-gray-600 dark:bg-gray-700 dark:text-gray-300'}"
							><span
								class="h-1.5 w-1.5 rounded-full {run.state === 'active'
									? 'bg-emerald-500'
									: 'bg-gray-400'}"
							></span>{runLabels[run.state]}</span
						><span class="text-xs text-gray-500 dark:text-gray-400">{data.interactive.name}</span>
					</div>
					<h2 id="run-heading" class="text-2xl font-semibold tracking-tight">{run.title}</h2>
					<p
						class="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-gray-500 dark:text-gray-400"
					>
						<span class="inline-flex items-center gap-1.5"
							><Clock class="h-4 w-4" />{dateTime(run.startsAt)} — {time(run.endsAt)}</span
						><span>{run.modelName}</span>
					</p>
				</div>
				<div class="flex flex-wrap gap-2">
					<Button
						color="alternative"
						onclick={() => runAction('analyze')}
						disabled={busy || run.analysisState === 'processing'}
						><Sparkles class="me-2 h-4 w-4" />{run.analysisState === 'blocked' ||
						run.analysisState === 'partial'
							? 'Reintentar análisis'
							: 'Analizar ahora'}</Button
					>{#if run.state === 'active'}<Button color="alternative" onclick={editRun} disabled={busy}
							>Editar</Button
						><Button color="dark" onclick={() => runAction('stop')} disabled={busy}
							>Finalizar</Button
						>{/if}
				</div>
			</div>
			{#if editing && run.state === 'active'}<form
					class="mt-5 grid items-end gap-4 rounded-xl bg-gray-50 p-4 md:grid-cols-[2fr_1fr_auto] dark:bg-gray-900/40"
					onsubmit={saveRun}
				>
					<label class="text-sm font-medium"
						>Título<input
							class={inputClass}
							bind:value={editedTitle}
							maxlength="160"
							required
						/></label
					><label class="text-sm font-medium"
						>Fin previsto<input
							class={inputClass}
							type="datetime-local"
							bind:value={editedEnd}
							min={localDateTime(new Date(run.endsAt))}
							max={maxEnd}
							disabled={endLimitReached}
							required
						/><span class="mt-1 block text-xs font-normal text-gray-500"
							>Hasta cuatro horas desde el inicio.</span
						></label
					>
					<div class="flex gap-2">
						<Button type="submit" disabled={busy}>Guardar</Button><Button
							color="alternative"
							onclick={() => {
								editing = false;
							}}>Cancelar</Button
						>
					</div>
				</form>{/if}
			{#if run.context}<details class="mt-4 border-t border-gray-100 pt-3 dark:border-gray-700">
					<summary class="cursor-pointer text-xs font-medium text-gray-500 dark:text-gray-400"
						>Contexto de la explicación</summary
					>
					<div class="mt-2 max-w-3xl text-sm text-gray-600 dark:text-gray-300">
						<RadarText text={run.context} />
					</div>
				</details>{/if}
		</section>

		<section aria-label="Interacción registrada" class="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
			<div class="{panelClass} p-5">
				<div class="flex items-center justify-between text-gray-500 dark:text-gray-400">
					<p class="text-sm">Estudiantes con mensajes</p>
					<Users class="h-4 w-4" />
				</div>
				<p class="mt-3 text-4xl font-semibold tracking-tight tabular-nums">
					{count(snapshot.statistics.students)}
				</p>
				<p class="mt-2 text-xs text-gray-500 dark:text-gray-400">
					Personas distintas durante la clase
				</p>
			</div>
			<div class="{panelClass} p-5">
				<p class="text-sm text-gray-500 dark:text-gray-400">Han preguntado recientemente</p>
				<p class="mt-3 text-4xl font-semibold tracking-tight tabular-nums">
					{count(snapshot.statistics.recentStudents)}
				</p>
				<p class="mt-2 text-xs text-gray-500 dark:text-gray-400">
					Con mensajes en los últimos 5 minutos
				</p>
			</div>
			<div class="{panelClass} p-5">
				<p class="text-sm text-gray-500 dark:text-gray-400">Mensajes del alumnado</p>
				<p class="mt-3 text-4xl font-semibold tracking-tight tabular-nums">
					{count(snapshot.statistics.messages)}
				</p>
				<p class="mt-2 text-xs text-gray-500 dark:text-gray-400">
					En todas sus conversaciones de la actividad
				</p>
			</div>
			<div class="{panelClass} p-5">
				<p class="text-sm text-gray-500 dark:text-gray-400">Texto analizado</p>
				<p class="mt-3 text-4xl font-semibold tracking-tight tabular-nums">
					{count(coverage?.processed ?? 0)}<span class="ms-1 text-base font-normal text-gray-400"
						>/ {count(textTotal)}</span
					>
				</p>
				<div
					class="mt-3 h-1.5 overflow-hidden rounded-full bg-gray-100 dark:bg-gray-700"
					role="progressbar"
					aria-label="Cobertura de mensajes de texto"
					aria-valuemin="0"
					aria-valuemax="100"
					aria-valuenow={coveragePercent}
				>
					<div class="h-full rounded-full bg-sky-500" style:width={`${coveragePercent}%`}></div>
				</div>
				<p class="mt-2 text-xs text-gray-500 dark:text-gray-400">
					{count(coverage?.pending ?? 0)} pendientes · {count(coverage?.notAnalyzable ?? 0)} sin texto
					analizable
				</p>
			</div>
		</section>
		<p class="-mt-3 text-xs leading-5 text-gray-500 dark:text-gray-400">
			Estos datos describen consultas registradas: no indican asistencia, atención ni un nivel de
			comprensión.
		</p>

		<section class="{panelClass} overflow-hidden" aria-labelledby="analysis-heading">
			<div
				class="flex flex-wrap items-center justify-between gap-3 border-b border-gray-100 px-5 py-4 dark:border-gray-700"
			>
				<h2 id="analysis-heading" class="flex items-center gap-2 text-sm font-semibold">
					<Sparkles class="text-primary-600 dark:text-primary-400 h-4 w-4" />{analysisLabels[
						run.analysisState
					]}
				</h2>
				<p class="text-xs text-gray-500 dark:text-gray-400">
					{run.analyzedAt
						? `Último análisis: ${dateTime(run.analyzedAt)}`
						: 'Aún no se ha publicado un análisis'}
				</p>
			</div>
			<div class="space-y-3 p-5">
				{#if run.error}<p
						role="status"
						class="rounded-lg bg-amber-50 p-3 text-sm text-amber-900 dark:bg-amber-900/20 dark:text-amber-200"
					>
						{run.error} Las estadísticas siguen disponibles; el análisis conserva su última versión.
					</p>{/if}
				{#if run.summary}<div
						class="max-w-4xl text-base leading-7 text-gray-700 dark:text-gray-200"
					>
						<RadarText text={run.summary} />
					</div>{:else if !snapshot.statistics.messages}<p
						class="text-sm text-gray-500 dark:text-gray-400"
					>
						Todavía no hay mensajes del alumnado en este intervalo. Las preguntas aparecerán aquí a
						medida que utilicen la actividad.
					</p>{:else if run.analysisState === 'processing' || run.analysisState === 'pending'}<p
						class="flex items-center gap-2 text-sm text-gray-500 dark:text-gray-400"
					>
						<Spinner size="4" /> Preparando la lectura de las primeras dudas. Puedes seguir viendo las
						estadísticas.
					</p>{:else}<p class="text-sm text-gray-500 dark:text-gray-400">
						Aún no hay un resumen disponible. Las agrupaciones publicadas siguen disponibles debajo.
					</p>{/if}
				{#if coverage?.truncated}<p class="text-xs text-amber-700 dark:text-amber-300">
						{count(coverage.truncated)} mensajes se analizaron con contenido o contexto recortado. Sus
						evidencias están marcadas.
					</p>{/if}
				{#if coverage?.pending}<p class="text-xs text-gray-500 dark:text-gray-400">
						El análisis cubre {count(coverage.processed)} mensajes de texto; quedan {count(
							coverage.pending
						)} pendientes. Se actualiza cada minuto si hay nuevas consultas.
					</p>{/if}
				<div
					class="flex flex-wrap items-center justify-between gap-2 border-t border-gray-100 pt-3 text-xs text-gray-500 dark:border-gray-700 dark:text-gray-400"
				>
					<span
						>{count(snapshot.usage.tokens)} tokens · {snapshot.usage.estimatedCost === null
							? 'Coste no disponible'
							: `Coste estimado: ${new Intl.NumberFormat('es', { style: 'currency', currency: 'USD', maximumFractionDigits: 4 }).format(snapshot.usage.estimatedCost)}`}</span
					><span class="inline-flex items-center gap-1.5"
						><RefreshCw class="h-3 w-3" />{lastRefreshed
							? `Datos actualizados a las ${time(lastRefreshed)}`
							: 'Actualización cada 5 segundos'}</span
					>
				</div>
			</div>
		</section>

		<div
			class="grid items-start gap-5 {selectedTopic
				? '2xl:grid-cols-[minmax(0,1fr)_minmax(360px,0.9fr)]'
				: ''}"
		>
			<section class="min-w-0 space-y-4" aria-labelledby="topics-heading">
				<div class="flex flex-wrap items-center justify-between gap-3">
					<div>
						<h2 id="topics-heading" class="text-xl font-semibold tracking-tight">
							Dudas y temas consultados
						</h2>
						<p class="mt-1 text-xs text-gray-500 dark:text-gray-400">
							Una consulta puede estar relacionada con varios temas.
						</p>
					</div>
					<div
						class="flex rounded-lg border border-gray-200 bg-white p-1 dark:border-gray-700 dark:bg-gray-800"
						role="group"
						aria-label="Ventana de las agrupaciones"
					>
						<button
							class="rounded-md px-3 py-2 text-xs font-medium {selectedWindow === 'recent'
								? 'bg-gray-900 text-white dark:bg-gray-100 dark:text-gray-900'
								: 'text-gray-600 hover:bg-gray-100 dark:text-gray-300 dark:hover:bg-gray-700'}"
							aria-pressed={selectedWindow === 'recent'}
							onclick={() => changeWindow('recent')}>Últimos 5 minutos</button
						><button
							class="rounded-md px-3 py-2 text-xs font-medium {selectedWindow === 'all'
								? 'bg-gray-900 text-white dark:bg-gray-100 dark:text-gray-900'
								: 'text-gray-600 hover:bg-gray-100 dark:text-gray-300 dark:hover:bg-gray-700'}"
							aria-pressed={selectedWindow === 'all'}
							onclick={() => changeWindow('all')}>Toda la clase</button
						>
					</div>
				</div>
				{#if !topics.length}<div class="{panelClass} px-6 py-10 text-center">
						<MessageSquare class="mx-auto mb-3 h-7 w-7 text-gray-300 dark:text-gray-600" />
						<p class="font-medium">
							{snapshot.statistics.messages
								? 'Todavía no hay agrupaciones en esta ventana'
								: 'El radar está listo para escuchar'}
						</p>
						<p class="mx-auto mt-2 max-w-md text-sm leading-6 text-gray-500 dark:text-gray-400">
							{snapshot.statistics.messages
								? 'Las consultas sin un tema identificable no se fuerzan a encajar en una agrupación. Prueba a consultar toda la clase si no hay preguntas recientes.'
								: 'Cuando el alumnado empiece a preguntar, verás qué temas reúnen más consultas y qué aclaraciones podrían ayudar.'}
						</p>
					</div>{/if}
				{#each visibleTopics as topic (topic.id)}
					<article
						class="{panelClass} overflow-hidden {selectedTopic?.id === topic.id
							? 'ring-primary-400 ring-2'
							: ''}"
					>
						<div class="p-5">
							<div class="flex items-start justify-between gap-4">
								<h3 class="text-lg leading-6 font-semibold">{topic.title}</h3>
								<span
									class="shrink-0 rounded-full bg-sky-50 px-2.5 py-1 text-xs font-medium text-sky-800 dark:bg-sky-900/30 dark:text-sky-200"
									>{count(topic.students)}
									{topic.students === 1 ? 'estudiante' : 'estudiantes'}</span
								>
							</div>
							<div class="mt-2 text-sm text-gray-600 dark:text-gray-300">
								<RadarText text={topic.description} />
							</div>
							<div class="mt-3 flex flex-wrap gap-1.5">
								{#each topicIntents(topic) as intent (intent)}<span
										class="rounded-md bg-gray-100 px-2 py-1 text-[11px] text-gray-600 dark:bg-gray-700 dark:text-gray-300"
										>{intent}</span
									>{/each}
							</div>
							{#if topic.confusionCount > 0}<p
									class="mt-3 text-xs font-medium text-amber-700 dark:text-amber-300"
								>
									{count(topic.confusionCount)}
									{topic.confusionCount === 1
										? 'mensaje con posible confusión'
										: 'mensajes con posibles confusiones'} · Interpretación apoyada en evidencias
								</p>{/if}
							{#if topic.suggestion}<div
									class="border-primary-400 bg-primary-50/60 dark:bg-primary-900/10 mt-4 rounded-xl border-l-2 p-3"
								>
									<p class="text-primary-800 dark:text-primary-300 mb-1 text-xs font-semibold">
										Una aclaración que podría ayudar
									</p>
									<div class="text-sm text-gray-700 dark:text-gray-200">
										<RadarText text={topic.suggestion} />
									</div>
								</div>{/if}
						</div>
						<div
							class="flex flex-wrap items-center justify-between gap-3 border-t border-gray-100 px-5 py-3 dark:border-gray-700"
						>
							<div class="flex flex-wrap gap-x-3 gap-y-1 text-xs text-gray-500 dark:text-gray-400">
								<span>{count(topic.messages)} {topic.messages === 1 ? 'mensaje' : 'mensajes'}</span
								><span>Última consulta: {time(topic.lastAt)}</span
								>{#if topic.trend?.percent !== null && topic.trend?.percent !== undefined}<span
										>{topic.trend.percent > 0 ? '+' : ''}{Math.round(topic.trend.percent)} % frente a
										los 5 min anteriores</span
									>{:else if topic.trend && topic.trend.current > 0 && topic.trend.previous === 0}<span
										>Sin consultas en los 5 min anteriores</span
									>{/if}
							</div>
							<button
								class="text-primary-700 dark:text-primary-400 inline-flex items-center gap-1 text-sm font-semibold hover:underline"
								onclick={(event) => openEvidence(topic, event.currentTarget)}
								aria-expanded={selectedTopic?.id === topic.id}
								aria-controls="radar-evidence"
								>Ver evidencias <ArrowUpRight class="h-4 w-4" /></button
							>
						</div>
					</article>
				{/each}
				{#if topics.length > 5}<button
						class="flex w-full items-center justify-center gap-2 rounded-xl border border-gray-200 py-3 text-sm font-medium text-gray-600 hover:bg-gray-100 dark:border-gray-700 dark:text-gray-300 dark:hover:bg-gray-800"
						onclick={() => {
							showAllTopics = !showAllTopics;
						}}
						>{showAllTopics
							? 'Mostrar las cinco principales'
							: `Ver ${topics.length - 5} agrupaciones más`}<ChevronDown
							class="h-4 w-4 {showAllTopics ? 'rotate-180' : ''}"
						/></button
					>{/if}
			</section>

			{#if selectedTopic}
				<section
					id="radar-evidence"
					class="{panelClass} min-w-0 overflow-hidden 2xl:sticky 2xl:top-20"
					aria-labelledby="evidence-heading"
					tabindex="-1"
				>
					<div
						class="flex items-start justify-between gap-3 border-b border-gray-100 p-5 dark:border-gray-700"
					>
						<div>
							<p
								class="mb-1 text-xs font-semibold tracking-wider text-gray-500 uppercase dark:text-gray-400"
							>
								Evidencias · {selectedEvidenceWindow === 'recent'
									? 'Últimos 5 minutos'
									: 'Toda la clase'}
							</p>
							<h2 id="evidence-heading" class="text-lg font-semibold">{selectedTopic.title}</h2>
							<p class="mt-1 text-xs text-gray-500 dark:text-gray-400">
								{count(selectedTopic.students)}
								{selectedTopic.students === 1 ? 'estudiante' : 'estudiantes'} · {count(
									selectedTopic.messages
								)}
								{selectedTopic.messages === 1 ? 'mensaje' : 'mensajes'}
								en la selección
							</p>
						</div>
						<button
							class="rounded-lg p-1.5 text-gray-400 hover:bg-gray-100 hover:text-gray-700 dark:hover:bg-gray-700 dark:hover:text-gray-100"
							aria-label="Cerrar evidencias"
							onclick={() => closeEvidence(true)}><X class="h-5 w-5" /></button
						>
					</div>
					<div class="max-h-[75vh] space-y-4 overflow-y-auto p-5">
						{#if evidenceError}<p role="alert" class="text-sm text-red-700 dark:text-red-300">
								{evidenceError}
							</p>
							<button class="text-sm font-semibold underline" onclick={() => refreshEvidence()}
								>Reintentar</button
							>{/if}
						{#if evidenceLoading && !evidence.evidence.length}<p
								role="status"
								class="flex items-center gap-2 py-5 text-sm text-gray-500"
							>
								<Spinner size="4" /> Cargando evidencias…
							</p>{:else if !evidence.evidence.length && !evidenceError}<p
								class="py-4 text-sm text-gray-500 dark:text-gray-400"
							>
								No quedan evidencias disponibles en esta ventana.
							</p>{/if}
						{#each evidence.evidence as item (item.id)}
							<article class="rounded-xl border border-gray-200 p-4 dark:border-gray-700">
								<div class="flex items-start justify-between gap-3">
									<div>
										<p class="text-sm font-semibold">{item.studentName}</p>
										<p class="mt-0.5 text-xs text-gray-500 dark:text-gray-400">
											{dateTime(item.at)}
										</p>
									</div>
									<a
										href={resolve(
											item.chatUrl as
												| `/agent-chat/${string}/view/${string}`
												| `/interactive-chat/${string}/view/${string}`
										)}
										target="_blank"
										rel="noopener noreferrer"
										class="text-primary-700 dark:text-primary-400 inline-flex shrink-0 items-center gap-1 text-xs font-semibold hover:underline"
										aria-label={`Abrir chat de ${item.studentName} en otra pestaña`}
										>Abrir chat<ArrowUpRight class="h-3.5 w-3.5" /></a
									>
								</div>
								<blockquote
									class="mt-3 border-l-2 border-sky-300 pl-3 text-sm text-gray-800 dark:border-sky-600 dark:text-gray-100"
								>
									<RadarText text={item.text} />
								</blockquote>
								<p class="mt-3 text-xs font-medium text-sky-700 dark:text-sky-300">
									{item.intent ? radarIntentLabels[item.intent] : 'Sin intención identificada'}
								</p>
								{#if item.confusion}<div
										class="mt-3 rounded-lg bg-amber-50 p-3 text-sm text-amber-900 dark:bg-amber-900/20 dark:text-amber-200"
									>
										<p class="mb-1 text-xs font-semibold">Posible confusión inferida</p>
										<RadarText text={item.confusion} />
									</div>{/if}{#if item.insufficientContext || item.truncated}<p
										class="mt-2 text-xs text-amber-700 dark:text-amber-300"
									>
										{[
											item.insufficientContext ? 'Contexto insuficiente' : '',
											item.truncated ? 'Contenido o contexto recortado' : ''
										]
											.filter(Boolean)
											.join(' · ')}
									</p>{/if}{#if item.context.length}<details class="mt-3">
										<summary
											class="cursor-pointer text-xs font-medium text-gray-500 dark:text-gray-400"
											>Ver contexto anterior ({item.context.length}
											{item.context.length === 1 ? 'mensaje' : 'mensajes'})</summary
										>
										<div class="mt-3 space-y-3">
											{#each item.context as previous (previous.id)}<div
													class="rounded-lg p-3 text-xs {previous.role === 'assistant'
														? 'bg-gray-50 text-gray-600 dark:bg-gray-900/40 dark:text-gray-300'
														: 'bg-sky-50/60 text-gray-700 dark:bg-sky-900/10 dark:text-gray-200'}"
												>
													<p class="mb-1 font-semibold">
														{previous.role === 'assistant' ? 'Asistente' : 'Estudiante'} · {time(
															previous.at
														)}
													</p>
													<RadarText text={previous.text} />
												</div>{/each}
										</div>
									</details>{/if}
							</article>
						{/each}
						{#if evidence.nextOffset !== null}<Button
								color="alternative"
								class="w-full"
								disabled={evidenceLoading}
								onclick={() => refreshEvidence(true)}
								>{evidenceLoading ? 'Cargando…' : 'Ver más evidencias'}</Button
							>{/if}
						<p class="text-xs leading-5 text-gray-500 dark:text-gray-400">
							El contexto anterior puede incluir mensajes previos a la clase. Solo los mensajes del
							intervalo observado cuentan como evidencias.
						</p>
					</div>
				</section>
			{/if}
		</div>

		<section class="grid gap-5 xl:grid-cols-[3fr_2fr]" aria-label="Evolución de las consultas">
			<div class="{panelClass} min-w-0 p-5">
				<h2 class="font-semibold">Mensajes por minuto</h2>
				<p class="mt-1 text-xs text-gray-500 dark:text-gray-400">Evolución durante toda la clase</p>
				<EChart options={minuteOptions} theme={$theme} height="220px" />
				<details class="text-xs text-gray-500 dark:text-gray-400">
					<summary class="cursor-pointer">Consultar los datos del gráfico</summary>
					<div class="mt-2 max-h-48 overflow-auto">
						<table class="w-full text-left">
							<caption class="sr-only">Mensajes del alumnado por minuto</caption><thead
								><tr><th scope="col" class="py-1">Hora</th><th scope="col">Mensajes</th></tr></thead
							><tbody
								>{#each snapshot.statistics.perMinute as item (item.at)}<tr
										><td class="py-1">{time(item.at)}</td><td>{item.messages}</td></tr
									>{/each}</tbody
							>
						</table>
					</div>
				</details>
			</div>
			<div class="{panelClass} min-w-0 p-5">
				<h2 class="font-semibold">Mensajes por estudiante</h2>
				<p class="mt-1 text-xs text-gray-500 dark:text-gray-400">
					Número de estudiantes que han enviado cada cantidad de mensajes
				</p>
				<EChart options={distributionOptions} theme={$theme} height="220px" />
				<details class="text-xs text-gray-500 dark:text-gray-400">
					<summary class="cursor-pointer">Consultar los datos del gráfico</summary>
					<div class="mt-2 max-h-48 overflow-auto">
						<table class="w-full text-left">
							<caption class="sr-only">Distribución de mensajes entre quienes han escrito</caption
							><thead
								><tr
									><th scope="col" class="py-1">Mensajes por persona</th><th scope="col"
										>Estudiantes</th
									></tr
								></thead
							><tbody
								>{#each snapshot.statistics.distribution as item (item.messages)}<tr
										><td class="py-1">{item.messages}</td><td>{item.students}</td></tr
									>{/each}</tbody
							>
						</table>
					</div>
				</details>
			</div>
		</section>
	{/if}

	{#if !selectedRun}
		{#if history.active}<section
				class="rounded-2xl border border-emerald-200 bg-emerald-50 p-5 dark:border-emerald-900 dark:bg-emerald-900/15"
			>
				<div class="flex flex-wrap items-center justify-between gap-4">
					<div>
						<p
							class="text-xs font-semibold tracking-wider text-emerald-700 uppercase dark:text-emerald-400"
						>
							Seguimiento en curso
						</p>
						<h2 class="mt-1 text-lg font-semibold">{history.active.title}</h2>
						<p class="mt-1 text-sm text-gray-600 dark:text-gray-400">
							{dateTime(history.active.startsAt)} — {time(history.active.endsAt)}
						</p>
					</div>
					<Button onclick={() => selectRun(history.active!.id)}>Abrir dashboard</Button>
				</div>
			</section>{/if}
		<section class="{panelClass} overflow-hidden" aria-labelledby="history-heading">
			<div class="border-b border-gray-100 p-5 dark:border-gray-700">
				<h2 id="history-heading" class="text-lg font-semibold">Historial de esta actividad</h2>
				<p class="mt-1 text-sm text-gray-500 dark:text-gray-400">
					Vuelve a las dudas de una clase y a las evidencias que las sustentan.
				</p>
			</div>
			{#if history.runs.length}<ul class="divide-y divide-gray-100 dark:divide-gray-700">
					{#each history.runs.filter((item) => item.id !== history.active?.id) as item (item.id)}<li
						>
							<button
								onclick={() => selectRun(item.id)}
								class="flex w-full flex-wrap items-center justify-between gap-3 px-5 py-4 text-left hover:bg-gray-50 dark:hover:bg-gray-700/30"
								><span
									><span class="block text-sm font-semibold">{item.title}</span><span
										class="mt-1 block text-xs text-gray-500 dark:text-gray-400"
										>{dateTime(item.startsAt)} — {time(item.endsAt)} · {item.modelName}</span
									></span
								><span class="flex items-center gap-3"
									><span class="text-xs text-gray-500 dark:text-gray-400"
										>{runLabels[item.state]} · {analysisLabels[item.analysisState]}</span
									><ArrowUpRight class="h-4 w-4 text-gray-400" /></span
								></button
							>
						</li>{/each}
				</ul>{:else}<p class="p-8 text-center text-sm text-gray-500 dark:text-gray-400">
					Los seguimientos de esta actividad aparecerán aquí.
				</p>{/if}{#if history.nextOffset !== null}<div
					class="border-t border-gray-100 p-4 text-center dark:border-gray-700"
				>
					<Button color="alternative" disabled={historyLoading} onclick={() => refreshHistory(true)}
						>{historyLoading ? 'Cargando…' : 'Ver seguimientos anteriores'}</Button
					>
				</div>{/if}
		</section>
	{/if}
</div>
