<script lang="ts">
	import type { PageProps } from './$types';
	import { enhance } from '$app/forms';
	import { beforeNavigate } from '$app/navigation';
	import { page } from '$app/state';
	import { resolve } from '$app/paths';
	import LessonAgentToolCatalog from '$lib/components/lesson/LessonAgentToolCatalog.svelte';
	import {
		getLessonAgentToolMetrics,
		type LessonAgentToolPresentationItem
	} from '$lib/lesson/lessonAgentToolPresentation';
	import { breadcrumb } from '$lib/stores/breadcrumb';
	import { normalizeLessonAgentConfig } from '$lib/types/lesson';
	import { ArrowRight, Bot, CheckCircle2, Paperclip, Route, Settings2 } from 'lucide-svelte';
	import { onMount } from 'svelte';

	let { data, form }: PageProps = $props();

	let name = $state(data.activity.name);
	let description = $state(data.activity.description ?? '');
	let status = $state(data.activity.status);
	let sessionPolicy = $state(data.lessonConfig.sessionPolicy);
	let allowRestart = $state(data.lessonConfig.allowRestart);
	let isMetaDirty = $state(false);
	let metaSaved = $state(false);
	let agentPolicyMode = $state<'all' | 'custom'>(
		data.definition.allowedAgentToolIds?.length ? 'custom' : 'all'
	);
	let selectedAllowedAgentToolIds = $state.raw(
		(data.definition.allowedAgentToolIds?.length
			? data.definition.allowedAgentToolIds
			: data.lessonAgentTools.map((tool) => tool.id)
		).slice()
	);
	let isAgentPolicyDirty = $state(false);
	let agentPolicySaved = $state(false);

	const cid = $derived(page.params.cid);
	const ilid = $derived(page.params.ilid);
	const resourcesCount = $derived(data.files.length);
	const revisionDiff = $derived(data.revisionSummary.diff);
	const revisionImpact = $derived(data.revisionSummary.impact);
	const hasDraftChanges = $derived(
		revisionDiff.totalChangedBlocks > 0 || revisionDiff.entryBlockChanged
	);
	const lessonSafeAgentToolIds = $derived(data.lessonAgentTools.map((tool) => tool.id));
	const selectedLessonPolicyToolIds = $derived(
		agentPolicyMode === 'all' ? lessonSafeAgentToolIds : selectedAllowedAgentToolIds
	);
	const selectedLessonPolicyMetrics = $derived(
		getLessonAgentToolMetrics(
			data.lessonAgentTools as LessonAgentToolPresentationItem[],
			selectedLessonPolicyToolIds
		)
	);
	const isAgentPolicySelectionEmpty = $derived(
		agentPolicyMode === 'custom' && selectedAllowedAgentToolIds.length === 0
	);
	const totalFlowConnections = $derived(
		data.graphSummaries.reduce((total, summary) => total + summary.outgoingBlockIds.length, 0)
	);
	const entryBlock = $derived(
		data.definition.blocks.find((block) => block.id === data.definition.entryBlockId)
	);
	const agentBlocks = $derived.by(() =>
		data.definition.blocks
			.filter((block) => block.kind === 'agent')
			.map((block) => {
				const normalizedConfig = normalizeLessonAgentConfig(block.agentConfig);
				const usesCustomSubset =
					normalizedConfig.runtimeMode === 'agent' && normalizedConfig.enabledToolIds !== undefined;

				return {
					id: block.id,
					title: block.title,
					runtimeMode: normalizedConfig.runtimeMode,
					usesCustomSubset,
					selectedToolCount: normalizedConfig.enabledToolIds?.length ?? 0
				};
			})
	);
	const agentBlocksWithCustomSubset = $derived(
		agentBlocks.filter((block) => block.usesCustomSubset).length
	);
	const agentBlocksInAgentRuntime = $derived(
		agentBlocks.filter((block) => block.runtimeMode === 'agent').length
	);
	const hasUnsavedLessonSettings = $derived(isMetaDirty || isAgentPolicyDirty);

	function markMetaDirty() {
		isMetaDirty = true;
		metaSaved = false;
	}

	function markAgentPolicyDirty() {
		isAgentPolicyDirty = true;
		agentPolicySaved = false;
	}

	function setAgentPolicyMode(mode: 'all' | 'custom') {
		if (agentPolicyMode === mode) return;
		agentPolicyMode = mode;
		if (mode === 'custom') {
			selectedAllowedAgentToolIds = [];
		}
		markAgentPolicyDirty();
	}

	function toggleAllowedAgentTool(toolId: string, checked: boolean) {
		const currentSelection = selectedAllowedAgentToolIds;
		const nextSelection = checked
			? currentSelection.includes(toolId)
				? currentSelection
				: [...currentSelection, toolId]
			: currentSelection.filter((candidate) => candidate !== toolId);

		selectedAllowedAgentToolIds = nextSelection;
		markAgentPolicyDirty();
	}

	function confirmLeaveWithUnsavedSettings() {
		if (!hasUnsavedLessonSettings) return true;
		return window.confirm(
			'Hay cambios sin guardar en la portada o en la política agéntica. ¿Deseas salir de todas formas?'
		);
	}

	$effect(() => {
		breadcrumb.set([
			{ label: 'Inicio', href: '/' },
			{ label: 'Cursos', href: '/course' },
			{ label: 'Curso', href: `/course/${page.params.cid}` },
			{ label: 'Interactivos', href: `/course/${page.params.cid}/admin/interactives` },
			{
				label: name || 'Actividad',
				href: `/course/${page.params.cid}/admin/interactives/${page.params.ilid}`
			},
			{ label: 'Editor lesson' }
		]);
	});

	$effect(() => {
		if (!form?.success) return;

		if (form.action === 'updateLessonMeta') {
			name = data.activity.name;
			description = data.activity.description ?? '';
			status = data.activity.status;
			sessionPolicy = data.lessonConfig.sessionPolicy;
			allowRestart = data.lessonConfig.allowRestart;
		}

		if (form.action === 'updateAgentPolicy') {
			agentPolicyMode = data.definition.allowedAgentToolIds?.length ? 'custom' : 'all';
			selectedAllowedAgentToolIds = [
				...(data.definition.allowedAgentToolIds?.length
					? data.definition.allowedAgentToolIds
					: data.lessonAgentTools.map((tool) => tool.id))
			];
		}
	});

	onMount(() => {
		const handleBeforeUnload = (event: BeforeUnloadEvent) => {
			if (!hasUnsavedLessonSettings) return;
			event.preventDefault();
			event.returnValue = '';
		};

		window.addEventListener('beforeunload', handleBeforeUnload);
		return () => window.removeEventListener('beforeunload', handleBeforeUnload);
	});

	beforeNavigate((navigation) => {
		if (!confirmLeaveWithUnsavedSettings()) {
			navigation.cancel();
		}
	});
