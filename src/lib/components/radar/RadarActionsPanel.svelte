<script lang="ts">
	import { onMount, tick } from 'svelte';
	import type { RadarRunView } from '$lib/types/radar';
	import { radarActionAvailability } from '$lib/utils/radarActionAvailability';
	import { Button, Spinner } from 'flowbite-svelte';
	import RadarText from './RadarText.svelte';
	import RadarActionDatasetView from './RadarActionDataset.svelte';
	import type { RadarAction, RadarActionExecution } from '$lib/types/radarActions';
	let {
		api,
		run,
		serverTime,
		actions = $bindable([]),
		onprepare
	}: {
		api: string;
		run: RadarRunView;
		serverTime?: string;
		actions?: RadarAction[];
		onprepare: () => void;
	} = $props();
	let ownExecutionIds = $state<string[]>([]);
	let now = $state(0);
	let clockAnchor = { at: 0, monotonic: 0 };
	$effect(() => {
		const reference = Date.parse(serverTime ?? run.startsAt);
		clockAnchor = { at: reference, monotonic: performance.now() };
		now = reference;
	});
	function availability(action: RadarAction) {
		const pending = executions.some(
			(item) =>
				ownExecutionIds.includes(item.id) &&
				item.actionId === action.id &&
				(item.state === 'queued' || item.state === 'processing')
		);
		return radarActionAvailability(action, run, now, pending);
	}
	let executions = $state<RadarActionExecution[]>([]);
	let selected = $state<RadarActionExecution | null>(null);
	let nextOffset = $state<number | null>(null);
	let busy = $state(false);
	let loading = $state(true);
	let error = $state('');
	let pollingError = $state('');
	let evidenceError = $state('');
	let evidenceLoading = $state(false);
	let evidence = $state<{ id: string; text: string; at: string }[]>([]);
	let evidenceOpen = $state(false);
	let requestedEvidence = $state<string[]>([]);
	let evidenceOffset = $state(0);
	let resultHeading: HTMLHeadingElement | undefined = $state();
	let evidenceHeading: HTMLHeadingElement | undefined = $state();
	let alive = false;
	let polling = false;
	let selectionVersion = 0;
	let lifetime = new AbortController();
	let evidenceController: AbortController | null = null;
	const requestIds: Record<string, string> = {};
	const labels = {
		queued: 'En cola',
		processing: 'Analizando',
		completed: 'Completado',
		failed: 'Fallido',
		invalidated: 'Resultado retirado'
	};
	const executionBase = $derived(`/runs/${run.id}/action-executions`);
	function failure(cause: unknown) {
		return cause instanceof Error ? cause.message : 'No se ha podido completar la operación.';
	}
	function aborted(cause: unknown) {
		return cause instanceof Error && cause.name === 'AbortError';
	}
	function date(value: string) {
		return new Intl.DateTimeFormat('es', {
			day: 'numeric',
			month: 'short',
			hour: '2-digit',
			minute: '2-digit'
		}).format(new Date(value));
	}
	async function request<T>(
		path: string,
		options: NonNullable<Parameters<typeof fetch>[1]> = {}
	): Promise<T> {
		const response = await fetch(`${api}${path}`, {
			signal: lifetime.signal,
			...options,
			headers: { 'Content-Type': 'application/json' }
		});
		const payload = response.status === 204 ? null : await response.json();
		if (!response.ok)
			throw new Error(
				payload?.message ?? payload?.error ?? 'No se ha podido completar la operación.'
			);
		return payload as T;
	}
	async function loadActions() {
		const previous = actions;
		const value = await request<{ actions: RadarAction[] }>('/actions');
		if (alive && actions === previous) actions = value.actions;
	}
	async function loadHistory(append = false) {
		const value = await request<{ executions: RadarActionExecution[]; nextOffset: number | null }>(
			`${executionBase}?offset=${append ? (nextOffset ?? 0) : 0}`
		);
		if (!alive) return;
		executions = append
			? [
					...executions,
					...value.executions.filter(
						(item) => !executions.some((previous) => previous.id === item.id)
					)
				]
			: [
					...value.executions,
					...executions.filter((item) => !value.executions.some((fresh) => fresh.id === item.id))
				];
		if (append || executions.length <= value.executions.length) nextOffset = value.nextOffset;
	}
	async function refresh() {
		if (polling || !alive || document.hidden) return;
		polling = true;
		const version = selectionVersion;
		const id = selected?.id;
		try {
			await Promise.all([loadHistory(), loadActions()]);
			if (id) {
				const value = await request<RadarActionExecution>(`${executionBase}/${id}`);
				if (alive && version === selectionVersion) {
					selected = value;
					if (value.state === 'invalidated') closeEvidence();
				}
			}
			if (alive) pollingError = '';
		} catch (cause) {
			if (alive && !aborted(cause)) pollingError = failure(cause);
		} finally {
			polling = false;
		}
	}
	async function execute(action: RadarAction) {
		if (busy || !availability(action).available) return;
		busy = true;
		error = '';
		const key = `${action.id}:${action.revision}`;
		const requestId = requestIds[key] ?? crypto.randomUUID();
		requestIds[key] = requestId;
		try {
			const value = await request<RadarActionExecution>(executionBase, {
				method: 'POST',
				body: JSON.stringify({ actionId: action.id, revision: action.revision, requestId })
			});
			if (!alive) return;
			delete requestIds[key];
			ownExecutionIds = [...ownExecutionIds, value.id];
			selectionVersion++;
			selected = value;
			closeEvidence();
			executions = [value, ...executions.filter((item) => item.id !== value.id)];
			await tick();
			resultHeading?.focus();
		} catch (cause) {
			if (alive && !aborted(cause)) {
				error = failure(cause);
				await loadActions().catch(() => {});
			}
		} finally {
			busy = false;
		}
	}
	async function selectExecution(execution: RadarActionExecution) {
		const version = ++selectionVersion;
		closeEvidence();
		error = '';
		try {
			const value = await request<RadarActionExecution>(`${executionBase}/${execution.id}`);
			if (alive && version === selectionVersion) {
				selected = value;
				await tick();
				resultHeading?.focus();
			}
		} catch (cause) {
			if (alive && !aborted(cause)) error = failure(cause);
		}
	}
	function closeEvidence() {
		evidenceController?.abort();
		evidence = [];
		evidenceOpen = false;
		evidenceError = '';
		evidenceLoading = false;
		requestedEvidence = [];
		evidenceOffset = 0;
	}
	async function showEvidence(ids: string[], append = false) {
		if (!selected || selected.state !== 'completed') return;
		if (!append) {
			closeEvidence();
			requestedEvidence = [...new Set(ids)];
			evidenceOpen = true;
		}
		const controller = new AbortController();
		evidenceController?.abort();
		evidenceController = controller;
		const offset = append ? evidenceOffset : 0;
		const batch = requestedEvidence.slice(offset, offset + 20);
		evidenceLoading = true;
		evidenceError = '';
		await tick();
		if (!append) evidenceHeading?.focus();
		try {
			const value = await request<{ evidence: { id: string; text: string; at: string }[] }>(
				`${executionBase}/${selected.id}/evidence?ids=${encodeURIComponent(batch.join(','))}`,
				{ signal: controller.signal }
			);
			if (alive && evidenceController === controller) {
				evidence = append ? [...evidence, ...value.evidence] : value.evidence;
				evidenceOffset = offset + batch.length;
			}
		} catch (cause) {
			if (alive && !aborted(cause)) evidenceError = failure(cause);
		} finally {
			if (evidenceController === controller) evidenceLoading = false;
		}
	}
	async function moreHistory() {
		busy = true;
		try {
			await loadHistory(true);
		} catch (cause) {
			if (alive && !aborted(cause)) error = failure(cause);
		} finally {
			busy = false;
		}
	}
	onMount(() => {
		alive = true;
		lifetime = new AbortController();
		void Promise.all([loadActions(), loadHistory()])
			.catch((cause) => {
				if (alive && !aborted(cause)) error = failure(cause);
			})
			.finally(() => {
				loading = false;
			});
		const clockInterval = window.setInterval(() => {
			now = clockAnchor.at + performance.now() - clockAnchor.monotonic;
		}, 1000);
		const interval = window.setInterval(() => {
			void refresh();
		}, 5000);
		return () => {
			alive = false;
			selectionVersion++;
			lifetime.abort();
			evidenceController?.abort();
			window.clearInterval(interval);
			window.clearInterval(clockInterval);
		};
	});
