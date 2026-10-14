<script lang="ts">
	import { onMount, tick } from 'svelte';
	import { radarActionAvailability } from '$lib/utils/radarActionAvailability';
	import { Button, Spinner } from 'flowbite-svelte';
	import type { RadarAction, RadarActionInput } from '$lib/types/radarActions';
	let {
		api,
		actions = $bindable([]),
		onclose
	}: { api: string; actions?: RadarAction[]; onclose: () => void } = $props();
	let editing = $state(false);
	let editId = $state<string | null>(null);
	let revision = $state(0);
	let form = $state<RadarActionInput>(emptyForm());
	let busy = $state(false);
	let loading = $state(true);
	let error = $state('');
	let formHeading: HTMLHeadingElement | undefined = $state();
	let alive = false;
	let lifetime = new AbortController();
	const inputClass =
		'mt-1 block w-full rounded-lg border border-gray-300 bg-gray-50 p-2.5 text-sm dark:border-gray-600 dark:bg-gray-700';
	const staleEdit = $derived(
		editId !== null &&
			!actions.some((action) => action.id === editId && action.revision === revision)
	);
	function emptyForm(): RadarActionInput {
		return {
			name: '',
			prompt: '',
			scope: 'activity',
			window: 'all',
			minutes: 5,
			presentation: 'auto'
		};
	}
	function failure(cause: unknown) {
		return cause instanceof Error ? cause.message : 'No se ha podido completar la operación.';
	}
	function aborted(cause: unknown) {
		return cause instanceof Error && cause.name === 'AbortError';
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
	async function edit(action?: RadarAction, duplicate = false) {
		editId = action && !duplicate ? action.id : null;
		revision = action?.revision ?? 0;
		form = action
			? {
					name: duplicate ? `${action.name.slice(0, 70)} (copia)` : action.name,
					prompt: action.prompt,
					scope: action.scope,
					window: action.window,
					minutes: action.minutes,
					presentation: action.presentation
				}
			: emptyForm();
		editing = true;
		error = '';
		await tick();
		formHeading?.focus();
	}
	async function save(event: SubmitEvent) {
		event.preventDefault();
		busy = true;
		error = '';
		try {
			const saved = await request<RadarAction>(editId ? `/actions/${editId}` : '/actions', {
				method: editId ? 'PATCH' : 'POST',
				body: JSON.stringify({ ...form, ...(editId ? { revision } : {}) })
			});
			if (!alive) return;
			actions = [...actions.filter((action) => action.id !== saved.id), saved];
			editing = false;
		} catch (cause) {
			if (alive && !aborted(cause)) {
				error = failure(cause);
				await loadActions().catch(() => {});
			}
		} finally {
			busy = false;
		}
	}
	async function remove(action: RadarAction) {
		busy = true;
		error = '';
		try {
			await request(`/actions/${action.id}?revision=${action.revision}`, { method: 'DELETE' });
			if (alive) {
				actions = actions.filter((item) => item.id !== action.id);
				if (editId === action.id) editing = false;
			}
		} catch (cause) {
			if (alive && !aborted(cause)) {
				error = failure(cause);
				await loadActions().catch(() => {});
			}
		} finally {
			busy = false;
		}
	}

	onMount(() => {
		alive = true;
		lifetime = new AbortController();
		void loadActions()
			.catch((cause) => {
				if (alive && !aborted(cause)) error = failure(cause);
			})
			.finally(() => {
				loading = false;
			});
		return () => {
			alive = false;
			lifetime.abort();
		};
	});
</script>

<section
	class="space-y-5 rounded-2xl border border-sky-200 bg-white p-5 text-gray-900 dark:border-sky-800 dark:bg-gray-800 dark:text-white"
	aria-labelledby="radar-action-library-heading"
>
	<div class="flex flex-wrap items-start justify-between gap-3">
		<div>
			<h2 id="radar-action-library-heading" tabindex="-1" class="text-xl font-semibold">
				Preparación de acciones
			</h2>
			<p class="mt-1 max-w-3xl text-sm text-gray-500 dark:text-gray-400">
				Prepara preguntas y análisis antes de la clase. Guardarlos no inicia un seguimiento ni
				consume IA; podrás ejecutarlos cuando abras uno.
			</p>
		</div>
		<div class="flex gap-2">
			<Button color="alternative" onclick={() => edit()} disabled={busy}>Nueva acción</Button
			><Button color="alternative" onclick={onclose}>Cerrar preparación</Button>
		</div>
	</div>
	{#if error}<p role="alert" class="text-sm text-red-700 dark:text-red-300">{error}</p>{/if}
	{#if loading}<p role="status" class="flex items-center gap-2 text-sm">
			<Spinner size="4" /> Cargando acciones…
		</p>{/if}
	{#if editing}<form
			class="space-y-4 rounded-xl border border-gray-200 bg-gray-50 p-4 dark:border-gray-600 dark:bg-gray-900/30"
			onsubmit={save}
		>
			<h3 bind:this={formHeading} tabindex="-1" class="font-semibold">
				{editId ? 'Editar acción' : 'Crear acción'}
			</h3>
			<label class="block text-sm font-medium"
				>Nombre de la acción<input
					class={inputClass}
					bind:value={form.name}
					maxlength="80"
					required
				/></label
			>
			<label class="block text-sm font-medium"
				>Pregunta o instrucciones<textarea
					class={inputClass}
					bind:value={form.prompt}
					maxlength="4000"
					rows="4"
					required
					placeholder="Compara las dudas de los últimos minutos con el periodo anterior y señala qué conviene repasar."
				></textarea></label
			>
			<div class="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
				<label class="text-sm font-medium"
					>Disponible en<select class={inputClass} bind:value={form.scope}
						><option value="activity">Esta actividad</option><option value="course"
							>Todo el curso</option
						></select
					></label
				>
				<label class="text-sm font-medium"
					>Intervalo<select class={inputClass} bind:value={form.window}
						><option value="all">Todo el seguimiento</option><option value="recent"
							>Últimos minutos</option
						><option value="compare">Comparar con el periodo anterior</option></select
					></label
				>
				{#if form.window !== 'all'}<label class="text-sm font-medium"
						>Minutos por periodo<input
							class={inputClass}
							type="number"
							min="1"
							max="120"
							step="1"
							bind:value={form.minutes}
							required
						/></label
					>{/if}
				<label class="text-sm font-medium"
					>Presentación preferida<select class={inputClass} bind:value={form.presentation}
						><option value="auto">Automática</option><option value="text">Texto</option><option
							value="statistics">Estadísticas</option
						><option value="table">Tabla</option><option value="bar">Barras</option><option
							value="line">Líneas</option
						></select
					></label
				>
			</div>
			<p class="text-xs text-gray-500 dark:text-gray-400">
				El alcance indica dónde se puede reutilizar la acción. Al ejecutarla, analizará el
				seguimiento que tengas abierto. Ejecutarla consume cuota de IA; cambiar la presentación de
				un resultado guardado no.
			</p>
			{#if staleEdit}<p role="alert" class="text-sm text-amber-700 dark:text-amber-300">
					La acción ha cambiado o se ha eliminado. Conserva tu texto y vuelve a abrirla desde la
					biblioteca para editar la versión actual.
				</p>{/if}
			<div class="flex gap-2">
				<Button type="submit" disabled={busy || staleEdit}>Guardar acción</Button><Button
					color="alternative"
					onclick={() => {
						editing = false;
					}}>Cancelar</Button
				>
			</div>
		</form>{/if}
	<div class="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
		{#each actions as action (action.id)}<article
				class="rounded-xl border border-gray-200 p-4 dark:border-gray-700"
			>
				<h3 class="font-semibold">{action.name}</h3>
				<p class="mt-1 text-xs text-gray-500 dark:text-gray-400">
					{action.scope === 'course' ? 'Curso' : 'Actividad'} · {action.window === 'all'
						? 'Todo el seguimiento'
						: action.window === 'compare'
							? `Comparar periodos de ${action.minutes} min`
							: `Últimos ${action.minutes} min`} · Versión {action.revision}
				</p>
				<p class="mt-2 text-xs text-gray-500 dark:text-gray-400">
					{radarActionAvailability(action, null, 0).message}
				</p>
				<details class="mt-2 text-sm">
					<summary class="cursor-pointer">Ver instrucciones</summary>
					<p class="mt-2 whitespace-pre-wrap">{action.prompt}</p>
				</details>
				<div class="mt-3 flex flex-wrap gap-2">
					<Button size="xs" color="alternative" onclick={() => edit(action)} disabled={busy}
						>Editar</Button
					><Button size="xs" color="alternative" onclick={() => edit(action, true)} disabled={busy}
						>Duplicar</Button
					><button
						type="button"
						class="px-2 text-xs underline disabled:opacity-50"
						onclick={() => remove(action)}
						disabled={busy}
						aria-label={`Eliminar acción ${action.name}`}>Eliminar</button
					>
				</div>
			</article>{/each}
	</div>
	{#if !loading && !actions.length}<p class="text-sm text-gray-500 dark:text-gray-400">
			Todavía no hay acciones guardadas. Crea una pregunta para reutilizarla durante la clase.
		</p>{/if}
</section>