</script>

<div class="space-y-6">
	<div
		class="rounded-2xl bg-linear-to-br from-amber-100 via-orange-50 to-white p-6 shadow-sm ring-1 ring-amber-200/70 dark:from-amber-950/30 dark:via-gray-900 dark:to-gray-900 dark:ring-amber-900/40"
	>
		<div class="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
			<div class="max-w-3xl">
				<div class="mb-3 flex items-center gap-3">
					<div class="rounded-2xl bg-amber-500/15 p-3 text-amber-700 dark:text-amber-300">
						<Route class="h-5 w-5" />
					</div>
					<div>
						<p
							class="text-sm font-medium tracking-[0.18em] text-amber-800/70 uppercase dark:text-amber-200/70"
						>
							Lección viva
						</p>
						<h1 class="text-2xl font-semibold text-gray-900 dark:text-white">
							{name}
						</h1>
					</div>
				</div>
				<p class="text-sm leading-6 text-gray-600 dark:text-gray-300">
					Gestiona los metadatos, revisiones y política global de la lesson. La estructura y las
					conexiones viven en el editor visual.
				</p>
			</div>

			<div class="grid gap-3 sm:grid-cols-3">
				<div
					class="rounded-2xl bg-white/80 px-4 py-3 shadow-sm ring-1 ring-gray-200/70 backdrop-blur dark:bg-gray-900/60 dark:ring-gray-800"
				>
					<p class="text-xs tracking-[0.16em] text-gray-500 uppercase dark:text-gray-400">
						Bloques
					</p>
					<p class="mt-1 text-2xl font-semibold text-gray-900 dark:text-white">
						{data.definition.blocks.length}
					</p>
				</div>
				<div
					class="rounded-2xl bg-white/80 px-4 py-3 shadow-sm ring-1 ring-gray-200/70 backdrop-blur dark:bg-gray-900/60 dark:ring-gray-800"
				>
					<p class="text-xs tracking-[0.16em] text-gray-500 uppercase dark:text-gray-400">
						Entrada
					</p>
					<p class="mt-1 truncate text-sm font-semibold text-gray-900 dark:text-white">
						{data.definition.entryBlockId}
					</p>
				</div>
				<div
					class="rounded-2xl bg-white/80 px-4 py-3 shadow-sm ring-1 ring-gray-200/70 backdrop-blur dark:bg-gray-900/60 dark:ring-gray-800"
				>
					<p class="text-xs tracking-[0.16em] text-gray-500 uppercase dark:text-gray-400">
						Recursos
					</p>
					<p class="mt-1 text-2xl font-semibold text-gray-900 dark:text-white">
						{resourcesCount}
					</p>
				</div>
			</div>
		</div>
	</div>

	{#if form?.error}
		<div
			class="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800 dark:border-red-900/40 dark:bg-red-950/20 dark:text-red-200"
		>
			{form.error}
		</div>
	{/if}

	{#if form?.success && form?.message}
		<div
			class="rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800 dark:border-emerald-900/40 dark:bg-emerald-950/20 dark:text-emerald-200"
		>
			{form.message}
		</div>
	{/if}

	<div
		class="rounded-2xl bg-white p-6 shadow-sm ring-1 ring-gray-200/80 dark:bg-gray-900/40 dark:ring-gray-800"
	>
		<div class="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
			<div class="max-w-3xl">
				<p
					class="text-sm font-semibold tracking-[0.16em] text-gray-500 uppercase dark:text-gray-400"
				>
					Revisiones
				</p>
				<h2 class="mt-2 text-lg font-semibold text-gray-900 dark:text-white">
					Publicado en revisión #{data.revisionSummary.published.revisionNumber} · borrador en revisión
					#{data.revisionSummary.draft.revisionNumber}
				</h2>
				<p class="mt-2 text-sm leading-6 text-gray-600 dark:text-gray-300">
					Los intentos existentes siguen ligados a la revisión con la que comenzaron. Publicar
					afecta solo a intentos nuevos y los previews quedan aislados del alumnado real.
				</p>
			</div>

			<div class="flex flex-wrap gap-2">
				<a
					href={resolve(`/lesson/${ilid}?preview=published`)}
					target="_blank"
					rel="noreferrer"
					class="rounded-xl border border-emerald-300 bg-emerald-50 px-3 py-2 text-sm font-medium text-emerald-800 hover:bg-emerald-100 dark:border-emerald-900/40 dark:bg-emerald-950/30 dark:text-emerald-200 dark:hover:bg-emerald-950/50"
				>
					<Route class="mr-1 inline h-4 w-4" />
					Preview publicado
				</a>
				<a
					href={resolve(`/lesson/${ilid}?preview=draft`)}
					target="_blank"
					rel="noreferrer"
					class="rounded-xl border border-sky-300 bg-sky-50 px-3 py-2 text-sm font-medium text-sky-800 hover:bg-sky-100 dark:border-sky-900/40 dark:bg-sky-950/30 dark:text-sky-200 dark:hover:bg-sky-950/50"
				>
					<Route class="mr-1 inline h-4 w-4" />
					Preview borrador
				</a>
				<form
					method="POST"
					action="?/discardDraft"
					onsubmit={(event) => {
						if (
							hasDraftChanges &&
							!window.confirm('Vas a descartar el borrador y volver al publicado actual.')
						) {
							event.preventDefault();
						}
					}}
				>
					<button
						class="rounded-xl border border-gray-300 px-3 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-50 dark:border-gray-700 dark:text-gray-200 dark:hover:bg-gray-800"
						disabled={!hasDraftChanges}
					>
						Descartar borrador
					</button>
				</form>
				<form method="POST" action="?/publishDraft">
					<button
						class="bg-primary-600 hover:bg-primary-700 rounded-xl px-3 py-2 text-sm font-medium text-white disabled:cursor-not-allowed disabled:opacity-50"
						disabled={!hasDraftChanges}
					>
						Publicar borrador
					</button>
				</form>
			</div>
		</div>

		<div class="mt-5 grid gap-4 lg:grid-cols-3">
			<div class="rounded-2xl border border-gray-200 px-4 py-4 dark:border-gray-800">
				<p class="text-xs tracking-[0.16em] text-gray-500 uppercase dark:text-gray-400">
					Diff visible
				</p>
				<p class="mt-2 text-sm font-medium text-gray-900 dark:text-white">
					{revisionDiff.totalChangedBlocks} bloque{revisionDiff.totalChangedBlocks === 1 ? '' : 's'} con
					cambios
				</p>
				<p class="mt-2 text-sm text-gray-600 dark:text-gray-300">
					+{revisionDiff.addedBlockIds.length} nuevos · -{revisionDiff.removedBlockIds.length} eliminados
					· {revisionDiff.changedBlockIds.length} editados
				</p>
				<p class="mt-2 text-xs text-gray-500 dark:text-gray-400">
					{revisionDiff.entryBlockChanged
						? 'La entrada de la lesson cambiará al publicar.'
						: 'La entrada actual se mantiene.'}
				</p>
			</div>

			<div class="rounded-2xl border border-gray-200 px-4 py-4 dark:border-gray-800">
				<p class="text-xs tracking-[0.16em] text-gray-500 uppercase dark:text-gray-400">
					Impacto en intentos
				</p>
				<p class="mt-2 text-sm font-medium text-gray-900 dark:text-white">
					{revisionImpact.activeAttemptsOnCurrentPublishedRevision} activo{revisionImpact.activeAttemptsOnCurrentPublishedRevision ===
					1
						? ''
						: 's'} en la revisión publicada
				</p>
				<p class="mt-2 text-sm text-gray-600 dark:text-gray-300">
					{revisionImpact.activeAttemptsOnOlderRevisions} activo{revisionImpact.activeAttemptsOnOlderRevisions ===
					1
						? ''
						: 's'} ya siguen revisiones antiguas y no se migran automáticamente.
				</p>
			</div>

			<div class="rounded-2xl border border-gray-200 px-4 py-4 dark:border-gray-800">
				<p class="text-xs tracking-[0.16em] text-gray-500 uppercase dark:text-gray-400">
					Histórico y assets
				</p>
				<p class="mt-2 text-sm font-medium text-gray-900 dark:text-white">
					{revisionImpact.completedAttemptsOnHistoricalRevisions} intento{revisionImpact.completedAttemptsOnHistoricalRevisions ===
					1
						? ''
						: 's'} completado{revisionImpact.completedAttemptsOnHistoricalRevisions === 1
						? ''
						: 's'} ya quedarán en histórico
				</p>
				<p class="mt-2 text-sm text-gray-600 dark:text-gray-300">
					{revisionImpact.revisionsReferencedByLearnerAttempts} revisiones están referenciadas por intentos
					learner y {revisionImpact.referencedAssetFileIds.length} asset
					{revisionImpact.referencedAssetFileIds.length === 1 ? '' : 's'} siguen en uso.
				</p>
			</div>
		</div>
	</div>

	<div class="grid gap-6 xl:grid-cols-[minmax(0,1.5fr)_minmax(320px,0.9fr)]">
		<div class="space-y-6">
			<div
				class="rounded-2xl bg-white p-6 shadow-sm ring-1 ring-gray-200/80 dark:bg-gray-900/40 dark:ring-gray-800"
			>
				<div class="mb-5 flex items-start justify-between gap-4">
					<div>
						<h2 class="text-lg font-semibold text-gray-900 dark:text-white">Configuración base</h2>
						<p class="text-sm text-gray-500 dark:text-gray-400">
							Solo los campos comunes de la actividad y el runtime global de la lesson.
						</p>
					</div>
					<div
						class="rounded-full bg-gray-100 px-3 py-1 text-xs font-medium text-gray-600 dark:bg-gray-800 dark:text-gray-300"
					>
						<Settings2 class="mr-1 inline h-3.5 w-3.5" />
						Portada mínima
					</div>
				</div>

				<form
					method="POST"
					action="?/updateLessonMeta"
					use:enhance={() => {
						return async ({ result, update }) => {
							await update();
							if (result.type === 'success') {
								isMetaDirty = false;
								metaSaved = true;
							}
						};
					}}
					class="space-y-5"
				>
					<div class="grid gap-4 md:grid-cols-2">
						<label class="block">
							<span class="mb-2 block text-sm font-medium text-gray-700 dark:text-gray-300"
								>Nombre</span
							>
							<input
								class="w-full rounded-xl border border-gray-300 bg-white px-3 py-2.5 text-sm dark:border-gray-700 dark:bg-gray-950 dark:text-white"
								name="name"
								bind:value={name}
								oninput={markMetaDirty}
							/>
						</label>

						<label class="block">
							<span class="mb-2 block text-sm font-medium text-gray-700 dark:text-gray-300"
								>Estado</span
							>
							<select
								class="w-full rounded-xl border border-gray-300 bg-white px-3 py-2.5 text-sm dark:border-gray-700 dark:bg-gray-950 dark:text-white"
								name="status"
								bind:value={status}
								onchange={markMetaDirty}
							>
								<option value="hidden">Oculta</option>
								<option value="published">Publicada</option>
								<option value="closed">Cerrada</option>
								<option value="archived">Archivada</option>
							</select>
						</label>
					</div>

					<label class="block">
						<span class="mb-2 block text-sm font-medium text-gray-700 dark:text-gray-300"
							>Descripción</span
						>
						<textarea
							class="min-h-28 w-full rounded-xl border border-gray-300 bg-white px-3 py-2.5 text-sm dark:border-gray-700 dark:bg-gray-950 dark:text-white"
							name="description"
							bind:value={description}
							oninput={markMetaDirty}
						></textarea>
					</label>

					<div class="grid gap-4 md:grid-cols-2">
						<label class="block">
							<span class="mb-2 block text-sm font-medium text-gray-700 dark:text-gray-300"
								>Política de sesión</span
							>
							<select
								class="w-full rounded-xl border border-gray-300 bg-white px-3 py-2.5 text-sm dark:border-gray-700 dark:bg-gray-950 dark:text-white"
								name="sessionPolicy"
								bind:value={sessionPolicy}
								onchange={markMetaDirty}
							>
								<option value="resume_latest">Reanudar el último intento</option>
								<option value="always_new_attempt">Crear un intento nuevo siempre</option>
							</select>
						</label>

						<label
							class="flex items-center gap-3 rounded-2xl border border-gray-200 px-4 py-3 dark:border-gray-800"
						>
							<input
								type="checkbox"
								name="allowRestart"
								bind:checked={allowRestart}
								onchange={markMetaDirty}
								class="text-primary-600 h-4 w-4 rounded border-gray-300"
							/>
							<div>
								<p class="text-sm font-medium text-gray-900 dark:text-white">Permitir reinicio</p>
								<p class="text-xs text-gray-500 dark:text-gray-400">
									Crea un intento nuevo sin perder el histórico anterior.
								</p>
							</div>
						</label>
					</div>

					<div class="flex items-center justify-between gap-4">
						<div>
							{#if metaSaved}
								<p class="text-sm text-green-700 dark:text-green-300">
									<CheckCircle2 class="mr-1 inline h-4 w-4" />
									Cambios guardados correctamente.
								</p>
							{:else if isMetaDirty}
								<p class="text-sm text-amber-700 dark:text-amber-300">
									Hay cambios sin guardar en la portada.
								</p>
							{/if}
						</div>
						<button
							class="bg-primary-600 hover:bg-primary-700 rounded-xl px-4 py-2.5 text-sm font-medium text-white"
						>
							Guardar portada
						</button>
					</div>
				</form>
			</div>

			<details
				class="rounded-2xl bg-white p-6 shadow-sm ring-1 ring-gray-200/80 dark:bg-gray-900/40 dark:ring-gray-800"
			>
				<summary class="cursor-pointer list-none marker:hidden">
					<div class="flex flex-wrap items-start justify-between gap-4">
						<div class="max-w-3xl">
							<h2 class="text-lg font-semibold text-gray-900 dark:text-white">
								Capacidades agénticas
							</h2>
							<p class="mt-1 text-sm text-gray-500 dark:text-gray-400">
								Aquí decides la política global de tools para toda la lesson. Los bloques IA solo
								podrán heredar esta allowlist o elegir un subconjunto dentro de ella.
							</p>
						</div>
						<div
							class="rounded-full bg-slate-100 px-3 py-1 text-xs font-medium text-slate-700 dark:bg-slate-800 dark:text-slate-200"
						>
							<Bot class="mr-1 inline h-3.5 w-3.5" />
							Política primero
						</div>
					</div>

					<div class="mt-5 grid gap-3 md:grid-cols-4">
						<div class="rounded-2xl border border-gray-200 px-4 py-4 dark:border-gray-800">
							<p class="text-xs tracking-[0.16em] text-gray-500 uppercase dark:text-gray-400">
								Tools permitidas
							</p>
							<p class="mt-1 text-2xl font-semibold text-gray-900 dark:text-white">
								{selectedLessonPolicyMetrics.total}
							</p>
						</div>
						<div class="rounded-2xl border border-gray-200 px-4 py-4 dark:border-gray-800">
							<p class="text-xs tracking-[0.16em] text-gray-500 uppercase dark:text-gray-400">
								UI interactivas
							</p>
							<p class="mt-1 text-2xl font-semibold text-gray-900 dark:text-white">
								{selectedLessonPolicyMetrics.interactive}
							</p>
						</div>
						<div class="rounded-2xl border border-gray-200 px-4 py-4 dark:border-gray-800">
							<p class="text-xs tracking-[0.16em] text-gray-500 uppercase dark:text-gray-400">
								HITL
							</p>
							<p class="mt-1 text-2xl font-semibold text-gray-900 dark:text-white">
								{selectedLessonPolicyMetrics.hitl}
							</p>
						</div>
						<div class="rounded-2xl border border-gray-200 px-4 py-4 dark:border-gray-800">
							<p class="text-xs tracking-[0.16em] text-gray-500 uppercase dark:text-gray-400">
								Bloques con override
							</p>
							<p class="mt-1 text-2xl font-semibold text-gray-900 dark:text-white">
								{agentBlocksWithCustomSubset}
							</p>
						</div>
					</div>
				</summary>

				<form
					method="POST"
					action="?/updateAgentPolicy"
					use:enhance={() => {
						return async ({ result, update }) => {
							await update();
							if (result.type === 'success') {
								isAgentPolicyDirty = false;
								agentPolicySaved = true;
							}
						};
					}}
					class="mt-5 space-y-5"
				>
					<input
						type="hidden"
						name="selectedToolIdsJson"
						value={JSON.stringify(agentPolicyMode === 'all' ? [] : selectedAllowedAgentToolIds)}
					/>

					<div class="grid gap-4 lg:grid-cols-2">
						<button
							type="button"
							class={`rounded-2xl border px-4 py-4 text-left transition ${
								agentPolicyMode === 'all'
									? 'border-primary-300 bg-primary-50 text-primary-900 dark:border-primary-900/40 dark:bg-primary-950/20 dark:text-primary-100'
									: 'border-gray-200 hover:bg-gray-50 dark:border-gray-800 dark:hover:bg-gray-950/30'
							}`}
							onclick={() => setAgentPolicyMode('all')}
						>
							<p class="text-sm font-semibold">Catálogo lesson-safe completo</p>
							<p class="mt-1 text-sm opacity-80">
								Todos los bloques IA en modo agente podrán usar cualquier tool clasificada como
								segura para lessons.
							</p>
						</button>
						<button
							type="button"
							class={`rounded-2xl border px-4 py-4 text-left transition ${
								agentPolicyMode === 'custom'
									? 'border-primary-300 bg-primary-50 text-primary-900 dark:border-primary-900/40 dark:bg-primary-950/20 dark:text-primary-100'
									: 'border-gray-200 hover:bg-gray-50 dark:border-gray-800 dark:hover:bg-gray-950/30'
							}`}
							onclick={() => setAgentPolicyMode('custom')}
						>
							<p class="text-sm font-semibold">Allowlist curada</p>
							<p class="mt-1 text-sm opacity-80">
								Restringe la lesson a un conjunto concreto de tools y deja que cada bloque IA
								trabaje solo dentro de ese alcance.
							</p>
						</button>
					</div>

					{#if agentPolicyMode === 'custom'}
						<div class="rounded-2xl border border-gray-200 p-4 dark:border-gray-800">
							<div class="mb-4">
								<h3 class="text-base font-semibold text-gray-900 dark:text-white">
									Catálogo permitido para esta lesson
								</h3>
								<p class="mt-1 text-sm text-gray-500 dark:text-gray-400">
									La selección se organiza por intención pedagógica para que el alcance global sea
									más fácil de revisar.
								</p>
							</div>

							<LessonAgentToolCatalog
								tools={data.lessonAgentTools}
								selectedToolIds={selectedAllowedAgentToolIds}
								onToggle={toggleAllowedAgentTool}
								compact={true}
								initiallyOpenGroupIds={['evaluation_interaction']}
							/>
						</div>
					{:else}
						<div
							class="rounded-2xl border border-emerald-200 bg-emerald-50/80 px-4 py-4 text-sm text-emerald-900 dark:border-emerald-900/40 dark:bg-emerald-950/20 dark:text-emerald-100"
						>
							La lesson hereda el catálogo lesson-safe completo. Si algún bloque necesita menos
							capacidades, el recorte se hace en su editor profundo.
						</div>
					{/if}

					<div class="rounded-2xl border border-gray-200 p-4 dark:border-gray-800">
						<h3 class="text-base font-semibold text-gray-900 dark:text-white">Resumen de uso</h3>
						<div class="mt-4 grid gap-3 sm:grid-cols-3">
							<div class="rounded-2xl bg-gray-50 px-4 py-3 dark:bg-gray-950/40">
								<p class="text-xs tracking-[0.16em] text-gray-500 uppercase dark:text-gray-400">
									Bloques IA
								</p>
								<p class="mt-1 text-2xl font-semibold text-gray-900 dark:text-white">
									{agentBlocks.length}
								</p>
							</div>
							<div class="rounded-2xl bg-gray-50 px-4 py-3 dark:bg-gray-950/40">
								<p class="text-xs tracking-[0.16em] text-gray-500 uppercase dark:text-gray-400">
									Modo agente
								</p>
								<p class="mt-1 text-2xl font-semibold text-gray-900 dark:text-white">
									{agentBlocksInAgentRuntime}
								</p>
							</div>
							<div class="rounded-2xl bg-gray-50 px-4 py-3 dark:bg-gray-950/40">
								<p class="text-xs tracking-[0.16em] text-gray-500 uppercase dark:text-gray-400">
									Allowlist propia
								</p>
								<p class="mt-1 text-2xl font-semibold text-gray-900 dark:text-white">
									{agentBlocksWithCustomSubset}
								</p>
							</div>
						</div>
					</div>

					<div class="flex items-center justify-between gap-4">
						<div>
							{#if isAgentPolicySelectionEmpty}
								<p class="text-sm text-red-700 dark:text-red-300">
									La allowlist curada necesita al menos una tool seleccionada.
								</p>
							{:else if agentPolicySaved}
								<p class="text-sm text-green-700 dark:text-green-300">
									<CheckCircle2 class="mr-1 inline h-4 w-4" />
									Política agéntica guardada correctamente.
								</p>
							{:else if isAgentPolicyDirty}
								<p class="text-sm text-amber-700 dark:text-amber-300">
									Hay cambios sin guardar en la política agéntica.
								</p>
							{/if}
						</div>
						<button
							class="bg-primary-600 hover:bg-primary-700 rounded-xl px-4 py-2.5 text-sm font-medium text-white disabled:cursor-not-allowed disabled:opacity-50"
							disabled={isAgentPolicySelectionEmpty}
						>
							Guardar política agéntica
						</button>
					</div>
				</form>
			</details>

			<div
				class="rounded-2xl bg-white p-6 shadow-sm ring-1 ring-gray-200/80 dark:bg-gray-900/40 dark:ring-gray-800"
			>
				<div class="flex flex-col gap-5 lg:flex-row lg:items-start lg:justify-between">
					<div class="max-w-2xl">
						<h2 class="text-lg font-semibold text-gray-900 dark:text-white">
							Estructura de la lesson
						</h2>
						<p class="mt-1 text-sm text-gray-500 dark:text-gray-400">
							El grafo, la entrada y las conexiones se editan desde el editor visual.
						</p>
					</div>

					<a
						href={resolve(`/course/${cid}/admin/interactives/${ilid}/lessonedit/flow`)}
						class="bg-primary-600 hover:bg-primary-700 inline-flex items-center justify-center rounded-xl px-4 py-2.5 text-sm font-semibold text-white shadow-sm"
					>
						<Route class="mr-2 h-4 w-4" />
						Abrir editor visual
					</a>
				</div>

				<div class="mt-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
					<div class="rounded-2xl border border-gray-200 px-4 py-4 dark:border-gray-800">
						<p class="text-xs tracking-[0.16em] text-gray-500 uppercase dark:text-gray-400">
							Bloques
						</p>
						<p class="mt-1 text-2xl font-semibold text-gray-900 dark:text-white">
							{data.definition.blocks.length}
						</p>
					</div>
					<div class="rounded-2xl border border-gray-200 px-4 py-4 dark:border-gray-800">
						<p class="text-xs tracking-[0.16em] text-gray-500 uppercase dark:text-gray-400">
							Conexiones
						</p>
						<p class="mt-1 text-2xl font-semibold text-gray-900 dark:text-white">
							{totalFlowConnections}
						</p>
					</div>
					<div class="rounded-2xl border border-gray-200 px-4 py-4 dark:border-gray-800">
						<p class="text-xs tracking-[0.16em] text-gray-500 uppercase dark:text-gray-400">
							Bloques IA
						</p>
						<p class="mt-1 text-2xl font-semibold text-gray-900 dark:text-white">
							{agentBlocks.length}
						</p>
					</div>
					<div class="rounded-2xl border border-gray-200 px-4 py-4 dark:border-gray-800">
						<p class="text-xs tracking-[0.16em] text-gray-500 uppercase dark:text-gray-400">
							Entrada
						</p>
						<p class="mt-1 truncate text-sm font-semibold text-gray-900 dark:text-white">
							{entryBlock?.title ?? data.definition.entryBlockId}
						</p>
					</div>
				</div>

				{#if data.definition.blocks.length === 0}
					<div
						class="mt-5 flex flex-col gap-3 rounded-2xl border border-amber-200 bg-amber-50/80 px-4 py-4 text-sm text-amber-900 sm:flex-row sm:items-center sm:justify-between dark:border-amber-900/40 dark:bg-amber-950/20 dark:text-amber-100"
					>
						<span>La lesson todavía no tiene estructura.</span>
						<a
							href={resolve(`/course/${cid}/admin/interactives/${ilid}/lessonedit/flow`)}
							class="inline-flex items-center justify-center rounded-xl bg-amber-500 px-3 py-2 text-sm font-semibold text-white hover:bg-amber-600"
						>
							Crear estructura
							<ArrowRight class="ml-2 h-4 w-4" />
						</a>
					</div>
				{/if}
			</div>
		</div>

		<div class="space-y-4">
			<details
				class="rounded-2xl bg-white p-6 shadow-sm ring-1 ring-gray-200/80 dark:bg-gray-900/40 dark:ring-gray-800"
			>
				<summary
					class="flex cursor-pointer list-none items-center justify-between gap-3 marker:hidden"
				>
					<div class="flex min-w-0 items-center gap-3">
						<div
							class="rounded-2xl bg-sky-100 p-3 text-sky-700 dark:bg-sky-950/30 dark:text-sky-300"
						>
							<Paperclip class="h-5 w-5" />
						</div>
						<div>
							<h2 class="text-lg font-semibold text-gray-900 dark:text-white">Recursos</h2>
							<p class="text-sm text-gray-500 dark:text-gray-400">
								Las subidas manuales viven en su propia página.
							</p>
						</div>
					</div>
					<span
						class="rounded-full bg-gray-100 px-3 py-1 text-xs font-medium text-gray-700 dark:bg-gray-800 dark:text-gray-200"
					>
						{resourcesCount} recurso{resourcesCount === 1 ? '' : 's'}
					</span>
				</summary>

				<p class="text-sm leading-6 text-gray-600 dark:text-gray-300">
					Ahora la portada solo muestra el resumen de recursos. La gestión completa de imágenes y
					documentos se hace en una vista separada para no mezclar authoring de contenido con
					storage.
				</p>

				<div
					class="mt-5 flex items-center justify-between rounded-2xl border border-gray-200 px-4 py-4 dark:border-gray-800"
				>
					<div>
						<p class="text-xs tracking-[0.16em] text-gray-500 uppercase dark:text-gray-400">
							Recursos disponibles
						</p>
						<p class="mt-1 text-2xl font-semibold text-gray-900 dark:text-white">
							{resourcesCount}
						</p>
					</div>
					<a
						href={resolve(`/course/${cid}/admin/interactives/${ilid}/lessonedit/resources`)}
						class="rounded-xl bg-gray-900 px-4 py-2.5 text-sm font-medium text-white hover:bg-gray-800 dark:bg-white dark:text-gray-900 dark:hover:bg-gray-100"
					>
						Abrir recursos
						<ArrowRight class="ml-1 inline h-4 w-4" />
					</a>
				</div>
			</details>
		</div>
	</div>
</div>