</script>

<section
	class="space-y-5 rounded-2xl border border-gray-200 bg-white p-5 text-gray-900 dark:border-gray-700 dark:bg-gray-800 dark:text-white"
	aria-labelledby="radar-actions-heading"
>
	<div class="flex flex-wrap items-start justify-between gap-3">
		<div>
			<h2 id="radar-actions-heading" class="text-xl font-semibold">Acciones del radar</h2>
			<p class="mt-1 max-w-3xl text-sm text-gray-500 dark:text-gray-400">
				Ejecuta las acciones preparadas sobre este seguimiento. Cada resultado conserva su
				configuración y el intervalo analizado.
			</p>
		</div>
		<Button color="alternative" onclick={onprepare}>Preparar acciones</Button>
	</div>
	{#if error}<p role="alert" class="text-sm text-red-700 dark:text-red-300">{error}</p>{/if}
	{#if pollingError}<div role="status" class="text-sm text-amber-700 dark:text-amber-300">
			No se ha podido actualizar: {pollingError}
			<button type="button" class="font-semibold underline" onclick={refresh}
				>Reintentar actualización</button
			>
		</div>{/if}
	{#if loading}<p role="status" class="flex items-center gap-2 text-sm">
			<Spinner size="4" /> Cargando acciones…
		</p>{/if}
	<div class="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
		{#each actions as action (action.id)}
			{@const status = availability(action)}
			<div class="space-y-1.5 rounded-lg border border-gray-200 p-3 dark:border-gray-700">
				<Button
					size="sm"
					onclick={() => execute(action)}
					disabled={busy || !status.available}
					aria-describedby={`action-availability-${action.id}`}>Ejecutar {action.name}</Button
				>
				<p id={`action-availability-${action.id}`} class="text-xs text-gray-500 dark:text-gray-400">
					{status.message}
				</p>
			</div>
		{/each}
	</div>
	{#if !loading && !actions.length}<p class="text-sm text-gray-500 dark:text-gray-400">
			No hay acciones preparadas. Usa «Preparar acciones» para crear una pregunta reutilizable.
		</p>{/if}
	{#if executions.length}<details>
			<summary class="cursor-pointer text-sm font-semibold">Historial de ejecuciones</summary>
			<ul class="mt-3 space-y-2">
				{#each executions as execution (execution.id)}<li>
						<button
							type="button"
							class="w-full rounded-lg border border-gray-200 px-3 py-2 text-left text-sm hover:bg-gray-50 dark:border-gray-600 dark:hover:bg-gray-700"
							onclick={() => selectExecution(execution)}
							aria-pressed={selected?.id === execution.id}
							>{execution.action.name} · {date(execution.createdAt)} · {labels[
								execution.state
							]}</button
						>
					</li>{/each}
			</ul>
			{#if nextOffset !== null}<button
					type="button"
					class="mt-3 text-sm font-semibold underline"
					disabled={busy}
					onclick={moreHistory}>Cargar más ejecuciones</button
				>{/if}
		</details>{/if}
	{#if selected}<section
			class="space-y-4 border-t border-gray-200 pt-5 dark:border-gray-700"
			aria-labelledby="action-result-heading"
		>
			<h3
				id="action-result-heading"
				bind:this={resultHeading}
				tabindex="-1"
				class="text-lg font-semibold"
			>
				{selected.action.name} · {labels[selected.state]}
			</h3>
			<details class="text-xs text-gray-500 dark:text-gray-400">
				<summary class="cursor-pointer"
					>Configuración utilizada · versión {selected.action.revision}</summary
				>
				<p class="mt-2 whitespace-pre-wrap">{selected.action.prompt}</p>
			</details>
			{#if selected.snapshot}<div
					class="rounded-lg bg-gray-50 p-3 text-xs leading-6 dark:bg-gray-900/40"
				>
					<p>
						Datos de {date(selected.snapshot.from)} a {date(selected.snapshot.to)} · Captura: {date(
							selected.snapshot.at
						)}
					</p>
					{#if selected.snapshot.previousFrom}<p>
							Comparación desde {date(selected.snapshot.previousFrom)} hasta {date(
								selected.snapshot.from
							)}.
						</p>{/if}
					<p>
						{selected.snapshot.messages} mensajes · {selected.snapshot.students} alumnos distintos · {selected
							.snapshot.processed} analizados · {selected.snapshot.pending} pendientes · {selected
							.snapshot.notAnalyzable} sin texto analizable · {selected.snapshot.truncated} recortados.
					</p>
				</div>{/if}
			{#if selected.state === 'queued' || selected.state === 'processing'}<p
					role="status"
					class="flex items-center gap-2 text-sm"
				>
					<Spinner size="4" /> El análisis está en curso. Puedes seguir utilizando el radar.
				</p>{/if}
			{#if selected.error}<p role="alert" class="text-sm text-amber-700 dark:text-amber-300">
					{selected.error}
				</p>{/if}
			{#if selected.state === 'invalidated'}<p class="text-sm">
					Las evidencias han cambiado o se han eliminado. Vuelve a ejecutar la acción para obtener
					un resultado actualizado.
				</p>{/if}
			{#if selected.state === 'completed' && selected.result}
				<RadarText text={selected.result.text} />
				{#if selected.result.evidenceIds.length}<button
						type="button"
						class="text-sm font-semibold underline"
						onclick={() => showEvidence(selected!.result!.evidenceIds)}
						>Consultar evidencias del análisis</button
					>{/if}
				{#key selected.id}{#each selected.result.blocks as block, index (`${block.datasetId}-${index}`)}{@const dataset =
							selected.result.datasets.find(
								(item) => item.id === block.datasetId
							)}{#if dataset}<RadarActionDatasetView
								{dataset}
								kind={block.kind}
								onEvidence={showEvidence}
							/>{/if}{/each}{/key}
				{#if selected.result.limitations.length}<div
						class="rounded-lg bg-amber-50 p-3 text-sm text-amber-900 dark:bg-amber-900/20 dark:text-amber-200"
					>
						<h4 class="font-semibold">Límites del análisis</h4>
						<ul class="mt-2 list-disc space-y-1 pl-5">
							{#each selected.result.limitations as limitation, index (index)}<li>
									{limitation}
								</li>{/each}
						</ul>
					</div>{/if}
			{/if}
			<p class="text-xs text-gray-500 dark:text-gray-400">
				{selected.usage.tokens} tokens · {selected.usage.estimatedCost === null
					? 'Coste no disponible'
					: `Coste estimado: ${new Intl.NumberFormat('es', { style: 'currency', currency: 'USD', maximumFractionDigits: 4 }).format(selected.usage.estimatedCost)}`}
			</p>
		</section>{/if}
	{#if evidenceOpen}<section
			class="space-y-3 rounded-xl border border-sky-200 p-4 dark:border-sky-800"
			aria-labelledby="action-evidence-heading"
		>
			<div class="flex items-center justify-between gap-3">
				<h3
					id="action-evidence-heading"
					bind:this={evidenceHeading}
					tabindex="-1"
					class="font-semibold"
				>
					Evidencias del resultado
				</h3>
				<button type="button" class="text-sm underline" onclick={closeEvidence}
					>Cerrar evidencias</button
				>
			</div>
			{#if evidenceLoading}<p role="status" class="text-sm">
					Cargando evidencias…
				</p>{/if}{#if evidenceError}<p role="alert" class="text-sm text-red-700 dark:text-red-300">
					{evidenceError}
				</p>
				<button
					type="button"
					class="text-sm underline"
					onclick={() => showEvidence(requestedEvidence, true)}>Reintentar evidencias</button
				>{/if}{#each evidence as item (item.id)}<blockquote
					class="border-l-2 border-sky-300 pl-3 text-sm"
				>
					<p class="mb-1 text-xs text-gray-500 dark:text-gray-400">{date(item.at)}</p>
					<RadarText text={item.text} />
				</blockquote>{/each}{#if !evidenceLoading && !evidenceError && !evidence.length}<p
					class="text-sm"
				>
					No quedan evidencias disponibles para esta selección.
				</p>{/if}{#if evidenceOffset < requestedEvidence.length && !evidenceLoading && !evidenceError}<button
					type="button"
					class="text-sm font-semibold underline"
					onclick={() => showEvidence(requestedEvidence, true)}>Cargar más evidencias</button
				>{/if}
		</section>{/if}
</section>
