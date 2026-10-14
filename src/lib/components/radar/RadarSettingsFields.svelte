<script lang="ts">
	import { onMount } from 'svelte';
	import type { RadarPreset } from '$lib/types/radar';
	let {
		api,
		context = $bindable(''),
		instructions = $bindable(''),
		initialView = $bindable<'list' | 'bars' | 'cloud'>('list'),
		initialMetric = $bindable<'students' | 'messages'>('students'),
		contextEditable = true
	}: {
		api: string;
		context?: string;
		instructions?: string;
		initialView?: 'list' | 'bars' | 'cloud';
		initialMetric?: 'students' | 'messages';
		contextEditable?: boolean;
	} = $props();
	let presets = $state<RadarPreset[]>([]);
	let selected = $state('');
	let name = $state('');
	let busy = $state(false);
	let error = $state('');
	let notice = $state('');
	const inputClass =
		'mt-1 block w-full rounded-lg border border-gray-300 bg-gray-50 p-2.5 text-sm text-gray-900 dark:border-gray-600 dark:bg-gray-700 dark:text-white';
	async function request(path: string, options: { method?: string; body?: string } = {}) {
		const response = await fetch(`${api}/presets${path}`, {
			...options,
			headers: { 'Content-Type': 'application/json' }
		});
		const result = response.status === 204 ? null : await response.json();
		if (!response.ok)
			throw new Error(
				result?.message ?? result?.error ?? 'No se ha podido completar la operación.'
			);
		return result;
	}
	async function load() {
		try {
			presets = (await request('')).presets;
		} catch (cause) {
			error =
				cause instanceof Error ? cause.message : 'No se han podido cargar las configuraciones.';
		}
	}
	function apply() {
		const preset = presets.find((item) => item.id === selected);
		if (!preset) return;
		if (contextEditable) context = preset.context ?? '';
		instructions = preset.instructions;
		initialView = preset.initialView;
		initialMetric = preset.initialMetric;
		notice = contextEditable
			? 'Configuración cargada. Puedes adaptarla antes de iniciar.'
			: 'Instrucciones cargadas. Pulsa Aplicar para actualizar el resumen. El contexto de esta clase se conserva.';
	}
	async function save() {
		if (!name.trim()) return;
		busy = true;
		error = '';
		notice = '';
		try {
			const preset = await request('', {
				method: 'POST',
				body: JSON.stringify({
					name: name.trim(),
					context,
					instructions,
					initialView,
					initialMetric
				})
			});
			presets = [...presets, preset];
			selected = preset.id;
			name = '';
			notice = 'Configuración guardada para este curso.';
		} catch (cause) {
			error = cause instanceof Error ? cause.message : 'No se ha podido guardar.';
		} finally {
			busy = false;
		}
	}
	async function remove() {
		if (!selected) return;
		busy = true;
		error = '';
		notice = '';
		try {
			await request(`/${selected}`, { method: 'DELETE' });
			presets = presets.filter((item) => item.id !== selected);
			selected = '';
			notice = 'Configuración eliminada. Los seguimientos anteriores se conservan.';
		} catch (cause) {
			error = cause instanceof Error ? cause.message : 'No se ha podido eliminar.';
		} finally {
			busy = false;
		}
	}
	onMount(() => {
		void load();
	});
</script>

<div class="space-y-4">
	<div class="flex flex-wrap items-end gap-2">
		<label class="min-w-48 flex-1 text-sm font-medium"
			>Configuraciones del curso
			<select class={inputClass} bind:value={selected}
				><option value="">Selecciona una configuración</option
				>{#each presets as preset (preset.id)}<option value={preset.id}>{preset.name}</option
					>{/each}</select
			>
		</label>
		<button
			type="button"
			class="rounded-lg border border-gray-300 px-3 py-2 text-sm disabled:opacity-50 dark:border-gray-600"
			disabled={!selected || busy}
			onclick={apply}>Cargar</button
		>
		<button
			type="button"
			class="rounded-lg border border-gray-300 px-3 py-2 text-sm disabled:opacity-50 dark:border-gray-600"
			disabled={!selected || busy}
			onclick={remove}>Eliminar configuración</button
		>
	</div>
	<label class="block text-sm font-medium"
		>Instrucciones para el resumen y las sugerencias
		<textarea
			class={inputClass}
			bind:value={instructions}
			rows="4"
			maxlength="4000"
			placeholder="Destaca las dudas sobre prerrequisitos y propón aclaraciones breves con ejemplos cotidianos."
		></textarea>
		<span class="mt-1 block text-xs font-normal text-gray-500 dark:text-gray-400"
			>Indica qué temas destacar, el nivel de detalle y cómo quieres las sugerencias. Se conservan
			las categorías, los recuentos y las demás dudas.</span
		>
	</label>
	<div class="flex flex-wrap gap-2" aria-label="Ejemplos de instrucciones">
		{#each [{ label: 'Priorizar prerrequisitos', text: 'Prioriza las dudas sobre prerrequisitos y sugiere cómo repasarlos antes de avanzar.' }, { label: 'Aclaraciones breves', text: 'Propón aclaraciones breves con ejemplos cotidianos que pueda explicar en un minuto.' }, { label: 'Peticiones de ejemplo', text: 'Destaca las peticiones de ejemplo y sugiere ejemplos adecuados al contexto de la clase.' }] as example (example.label)}
			<button
				type="button"
				class="rounded-full bg-sky-50 px-3 py-1.5 text-xs text-sky-800 dark:bg-sky-900/30 dark:text-sky-200"
				onclick={() => {
					instructions = instructions ? `${instructions}\n${example.text}` : example.text;
				}}>{example.label}</button
			>
		{/each}
	</div>
	{#if contextEditable}
		<div class="grid gap-4 sm:grid-cols-2">
			<label class="text-sm font-medium"
				>Vista inicial<select class={inputClass} bind:value={initialView}
					><option value="list">Lista</option><option value="bars">Barras</option><option
						value="cloud">Nube de temas</option
					></select
				></label
			>
			<label class="text-sm font-medium"
				>Dar más peso a<select class={inputClass} bind:value={initialMetric}
					><option value="students">Alumnos distintos</option><option value="messages"
						>Mensajes</option
					></select
				></label
			>
		</div>
	{/if}
	<div class="flex flex-wrap items-end gap-2">
		<label class="min-w-48 flex-1 text-sm font-medium"
			>Nombre para reutilizar esta configuración<input
				class={inputClass}
				bind:value={name}
				maxlength="100"
				placeholder="Por ejemplo, Repaso de prerrequisitos"
			/></label
		>
		<button
			type="button"
			class="rounded-lg border border-gray-300 px-3 py-2 text-sm disabled:opacity-50 dark:border-gray-600"
			disabled={busy || !name.trim()}
			onclick={save}>Guardar configuración</button
		>
	</div>
	<p class="text-xs text-gray-500 dark:text-gray-400">
		Las configuraciones guardadas están disponibles para el profesorado del curso. Cada seguimiento
		conserva su propia copia.
	</p>
	{#if error}<p role="alert" class="text-sm text-red-700 dark:text-red-300">{error}</p>{/if}
	{#if notice}<p role="status" class="text-sm text-sky-800 dark:text-sky-200">{notice}</p>{/if}
</div>
