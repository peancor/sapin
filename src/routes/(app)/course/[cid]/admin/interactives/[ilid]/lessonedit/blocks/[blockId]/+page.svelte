<script lang="ts">
	import type { PageProps } from './$types';
	import { deserialize } from '$app/forms';
	import { page } from '$app/state';
	import { resolve } from '$app/paths';
	import { breadcrumb } from '$lib/stores/breadcrumb';
	import RichTextEditor from '$lib/components/RichTextEditor.svelte';
	import {
		getLessonCheckModeLabel,
		normalizeLessonAgentConfig,
		normalizeLessonCheckConfig,
		type LessonAgentExecutionTrigger,
		type LessonAgentInteractionMode,
		type LessonAssetRef,
		type LessonBlock,
		type LessonCheckMode,
		type LessonTransition
	} from '$lib/types/lesson';
	import {
		ArrowRight,
		BookOpenText,
		Bot,
		CircleCheck,
		Flag,
		GitBranch,
		ListChecks,
		MoveLeft,
		Paperclip,
		Plus,
		Route,
		Save,
		Sparkles,
		Trash2
	} from 'lucide-svelte';

	type InlineUploadResult = {
		id: string;
		name: string;
		path: string;
		markdown: string;
	};

	let { data, form }: PageProps = $props();

	const getInitialBlock = () => {
		const block = structuredClone(data.block) as LessonBlock;
		if (block.kind === 'agent') {
			block.agentConfig = normalizeLessonAgentConfig(block.agentConfig);
			if (block.agentConfig.interactionMode === 'none') {
				block.requiresResponse = false;
			}
		}
		if (block.kind === 'check') {
			block.checkConfig = normalizeLessonCheckConfig(block.checkConfig);
		}
		return block;
	};
	const getActivityName = () => data.activity.name;

	let workingBlock = $state(getInitialBlock());
	let isDirty = $state(false);
	let isUploadingInlineImage = $state(false);
	let inlineImageError = $state('');

	const cid = $derived(page.params.cid);
	const ilid = $derived(page.params.ilid);
	const HeaderIcon = $derived(blockKindIcon(workingBlock));
	const serializedBlock = $derived(JSON.stringify(workingBlock));
	const availableBlockIds = $derived(
		data.definition.blocks.map((block) => (block.id === data.block.id ? workingBlock.id : block.id))
	);
	const sessionVariables = $derived(
		data.availableVariables.filter((variable) => variable.source === 'session')
	);
	const referenceGroups = $derived(data.availableReferenceGroups.byBlock);
	const currentGraphSummary = $derived(data.graphSummary);
	const currentBlockContract = $derived(data.graphSummary.contracts);
	const availableModels = $derived(data.models);
	const conditionOperators = [
		'equals',
		'not_equals',
		'contains',
		'exists',
		'not_exists',
		'gt',
		'gte',
		'lt',
		'lte'
	] as const;
	const checkModes: Array<{ value: LessonCheckMode; label: string }> = [
		{ value: 'single_choice', label: 'Opción única' },
		{ value: 'multiple_choice', label: 'Respuesta múltiple' },
		{ value: 'true_false', label: 'Verdadero/Falso' },
		{ value: 'numeric', label: 'Numérico' },
		{ value: 'short_text', label: 'Texto corto' }
	];
	const checkTextMatchModes = [
		{ value: 'exact', label: 'Coincidencia exacta' },
		{ value: 'contains', label: 'Contiene' },
		{ value: 'regex', label: 'Regex' }
	] as const;

	function markDirty() {
		isDirty = true;
	}

	function getValidExecutionTriggers(
		interactionMode: LessonAgentInteractionMode
	): Array<{ value: LessonAgentExecutionTrigger; label: string }> {
		return interactionMode === 'none'
			? [{ value: 'on_enter', label: 'Al entrar en el bloque' }]
			: [{ value: 'on_user_submit', label: 'Cuando el alumno envía su respuesta' }];
	}

	function updateAgentInteractionMode(interactionMode: LessonAgentInteractionMode) {
		if (workingBlock.kind !== 'agent') return;
		const previousInteractionMode = workingBlock.agentConfig.interactionMode;
		workingBlock.agentConfig.interactionMode = interactionMode;
		workingBlock.agentConfig.executionTrigger =
			interactionMode === 'none' ? 'on_enter' : 'on_user_submit';

		if (interactionMode === 'none') {
			workingBlock.agentConfig.autoStartOnEnter = true;
			workingBlock.requiresResponse = false;
		} else if (workingBlock.requiresResponse === undefined || previousInteractionMode === 'none') {
			workingBlock.requiresResponse = true;
		}

		markDirty();
	}

	function applyAgentPreset(
		preset: 'feedback' | 'generated_content' | 'summary'
	) {
		if (workingBlock.kind !== 'agent') return;

		if (preset === 'feedback') {
			workingBlock.agentConfig.interactionMode = 'none';
			workingBlock.agentConfig.executionTrigger = 'on_enter';
			workingBlock.agentConfig.autoStartOnEnter = true;
			workingBlock.requiresResponse = false;
			workingBlock.agentConfig.promptTemplate =
				'Actúa como tutor académico. Analiza el trabajo previo del estudiante y genera feedback claro, específico y accionable.';
			workingBlock.agentConfig.systemPrompt =
				'Tu respuesta debe ser pedagógica, precisa, alentadora y orientada a mejora.';
			workingBlock.agentConfig.launchMessageTemplate =
				'Genera feedback académico usando el historial completo de la sesión y las salidas de bloques anteriores.';
			workingBlock.agentConfig.initialAssistantMessage = '';
		}

		if (preset === 'generated_content') {
			workingBlock.agentConfig.interactionMode = 'none';
			workingBlock.agentConfig.executionTrigger = 'on_enter';
			workingBlock.agentConfig.autoStartOnEnter = true;
			workingBlock.requiresResponse = false;
			workingBlock.agentConfig.promptTemplate =
				'Genera contenido breve y bien estructurado adaptado al progreso del estudiante y al contexto previo de la lesson.';
			workingBlock.agentConfig.systemPrompt =
				'Prioriza claridad docente, estructura y rigor académico.';
			workingBlock.agentConfig.launchMessageTemplate =
				'Produce el contenido que debe mostrarse ahora, apoyándote en la información reunida en bloques anteriores.';
			workingBlock.agentConfig.initialAssistantMessage = '';
		}

		if (preset === 'summary') {
			workingBlock.agentConfig.interactionMode = 'single_turn';
			workingBlock.agentConfig.executionTrigger = 'on_user_submit';
			workingBlock.agentConfig.autoStartOnEnter = true;
			workingBlock.requiresResponse = true;
			workingBlock.agentConfig.promptTemplate =
				'Pide al estudiante una síntesis y después genera una respuesta breve que valide, corrija y complete sus ideas.';
			workingBlock.agentConfig.systemPrompt =
				'Responde como tutor académico, ayudando a sintetizar y afinar conceptos clave.';
			workingBlock.agentConfig.initialAssistantMessage = '';
			workingBlock.agentConfig.launchMessageTemplate =
				'Abre el bloque con una pregunta breve que pida al alumno una síntesis de lo aprendido hasta ahora.';
		}

		markDirty();
	}

	function updateCheckMode(mode: LessonCheckMode) {
		if (workingBlock.kind !== 'check') return;
		workingBlock.checkConfig = normalizeLessonCheckConfig({
			...workingBlock.checkConfig,
			mode
		});
		markDirty();
	}

	function addCheckOption() {
		if (workingBlock.kind !== 'check') return;
		const optionNumber = workingBlock.checkConfig.options.length + 1;
		workingBlock.checkConfig.options = [
			...workingBlock.checkConfig.options,
			{
				id: `option_${optionNumber}`,
				label: `Opción ${optionNumber}`,
				value: `option_${optionNumber}`,
				description: ''
			}
		];
		if (workingBlock.checkConfig.correctOptionIds.length === 0) {
			workingBlock.checkConfig.correctOptionIds = [`option_${optionNumber}`];
		}
		markDirty();
	}

	function removeCheckOption(index: number) {
		if (workingBlock.kind !== 'check') return;
		const removedOptionId = workingBlock.checkConfig.options[index]?.id;
		workingBlock.checkConfig.options = workingBlock.checkConfig.options.filter(
			(_, optionIndex) => optionIndex !== index
		);
		if (removedOptionId) {
			workingBlock.checkConfig.correctOptionIds = workingBlock.checkConfig.correctOptionIds.filter(
				(optionId) => optionId !== removedOptionId
			);
		}
		markDirty();
	}

	function applyCheckPreset(mode: LessonCheckMode) {
		if (workingBlock.kind !== 'check') return;
		workingBlock.checkConfig = normalizeLessonCheckConfig({
			mode,
			options:
				mode === 'single_choice'
					? [
							{ id: 'option_1', label: 'Opción 1', value: 'option_1', description: '' },
							{ id: 'option_2', label: 'Opción 2', value: 'option_2', description: '' }
						]
					: mode === 'multiple_choice'
						? [
								{ id: 'option_1', label: 'Opción 1', value: 'option_1', description: '' },
								{ id: 'option_2', label: 'Opción 2', value: 'option_2', description: '' },
								{ id: 'option_3', label: 'Opción 3', value: 'option_3', description: '' }
							]
						: undefined,
			correctOptionIds:
				mode === 'single_choice'
					? ['option_1']
					: mode === 'multiple_choice'
						? ['option_1', 'option_2']
						: undefined,
			acceptedExact: mode === 'numeric' ? 10 : null,
			tolerance: mode === 'numeric' ? 0 : null,
			acceptedAnswers: mode === 'short_text' ? ['respuesta esperada'] : [],
			matchMode: mode === 'short_text' ? 'exact' : undefined
		});
		markDirty();
	}

	function blockKindLabel(block: LessonBlock) {
		if (block.kind === 'content') return 'Contenido';
		if (block.kind === 'choice') return 'Decisión';
		if (block.kind === 'check') return 'Evaluación';
		if (block.kind === 'agent') return 'IA';
		return 'Final';
	}

	function blockKindIcon(block: LessonBlock) {
		if (block.kind === 'content') return BookOpenText;
		if (block.kind === 'choice') return ListChecks;
		if (block.kind === 'check') return CircleCheck;
		if (block.kind === 'agent') return Bot;
		return Flag;
	}

	function blockLabel(blockId: string) {
		return data.definition.blocks.find((block) => block.id === blockId)?.title ?? blockId;
	}

	function addBranch() {
		if (
			workingBlock.kind !== 'content' &&
			workingBlock.kind !== 'check' &&
			workingBlock.kind !== 'agent'
		)
			return;
		const nextBranch: LessonTransition = {
			label: 'Nueva rama',
			targetBlockId: data.definition.entryBlockId,
			condition: {
				source: 'session.attemptNumber',
				operator: 'equals',
				value: 1
			}
		};
		workingBlock.branches = [...(workingBlock.branches ?? []), nextBranch];
		markDirty();
	}

	function removeBranch(index: number) {
		if (
			workingBlock.kind !== 'content' &&
			workingBlock.kind !== 'check' &&
			workingBlock.kind !== 'agent'
		)
			return;
		workingBlock.branches = (workingBlock.branches ?? []).filter(
			(_, branchIndex) => branchIndex !== index
		);
		markDirty();
	}

	function ensureBranchCondition(branch: LessonTransition) {
		branch.condition ??= {
			source: 'session.attemptNumber',
			operator: 'equals',
			value: 1
		};
		return branch.condition;
	}

	function addChoiceOption() {
		if (workingBlock.kind !== 'choice') return;
		workingBlock.options = [
			...workingBlock.options,
			{
				id: `option_${workingBlock.options.length + 1}`,
				label: `Opción ${workingBlock.options.length + 1}`,
				value: `option_${workingBlock.options.length + 1}`,
				description: '',
				targetBlockId: data.definition.entryBlockId
			}
		];
		markDirty();
	}

	function updateCheckCorrectOption(optionId: string, checked: boolean) {
		if (workingBlock.kind !== 'check') return;
		if (workingBlock.checkConfig.mode === 'multiple_choice') {
			workingBlock.checkConfig.correctOptionIds = checked
				? [...workingBlock.checkConfig.correctOptionIds, optionId]
				: workingBlock.checkConfig.correctOptionIds.filter((id) => id !== optionId);
		} else {
			workingBlock.checkConfig.correctOptionIds = checked ? [optionId] : [];
		}
		markDirty();
	}

	function removeChoiceOption(index: number) {
		if (workingBlock.kind !== 'choice') return;
		workingBlock.options = workingBlock.options.filter((_, optionIndex) => optionIndex !== index);
		markDirty();
	}

	function addOutputField() {
		if (workingBlock.kind !== 'agent') return;
		workingBlock.agentConfig.outputSchema = [
			...(workingBlock.agentConfig.outputSchema ?? []),
			{
				key: `field_${(workingBlock.agentConfig.outputSchema?.length ?? 0) + 1}`,
				type: 'string',
				description: ''
			}
		];
		markDirty();
	}

	function removeOutputField(index: number) {
		if (workingBlock.kind !== 'agent') return;
		workingBlock.agentConfig.outputSchema = (workingBlock.agentConfig.outputSchema ?? []).filter(
			(_, fieldIndex) => fieldIndex !== index
		);
		markDirty();
	}

	function toggleAsset(fileId: string, checked: boolean) {
		if (workingBlock.kind !== 'content') return;
		const currentAssets = workingBlock.assetRefs ?? [];
		workingBlock.assetRefs = checked
			? [...currentAssets, { fileId }]
			: currentAssets.filter((asset) => asset.fileId !== fileId);
		markDirty();
	}

	function updateAssetMeta(index: number, changes: Partial<LessonAssetRef>) {
		if (workingBlock.kind !== 'content') return;
		const nextAssets = [...(workingBlock.assetRefs ?? [])];
		nextAssets[index] = { ...nextAssets[index], ...changes };
		workingBlock.assetRefs = nextAssets;
		markDirty();
	}

	async function uploadInlineImage(file: File): Promise<InlineUploadResult> {
		isUploadingInlineImage = true;
		inlineImageError = '';

		try {
			const formData = new FormData();
			formData.append('file', file);
			const response = await fetch('?/uploadInlineImage', {
				method: 'POST',
				headers: { 'x-sveltekit-action': 'true' },
				body: formData
			});
			const result = deserialize(await response.text());

			if (result.type === 'success') {
				return result.data as InlineUploadResult;
			}

			if (result.type === 'failure') {
				throw new Error(
					(result.data as { error?: string } | null)?.error || 'No se pudo subir la imagen.'
				);
			}

			throw new Error('La subida inline devolvió una respuesta inesperada.');
		} catch (errorValue) {
			inlineImageError =
				errorValue instanceof Error ? errorValue.message : 'No se pudo subir la imagen.';
			throw errorValue;
		} finally {
			isUploadingInlineImage = false;
		}
	}

	$effect(() => {
		breadcrumb.set([
			{ label: 'Inicio', href: '/' },
			{ label: 'Cursos', href: '/course' },
			{ label: 'Curso', href: `/course/${page.params.cid}` },
			{ label: 'Interactivos', href: `/course/${page.params.cid}/admin/interactives` },
			{
				label: getActivityName(),
				href: `/course/${page.params.cid}/admin/interactives/${page.params.ilid}`
			},
			{
				label: 'Editor lesson',
				href: `/course/${page.params.cid}/admin/interactives/${page.params.ilid}/lessonedit`
			},
			{ label: workingBlock.title }
		]);
	});
</script>

<div class="space-y-6">
	<div class="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
		<div>
			<div class="mb-3 flex items-center gap-3">
				<div
					class="rounded-2xl bg-amber-100 p-3 text-amber-700 dark:bg-amber-950/30 dark:text-amber-300"
				>
					<HeaderIcon class="h-5 w-5" />
				</div>
				<div>
					<p class="text-sm tracking-[0.18em] text-gray-500 uppercase dark:text-gray-400">
						{blockKindLabel(workingBlock)}
					</p>
					<h1 class="text-2xl font-semibold text-gray-900 dark:text-white">{workingBlock.title}</h1>
				</div>
			</div>
			<p class="max-w-3xl text-sm leading-6 text-gray-600 dark:text-gray-300">
				Esta página edita un único bloque. El guardado es explícito y solo persiste el bloque mutado
				dentro de la definición completa de la lesson.
			</p>
		</div>

		<div class="flex flex-wrap gap-2">
			<a
				href={resolve(`/course/${cid}/admin/interactives/${ilid}/lessonedit`)}
				class="rounded-xl border border-gray-300 px-4 py-2.5 text-sm font-medium text-gray-700 hover:bg-gray-50 dark:border-gray-700 dark:text-gray-200 dark:hover:bg-gray-800"
			>
				<MoveLeft class="mr-1 inline h-4 w-4" />
				Volver a la portada
			</a>
			<a
				href={resolve(`/course/${cid}/admin/interactives/${ilid}/lessonedit/flow`)}
				class="border-primary-200 bg-primary-50 text-primary-700 hover:bg-primary-100 dark:border-primary-900/40 dark:bg-primary-950/20 dark:text-primary-300 dark:hover:bg-primary-950/30 rounded-xl border px-4 py-2.5 text-sm font-medium"
			>
				<Route class="mr-1 inline h-4 w-4" />
				Editor visual
			</a>
			<a
				href={resolve(`/course/${cid}/admin/interactives/${ilid}/lessonedit/resources`)}
				class="rounded-xl border border-gray-300 px-4 py-2.5 text-sm font-medium text-gray-700 hover:bg-gray-50 dark:border-gray-700 dark:text-gray-200 dark:hover:bg-gray-800"
			>
				<Paperclip class="mr-1 inline h-4 w-4" />
				Recursos
			</a>
		</div>
	</div>

	{#if form?.error}
		<div
			class="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800 dark:border-red-900/40 dark:bg-red-950/20 dark:text-red-200"
		>
			{form.error}
		</div>
	{/if}

	<div class="grid gap-6 xl:grid-cols-[minmax(0,1.55fr)_minmax(320px,0.85fr)]">
		<form
			method="POST"
			action="?/saveBlock"
			class="space-y-6 rounded-2xl bg-white p-6 shadow-sm ring-1 ring-gray-200/80 dark:bg-gray-900/40 dark:ring-gray-800"
		>
			<input type="hidden" name="blockJson" value={serializedBlock} />

			<div class="grid gap-4 md:grid-cols-[minmax(0,1fr)_minmax(0,1.2fr)]">
				<label class="block">
					<span class="mb-2 block text-sm font-medium text-gray-700 dark:text-gray-300"
						>ID técnico</span
					>
					<input
						class="w-full rounded-xl border border-gray-300 bg-white px-3 py-2.5 font-mono text-sm dark:border-gray-700 dark:bg-gray-950 dark:text-white"
						bind:value={workingBlock.id}
						oninput={markDirty}
					/>
				</label>

				<label class="block">
					<span class="mb-2 block text-sm font-medium text-gray-700 dark:text-gray-300">Título</span
					>
					<input
						class="w-full rounded-xl border border-gray-300 bg-white px-3 py-2.5 text-sm dark:border-gray-700 dark:bg-gray-950 dark:text-white"
						bind:value={workingBlock.title}
						oninput={markDirty}
					/>
				</label>
			</div>

			<div
				class="rounded-2xl border border-gray-200 px-4 py-3 text-sm text-gray-600 dark:border-gray-800 dark:text-gray-300"
			>
				<Sparkles class="mr-2 inline h-4 w-4 text-amber-600 dark:text-amber-300" />
				Tipo del bloque:
				<strong class="text-gray-900 dark:text-white">{blockKindLabel(workingBlock)}</strong>. Si
				necesitas cambiarlo, crea un bloque nuevo del tipo correcto y elimina este cuando ya no esté
				referenciado.
			</div>

			{#if workingBlock.kind === 'content'}
				<div class="space-y-4">
					<div>
						<h2 class="text-lg font-semibold text-gray-900 dark:text-white">Contenido</h2>
						<p class="text-sm text-gray-500 dark:text-gray-400">
							Editor WYSIWYG sobre Markdown. Puedes pegar o soltar imágenes y se subirán
							automáticamente como recursos globales de la lesson.
						</p>
					</div>

					<RichTextEditor
						value={workingBlock.body}
						placeholder="Escribe aquí el contenido del bloque..."
						rows={12}
						enableImagePaste={true}
						uploadImage={uploadInlineImage}
						onchange={(value) => {
							workingBlock.body = value;
							markDirty();
						}}
					/>

					{#if isUploadingInlineImage}
						<p class="text-sm text-sky-700 dark:text-sky-300">Subiendo imagen inline...</p>
					{/if}
					{#if inlineImageError}
						<p class="text-sm text-red-700 dark:text-red-300">{inlineImageError}</p>
					{/if}

					<div class="grid gap-4 md:grid-cols-2">
						<label class="block">
							<span class="mb-2 block text-sm font-medium text-gray-700 dark:text-gray-300"
								>Texto del botón</span
							>
							<input
								class="w-full rounded-xl border border-gray-300 bg-white px-3 py-2.5 text-sm dark:border-gray-700 dark:bg-gray-950 dark:text-white"
								bind:value={workingBlock.continueLabel}
								oninput={markDirty}
							/>
						</label>

						<label class="block">
							<span class="mb-2 block text-sm font-medium text-gray-700 dark:text-gray-300"
								>Siguiente bloque por defecto</span
							>
							<select
								class="w-full rounded-xl border border-gray-300 bg-white px-3 py-2.5 text-sm dark:border-gray-700 dark:bg-gray-950 dark:text-white"
								bind:value={workingBlock.next}
								onchange={markDirty}
							>
								{#each availableBlockIds as blockId (blockId)}
									<option value={blockId}>{blockId}</option>
								{/each}
							</select>
						</label>
					</div>

					<div class="space-y-4 rounded-2xl border border-gray-200 p-4 dark:border-gray-800">
						<div class="flex flex-wrap items-center justify-between gap-3">
							<div>
								<h3 class="text-base font-semibold text-gray-900 dark:text-white">
									Recursos externos del bloque
								</h3>
								<p class="text-sm text-gray-500 dark:text-gray-400">
									Los recursos inline pegados en el editor no aparecen aquí. Esta lista es para
									adjuntos adicionales del bloque.
								</p>
							</div>
							<a
								href={resolve(`/course/${cid}/admin/interactives/${ilid}/lessonedit/resources`)}
								class="rounded-xl border border-gray-300 px-3 py-2 text-sm text-gray-700 hover:bg-gray-50 dark:border-gray-700 dark:text-gray-200 dark:hover:bg-gray-800"
							>
								Ir a recursos
								<ArrowRight class="ml-1 inline h-4 w-4" />
							</a>
						</div>

						{#if data.files.length === 0}
							<p class="text-sm text-gray-500 dark:text-gray-400">
								Aún no hay recursos manuales en esta lesson.
							</p>
						{:else}
							<div class="space-y-3">
								{#each data.files as file (file.id)}
									{@const currentIndex = (workingBlock.assetRefs ?? []).findIndex(
										(asset) => asset.fileId === file.id
									)}
									<div class="rounded-2xl border border-gray-200 p-4 dark:border-gray-800">
										<label class="flex items-start gap-3">
											<input
												type="checkbox"
												class="text-primary-600 mt-1 h-4 w-4 rounded border-gray-300"
												checked={currentIndex >= 0}
												onchange={(event) =>
													toggleAsset(file.id, (event.currentTarget as HTMLInputElement).checked)}
											/>
											<div class="min-w-0">
												<p class="font-medium text-gray-900 dark:text-white">{file.name}</p>
												<p class="text-xs text-gray-500 dark:text-gray-400">{file.mimeType}</p>
											</div>
										</label>

										{#if currentIndex >= 0}
											<div class="mt-3 grid gap-3 md:grid-cols-2">
												<label class="block">
													<span
														class="mb-1 block text-xs font-medium tracking-[0.14em] text-gray-500 uppercase"
														>Tipo</span
													>
													<select
														class="w-full rounded-xl border border-gray-300 bg-white px-3 py-2 text-sm dark:border-gray-700 dark:bg-gray-950 dark:text-white"
														bind:value={workingBlock.assetRefs![currentIndex].kind}
														onchange={markDirty}
													>
														<option value="">Detectar automáticamente</option>
														<option value="image">Imagen</option>
														<option value="video">Vídeo</option>
														<option value="audio">Audio</option>
														<option value="file">Archivo</option>
													</select>
												</label>
												<label class="block">
													<span
														class="mb-1 block text-xs font-medium tracking-[0.14em] text-gray-500 uppercase"
														>Caption</span
													>
													<input
														class="w-full rounded-xl border border-gray-300 bg-white px-3 py-2 text-sm dark:border-gray-700 dark:bg-gray-950 dark:text-white"
														value={workingBlock.assetRefs?.[currentIndex]?.caption ?? ''}
														oninput={(event) =>
															updateAssetMeta(currentIndex, {
																caption: (event.currentTarget as HTMLInputElement).value
															})}
													/>
												</label>
											</div>
										{/if}
									</div>
								{/each}
							</div>
						{/if}
					</div>
				</div>
			{:else if workingBlock.kind === 'choice'}
				<div class="space-y-5">
					<label class="block">
						<span class="mb-2 block text-sm font-medium text-gray-700 dark:text-gray-300"
							>Introducción opcional</span
						>
						<textarea
							class="min-h-28 w-full rounded-xl border border-gray-300 bg-white px-3 py-2.5 text-sm dark:border-gray-700 dark:bg-gray-950 dark:text-white"
							bind:value={workingBlock.body}
							oninput={markDirty}
						></textarea>
					</label>

					<label class="block">
						<span class="mb-2 block text-sm font-medium text-gray-700 dark:text-gray-300"
							>Clave de salida</span
						>
						<input
							class="w-full rounded-xl border border-gray-300 bg-white px-3 py-2.5 font-mono text-sm dark:border-gray-700 dark:bg-gray-950 dark:text-white"
							bind:value={workingBlock.outputKey}
							oninput={markDirty}
						/>
					</label>

					<div class="space-y-3">
						<div class="flex flex-wrap items-center justify-between gap-3">
							<div>
								<h2 class="text-lg font-semibold text-gray-900 dark:text-white">Opciones</h2>
								<p class="text-sm text-gray-500 dark:text-gray-400">
									Cada opción necesita un destino explícito.
								</p>
							</div>
							<button
								type="button"
								class="rounded-xl border border-gray-300 px-3 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 dark:border-gray-700 dark:text-gray-200 dark:hover:bg-gray-800"
								onclick={addChoiceOption}
							>
								<Plus class="mr-1 inline h-4 w-4" />
								Añadir opción
							</button>
						</div>

						{#each workingBlock.options as option, optionIndex (option.id)}
							<div class="rounded-2xl border border-gray-200 p-4 dark:border-gray-800">
								<div class="grid gap-3 md:grid-cols-2">
									<label class="block">
										<span
											class="mb-1 block text-xs font-medium tracking-[0.14em] text-gray-500 uppercase"
											>ID</span
										>
										<input
											class="w-full rounded-xl border border-gray-300 bg-white px-3 py-2 font-mono text-sm dark:border-gray-700 dark:bg-gray-950 dark:text-white"
											bind:value={option.id}
											oninput={markDirty}
										/>
									</label>

									<label class="block">
										<span
											class="mb-1 block text-xs font-medium tracking-[0.14em] text-gray-500 uppercase"
											>Etiqueta</span
										>
										<input
											class="w-full rounded-xl border border-gray-300 bg-white px-3 py-2 text-sm dark:border-gray-700 dark:bg-gray-950 dark:text-white"
											bind:value={option.label}
											oninput={markDirty}
										/>
									</label>

									<label class="block">
										<span
											class="mb-1 block text-xs font-medium tracking-[0.14em] text-gray-500 uppercase"
											>Valor</span
										>
										<input
											class="w-full rounded-xl border border-gray-300 bg-white px-3 py-2 font-mono text-sm dark:border-gray-700 dark:bg-gray-950 dark:text-white"
											bind:value={option.value}
											oninput={markDirty}
										/>
									</label>

									<label class="block">
										<span
											class="mb-1 block text-xs font-medium tracking-[0.14em] text-gray-500 uppercase"
											>Destino</span
										>
										<select
											class="w-full rounded-xl border border-gray-300 bg-white px-3 py-2 text-sm dark:border-gray-700 dark:bg-gray-950 dark:text-white"
											bind:value={option.targetBlockId}
											onchange={markDirty}
										>
											{#each availableBlockIds as blockId (blockId)}
												<option value={blockId}>{blockId}</option>
											{/each}
										</select>
									</label>
								</div>

								<label class="mt-3 block">
									<span
										class="mb-1 block text-xs font-medium tracking-[0.14em] text-gray-500 uppercase"
										>Descripción opcional</span
									>
									<textarea
										class="min-h-24 w-full rounded-xl border border-gray-300 bg-white px-3 py-2 text-sm dark:border-gray-700 dark:bg-gray-950 dark:text-white"
										bind:value={option.description}
										oninput={markDirty}
									></textarea>
								</label>

								<div class="mt-3 flex justify-end">
									<button
										type="button"
										class="rounded-xl border border-red-200 px-3 py-2 text-sm text-red-700 hover:bg-red-50 dark:border-red-900/40 dark:text-red-300 dark:hover:bg-red-950/20"
										onclick={() => removeChoiceOption(optionIndex)}
									>
										<Trash2 class="mr-1 inline h-4 w-4" />
										Eliminar opción
									</button>
								</div>
							</div>
						{/each}
					</div>
				</div>
			{:else if workingBlock.kind === 'check'}
				<div class="space-y-5">
					<label class="block">
						<span class="mb-2 block text-sm font-medium text-gray-700 dark:text-gray-300"
							>Introducción del bloque</span
						>
						<textarea
							class="min-h-28 w-full rounded-xl border border-gray-300 bg-white px-3 py-2.5 text-sm dark:border-gray-700 dark:bg-gray-950 dark:text-white"
							bind:value={workingBlock.body}
							oninput={markDirty}
						></textarea>
					</label>

					<div class="rounded-2xl border border-emerald-200 bg-emerald-50/80 p-4 dark:border-emerald-900/40 dark:bg-emerald-950/10">
						<div class="flex flex-wrap items-center justify-between gap-3">
							<div>
								<h2 class="text-base font-semibold text-gray-900 dark:text-white">Presets de evaluación</h2>
								<p class="text-sm text-gray-500 dark:text-gray-400">
									Arranca con una configuración base y afínala después.
								</p>
							</div>
							<div class="flex flex-wrap gap-2">
								{#each checkModes as modeOption (modeOption.value)}
									<button
										type="button"
										class="rounded-xl border border-emerald-300 px-3 py-2 text-sm font-medium text-emerald-800 hover:bg-emerald-100 dark:border-emerald-900/40 dark:text-emerald-200 dark:hover:bg-emerald-950/30"
										onclick={() => applyCheckPreset(modeOption.value)}
									>
										{modeOption.label}
									</button>
								{/each}
							</div>
						</div>
					</div>

					<div class="grid gap-4 md:grid-cols-3">
						<label class="block">
							<span class="mb-2 block text-sm font-medium text-gray-700 dark:text-gray-300">Modo</span>
							<select
								class="w-full rounded-xl border border-gray-300 bg-white px-3 py-2.5 text-sm dark:border-gray-700 dark:bg-gray-950 dark:text-white"
								bind:value={workingBlock.checkConfig.mode}
								onchange={(event) =>
									updateCheckMode((event.currentTarget as HTMLSelectElement).value as LessonCheckMode)}
							>
								{#each checkModes as modeOption (modeOption.value)}
									<option value={modeOption.value}>{modeOption.label}</option>
								{/each}
							</select>
							<p class="mt-2 text-xs text-gray-500 dark:text-gray-400">
								Modo actual: {getLessonCheckModeLabel(workingBlock.checkConfig.mode)}
							</p>
						</label>

						<label class="block">
							<span class="mb-2 block text-sm font-medium text-gray-700 dark:text-gray-300"
								>Máx. intentos</span
							>
							<input
								type="number"
								min="1"
								class="w-full rounded-xl border border-gray-300 bg-white px-3 py-2.5 text-sm dark:border-gray-700 dark:bg-gray-950 dark:text-white"
								value={workingBlock.checkConfig.maxAttempts ?? ''}
								oninput={(event) => {
									const value = (event.currentTarget as HTMLInputElement).value;
									workingBlock.checkConfig.maxAttempts = value ? Number(value) : null;
									markDirty();
								}}
							/>
						</label>

						<label class="block">
							<span class="mb-2 block text-sm font-medium text-gray-700 dark:text-gray-300"
								>Regla de cierre</span
							>
							<select
								class="w-full rounded-xl border border-gray-300 bg-white px-3 py-2.5 text-sm dark:border-gray-700 dark:bg-gray-950 dark:text-white"
								bind:value={workingBlock.checkConfig.completionRule}
								onchange={markDirty}
							>
								<option value="pass_or_exhaust">Aprobar o agotar intentos</option>
								<option value="after_first_submit">Tras el primer envío</option>
							</select>
						</label>
					</div>

					<div class="grid gap-4 md:grid-cols-4">
						<label class="block">
							<span class="mb-2 block text-sm font-medium text-gray-700 dark:text-gray-300"
								>Score de aprobado</span
							>
							<input
								type="number"
								min="0"
								max="1"
								step="0.05"
								class="w-full rounded-xl border border-gray-300 bg-white px-3 py-2.5 text-sm dark:border-gray-700 dark:bg-gray-950 dark:text-white"
								value={workingBlock.checkConfig.passingScore}
								oninput={(event) => {
									workingBlock.checkConfig.passingScore = Number(
										(event.currentTarget as HTMLInputElement).value || '0'
									);
									markDirty();
								}}
							/>
						</label>

						<label class="block">
							<span class="mb-2 block text-sm font-medium text-gray-700 dark:text-gray-300"
								>Botón enviar</span
							>
							<input
								class="w-full rounded-xl border border-gray-300 bg-white px-3 py-2.5 text-sm dark:border-gray-700 dark:bg-gray-950 dark:text-white"
								bind:value={workingBlock.checkConfig.submitLabel}
								oninput={markDirty}
							/>
						</label>

						<label class="block">
							<span class="mb-2 block text-sm font-medium text-gray-700 dark:text-gray-300"
								>Botón reintentar</span
							>
							<input
								class="w-full rounded-xl border border-gray-300 bg-white px-3 py-2.5 text-sm dark:border-gray-700 dark:bg-gray-950 dark:text-white"
								bind:value={workingBlock.checkConfig.retryLabel}
								oninput={markDirty}
							/>
						</label>

						<label class="block">
							<span class="mb-2 block text-sm font-medium text-gray-700 dark:text-gray-300"
								>Botón continuar</span
							>
							<input
								class="w-full rounded-xl border border-gray-300 bg-white px-3 py-2.5 text-sm dark:border-gray-700 dark:bg-gray-950 dark:text-white"
								bind:value={workingBlock.checkConfig.continueLabel}
								oninput={markDirty}
							/>
						</label>
					</div>

					<label
						class="flex items-center gap-3 rounded-2xl border border-gray-200 px-4 py-3 dark:border-gray-800"
					>
						<input
							type="checkbox"
							class="text-primary-600 h-4 w-4 rounded border-gray-300"
							bind:checked={workingBlock.checkConfig.revealCorrectAnswer}
							onchange={markDirty}
						/>
						<div>
							<p class="text-sm font-medium text-gray-900 dark:text-white">Revelar respuesta correcta</p>
							<p class="text-xs text-gray-500 dark:text-gray-400">
								Permite mostrar la solución al alumno tras la corrección.
							</p>
						</div>
					</label>

					{#if workingBlock.checkConfig.mode === 'single_choice' || workingBlock.checkConfig.mode === 'multiple_choice' || workingBlock.checkConfig.mode === 'true_false'}
						<div class="space-y-3 rounded-2xl border border-gray-200 p-4 dark:border-gray-800">
							<div class="flex flex-wrap items-center justify-between gap-3">
								<div>
									<h2 class="text-base font-semibold text-gray-900 dark:text-white">Opciones evaluables</h2>
									<p class="text-sm text-gray-500 dark:text-gray-400">
										Marca las respuestas correctas que debe aceptar el bloque.
									</p>
								</div>
								{#if workingBlock.checkConfig.mode !== 'true_false'}
									<button
										type="button"
										class="rounded-xl border border-gray-300 px-3 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 dark:border-gray-700 dark:text-gray-200 dark:hover:bg-gray-800"
										onclick={addCheckOption}
									>
										<Plus class="mr-1 inline h-4 w-4" />
										Añadir opción
									</button>
								{/if}
							</div>

							{#each workingBlock.checkConfig.options as option, optionIndex (option.id)}
								<div class="rounded-2xl border border-gray-200 p-4 dark:border-gray-800">
									<div class="mb-3 flex items-start justify-between gap-3">
										<label class="flex items-center gap-2 text-sm font-medium text-gray-900 dark:text-white">
											<input
												type={workingBlock.checkConfig.mode === 'multiple_choice' ? 'checkbox' : 'radio'}
												name="correctOption"
												class="text-primary-600 h-4 w-4 border-gray-300"
												checked={workingBlock.checkConfig.correctOptionIds.includes(option.id)}
												onchange={(event) =>
													updateCheckCorrectOption(
														option.id,
														(event.currentTarget as HTMLInputElement).checked
													)}
											/>
											Correcta
										</label>

										{#if workingBlock.checkConfig.mode !== 'true_false'}
											<button
												type="button"
												class="rounded-xl border border-red-200 px-3 py-2 text-sm text-red-700 hover:bg-red-50 dark:border-red-900/40 dark:text-red-300 dark:hover:bg-red-950/20"
												onclick={() => removeCheckOption(optionIndex)}
											>
												<Trash2 class="mr-1 inline h-4 w-4" />
												Eliminar
											</button>
										{/if}
									</div>

									<div class="grid gap-3 md:grid-cols-3">
										<label class="block">
											<span class="mb-1 block text-xs font-medium tracking-[0.14em] text-gray-500 uppercase">ID</span>
											<input
												class="w-full rounded-xl border border-gray-300 bg-white px-3 py-2 font-mono text-sm dark:border-gray-700 dark:bg-gray-950 dark:text-white"
												bind:value={option.id}
												oninput={markDirty}
												disabled={workingBlock.checkConfig.mode === 'true_false'}
											/>
										</label>

										<label class="block">
											<span class="mb-1 block text-xs font-medium tracking-[0.14em] text-gray-500 uppercase">Etiqueta</span>
											<input
												class="w-full rounded-xl border border-gray-300 bg-white px-3 py-2 text-sm dark:border-gray-700 dark:bg-gray-950 dark:text-white"
												bind:value={option.label}
												oninput={markDirty}
											/>
										</label>

										<label class="block">
											<span class="mb-1 block text-xs font-medium tracking-[0.14em] text-gray-500 uppercase">Valor</span>
											<input
												class="w-full rounded-xl border border-gray-300 bg-white px-3 py-2 font-mono text-sm dark:border-gray-700 dark:bg-gray-950 dark:text-white"
												bind:value={option.value}
												oninput={markDirty}
											/>
										</label>
									</div>

									<label class="mt-3 block">
										<span class="mb-1 block text-xs font-medium tracking-[0.14em] text-gray-500 uppercase">Descripción opcional</span>
										<textarea
											class="min-h-24 w-full rounded-xl border border-gray-300 bg-white px-3 py-2 text-sm dark:border-gray-700 dark:bg-gray-950 dark:text-white"
											bind:value={option.description}
											oninput={markDirty}
										></textarea>
									</label>
								</div>
							{/each}
						</div>
					{:else if workingBlock.checkConfig.mode === 'numeric'}
						<div class="grid gap-4 md:grid-cols-3">
							<label class="block">
								<span class="mb-2 block text-sm font-medium text-gray-700 dark:text-gray-300"
									>Valor exacto</span
								>
								<input
									type="number"
									class="w-full rounded-xl border border-gray-300 bg-white px-3 py-2.5 text-sm dark:border-gray-700 dark:bg-gray-950 dark:text-white"
									value={workingBlock.checkConfig.acceptedExact ?? ''}
									oninput={(event) => {
										const value = (event.currentTarget as HTMLInputElement).value;
										workingBlock.checkConfig.acceptedExact = value ? Number(value) : null;
										markDirty();
									}}
								/>
							</label>

							<label class="block">
								<span class="mb-2 block text-sm font-medium text-gray-700 dark:text-gray-300">Mínimo</span>
								<input
									type="number"
									class="w-full rounded-xl border border-gray-300 bg-white px-3 py-2.5 text-sm dark:border-gray-700 dark:bg-gray-950 dark:text-white"
									value={workingBlock.checkConfig.acceptedRange?.min ?? ''}
									oninput={(event) => {
										const value = (event.currentTarget as HTMLInputElement).value;
										workingBlock.checkConfig.acceptedRange = {
											...(workingBlock.checkConfig.acceptedRange ?? {}),
											min: value ? Number(value) : undefined
										};
										markDirty();
									}}
								/>
							</label>

							<label class="block">
								<span class="mb-2 block text-sm font-medium text-gray-700 dark:text-gray-300">Máximo</span>
								<input
									type="number"
									class="w-full rounded-xl border border-gray-300 bg-white px-3 py-2.5 text-sm dark:border-gray-700 dark:bg-gray-950 dark:text-white"
									value={workingBlock.checkConfig.acceptedRange?.max ?? ''}
									oninput={(event) => {
										const value = (event.currentTarget as HTMLInputElement).value;
										workingBlock.checkConfig.acceptedRange = {
											...(workingBlock.checkConfig.acceptedRange ?? {}),
											max: value ? Number(value) : undefined
										};
										markDirty();
									}}
								/>
							</label>
						</div>
					{:else if workingBlock.checkConfig.mode === 'short_text'}
						<div class="space-y-4 rounded-2xl border border-gray-200 p-4 dark:border-gray-800">
							<label class="block">
								<span class="mb-2 block text-sm font-medium text-gray-700 dark:text-gray-300"
									>Respuestas aceptadas</span
								>
								<textarea
									class="min-h-32 w-full rounded-xl border border-gray-300 bg-white px-3 py-2.5 text-sm dark:border-gray-700 dark:bg-gray-950 dark:text-white"
									value={workingBlock.checkConfig.acceptedAnswers.join('\n')}
									oninput={(event) => {
										workingBlock.checkConfig.acceptedAnswers = (event.currentTarget as HTMLTextAreaElement).value
											.split('\n')
											.map((value) => value.trim())
											.filter(Boolean);
										markDirty();
									}}
								></textarea>
							</label>

							<div class="grid gap-4 md:grid-cols-3">
								<label class="block">
									<span class="mb-2 block text-sm font-medium text-gray-700 dark:text-gray-300"
										>Modo de coincidencia</span
									>
									<select
										class="w-full rounded-xl border border-gray-300 bg-white px-3 py-2.5 text-sm dark:border-gray-700 dark:bg-gray-950 dark:text-white"
										bind:value={workingBlock.checkConfig.matchMode}
										onchange={markDirty}
									>
										{#each checkTextMatchModes as matchModeOption (matchModeOption.value)}
											<option value={matchModeOption.value}>{matchModeOption.label}</option>
										{/each}
									</select>
								</label>

								<label class="flex items-center gap-3 rounded-2xl border border-gray-200 px-4 py-3 dark:border-gray-800">
									<input
										type="checkbox"
										class="text-primary-600 h-4 w-4 rounded border-gray-300"
										bind:checked={workingBlock.checkConfig.caseSensitive}
										onchange={markDirty}
									/>
									<span class="text-sm text-gray-900 dark:text-white">Distinguir mayúsculas</span>
								</label>

								<label class="flex items-center gap-3 rounded-2xl border border-gray-200 px-4 py-3 dark:border-gray-800">
									<input
										type="checkbox"
										class="text-primary-600 h-4 w-4 rounded border-gray-300"
										bind:checked={workingBlock.checkConfig.trimWhitespace}
										onchange={markDirty}
									/>
									<span class="text-sm text-gray-900 dark:text-white">Recortar espacios</span>
								</label>
							</div>
						</div>
					{/if}

					<div class="grid gap-4 md:grid-cols-3">
						<label class="block">
							<span class="mb-2 block text-sm font-medium text-gray-700 dark:text-gray-300"
								>Feedback correcto</span
							>
							<textarea
								class="min-h-24 w-full rounded-xl border border-gray-300 bg-white px-3 py-2.5 text-sm dark:border-gray-700 dark:bg-gray-950 dark:text-white"
								bind:value={workingBlock.checkConfig.feedbackCorrect}
								oninput={markDirty}
							></textarea>
						</label>

						<label class="block">
							<span class="mb-2 block text-sm font-medium text-gray-700 dark:text-gray-300"
								>Feedback parcial</span
							>
							<textarea
								class="min-h-24 w-full rounded-xl border border-gray-300 bg-white px-3 py-2.5 text-sm dark:border-gray-700 dark:bg-gray-950 dark:text-white"
								bind:value={workingBlock.checkConfig.feedbackPartial}
								oninput={markDirty}
							></textarea>
						</label>

						<label class="block">
							<span class="mb-2 block text-sm font-medium text-gray-700 dark:text-gray-300"
								>Feedback incorrecto</span
							>
							<textarea
								class="min-h-24 w-full rounded-xl border border-gray-300 bg-white px-3 py-2.5 text-sm dark:border-gray-700 dark:bg-gray-950 dark:text-white"
								bind:value={workingBlock.checkConfig.feedbackIncorrect}
								oninput={markDirty}
							></textarea>
						</label>
					</div>

					<label class="block">
						<span class="mb-2 block text-sm font-medium text-gray-700 dark:text-gray-300"
							>Siguiente bloque por defecto</span
						>
						<select
							class="w-full rounded-xl border border-gray-300 bg-white px-3 py-2.5 text-sm dark:border-gray-700 dark:bg-gray-950 dark:text-white"
							bind:value={workingBlock.next}
							onchange={markDirty}
						>
							{#each availableBlockIds as blockId (blockId)}
								<option value={blockId}>{blockId}</option>
							{/each}
						</select>
					</label>
				</div>
			{:else if workingBlock.kind === 'agent'}
				<div class="space-y-5">
					<label class="block">
						<span class="mb-2 block text-sm font-medium text-gray-700 dark:text-gray-300"
							>Introducción del bloque</span
						>
						<textarea
							class="min-h-28 w-full rounded-xl border border-gray-300 bg-white px-3 py-2.5 text-sm dark:border-gray-700 dark:bg-gray-950 dark:text-white"
							bind:value={workingBlock.body}
							oninput={markDirty}
						></textarea>
					</label>

					<div class="rounded-2xl border border-amber-200 bg-amber-50/80 p-4 dark:border-amber-900/40 dark:bg-amber-950/10">
						<div class="flex flex-wrap items-center justify-between gap-3">
							<div>
								<h2 class="text-base font-semibold text-gray-900 dark:text-white">Presets de arranque</h2>
								<p class="text-sm text-gray-500 dark:text-gray-400">
									Son puntos de partida rápidos. Después puedes ajustar el bloque libremente.
								</p>
							</div>
							<div class="flex flex-wrap gap-2">
								<button
									type="button"
									class="rounded-xl border border-amber-300 px-3 py-2 text-sm font-medium text-amber-800 hover:bg-amber-100 dark:border-amber-900/40 dark:text-amber-200 dark:hover:bg-amber-950/30"
									onclick={() => applyAgentPreset('feedback')}
								>
									Feedback automático
								</button>
								<button
									type="button"
									class="rounded-xl border border-amber-300 px-3 py-2 text-sm font-medium text-amber-800 hover:bg-amber-100 dark:border-amber-900/40 dark:text-amber-200 dark:hover:bg-amber-950/30"
									onclick={() => applyAgentPreset('generated_content')}
								>
									Contenido generado
								</button>
								<button
									type="button"
									class="rounded-xl border border-amber-300 px-3 py-2 text-sm font-medium text-amber-800 hover:bg-amber-100 dark:border-amber-900/40 dark:text-amber-200 dark:hover:bg-amber-950/30"
									onclick={() => applyAgentPreset('summary')}
								>
									Resumen y síntesis
								</button>
							</div>
						</div>
					</div>

					<div class="grid gap-4 md:grid-cols-3">
						<label class="block">
							<span class="mb-2 block text-sm font-medium text-gray-700 dark:text-gray-300"
								>Modelo</span
							>
							<select
								class="w-full rounded-xl border border-gray-300 bg-white px-3 py-2.5 text-sm dark:border-gray-700 dark:bg-gray-950 dark:text-white"
								value={workingBlock.agentConfig.model ?? ''}
								onchange={(event) => {
									workingBlock.agentConfig.model =
										(event.currentTarget as HTMLSelectElement).value || null;
									markDirty();
								}}
							>
								<option value="">{data.defaultModel} · modelo por defecto</option>
								{#each availableModels as model (model.name)}
									<option value={model.name}>{model.name} ({model.provider})</option>
								{/each}
							</select>
						</label>

						<label class="block">
							<span class="mb-2 block text-sm font-medium text-gray-700 dark:text-gray-300"
								>Interacción</span
							>
							<select
								class="w-full rounded-xl border border-gray-300 bg-white px-3 py-2.5 text-sm dark:border-gray-700 dark:bg-gray-950 dark:text-white"
								bind:value={workingBlock.agentConfig.interactionMode}
								onchange={(event) =>
									updateAgentInteractionMode(
										(event.currentTarget as HTMLSelectElement)
											.value as LessonAgentInteractionMode
									)}
							>
								<option value="single_turn">Turno único guiado</option>
								<option value="multi_turn">Mini chat</option>
								<option value="none">Sin interacción, generación automática</option>
							</select>
						</label>

						<label class="block">
							<span class="mb-2 block text-sm font-medium text-gray-700 dark:text-gray-300"
								>Disparo</span
							>
							<select
								class="w-full rounded-xl border border-gray-300 bg-white px-3 py-2.5 text-sm dark:border-gray-700 dark:bg-gray-950 dark:text-white"
								bind:value={workingBlock.agentConfig.executionTrigger}
								onchange={markDirty}
							>
								{#each getValidExecutionTriggers(workingBlock.agentConfig.interactionMode) as trigger (trigger.value)}
									<option value={trigger.value}>{trigger.label}</option>
								{/each}
							</select>
						</label>
					</div>

					{#if workingBlock.agentConfig.interactionMode !== 'none'}
						<label class="flex items-center gap-3 rounded-2xl border border-gray-200 px-4 py-3 dark:border-gray-800">
							<input
								type="checkbox"
								class="text-primary-600 h-4 w-4 rounded border-gray-300"
								bind:checked={workingBlock.agentConfig.autoStartOnEnter}
								onchange={markDirty}
							/>
							<div>
								<p class="text-sm font-medium text-gray-900 dark:text-white">
									Autoarrancar al entrar
								</p>
								<p class="text-xs text-gray-500 dark:text-gray-400">
									La IA puede abrir el bloque automáticamente al entrar y después seguir con el modo interactivo configurado.
								</p>
							</div>
						</label>
					{:else}
						<div class="rounded-2xl border border-sky-200 bg-sky-50/80 px-4 py-3 text-sm text-sky-900 dark:border-sky-900/40 dark:bg-sky-950/20 dark:text-sky-100">
							Este modo siempre se autoarranca al entrar porque no espera una intervención del alumno.
						</div>
					{/if}

					<label class="block">
						<span class="mb-2 block text-sm font-medium text-gray-700 dark:text-gray-300"
							>Prompt base</span
						>
						<textarea
							class="min-h-36 w-full rounded-xl border border-gray-300 bg-white px-3 py-2.5 text-sm dark:border-gray-700 dark:bg-gray-950 dark:text-white"
							bind:value={workingBlock.agentConfig.promptTemplate}
							oninput={markDirty}
						></textarea>
					</label>

					<label class="block">
						<span class="mb-2 block text-sm font-medium text-gray-700 dark:text-gray-300"
							>System prompt</span
						>
						<textarea
							class="min-h-28 w-full rounded-xl border border-gray-300 bg-white px-3 py-2.5 text-sm dark:border-gray-700 dark:bg-gray-950 dark:text-white"
							bind:value={workingBlock.agentConfig.systemPrompt}
							oninput={markDirty}
						></textarea>
					</label>

					<div class="grid gap-4 md:grid-cols-2">
						<label class="block">
							<span class="mb-2 block text-sm font-medium text-gray-700 dark:text-gray-300"
								>Botón continuar</span
							>
							<input
								class="w-full rounded-xl border border-gray-300 bg-white px-3 py-2.5 text-sm dark:border-gray-700 dark:bg-gray-950 dark:text-white"
								bind:value={workingBlock.agentConfig.continueLabel}
								oninput={markDirty}
							/>
						</label>

						<label class="block">
							<span class="mb-2 block text-sm font-medium text-gray-700 dark:text-gray-300"
								>Máx. turnos</span
							>
							<input
								type="number"
								min="1"
								class="w-full rounded-xl border border-gray-300 bg-white px-3 py-2.5 text-sm dark:border-gray-700 dark:bg-gray-950 dark:text-white"
								value={workingBlock.agentConfig.maxTurns ?? ''}
								oninput={(event) => {
									const value = (event.currentTarget as HTMLInputElement).value;
									workingBlock.agentConfig.maxTurns = value ? Number(value) : null;
									markDirty();
								}}
							/>
						</label>
					</div>

					{#if workingBlock.agentConfig.interactionMode !== 'none'}
						<div class="grid gap-4 md:grid-cols-3">
							<label class="block">
								<span class="mb-2 block text-sm font-medium text-gray-700 dark:text-gray-300"
									>Placeholder</span
								>
								<input
									class="w-full rounded-xl border border-gray-300 bg-white px-3 py-2.5 text-sm dark:border-gray-700 dark:bg-gray-950 dark:text-white"
									bind:value={workingBlock.agentConfig.placeholder}
									oninput={markDirty}
								/>
							</label>

							<label class="block">
								<span class="mb-2 block text-sm font-medium text-gray-700 dark:text-gray-300"
									>Botón enviar</span
								>
								<input
									class="w-full rounded-xl border border-gray-300 bg-white px-3 py-2.5 text-sm dark:border-gray-700 dark:bg-gray-950 dark:text-white"
									bind:value={workingBlock.agentConfig.submitLabel}
									oninput={markDirty}
								/>
							</label>

							<label class="block">
								<span class="mb-2 block text-sm font-medium text-gray-700 dark:text-gray-300"
									>Mensaje inicial visible</span
								>
								<input
									class="w-full rounded-xl border border-gray-300 bg-white px-3 py-2.5 text-sm dark:border-gray-700 dark:bg-gray-950 dark:text-white"
									bind:value={workingBlock.agentConfig.initialAssistantMessage}
									oninput={markDirty}
								/>
								<p class="mt-2 text-xs leading-5 text-gray-500 dark:text-gray-400">
									Mensaje fijo opcional. Si además activas el autoarranque, este texto se mostrará antes de la primera respuesta generada.
								</p>
							</label>
						</div>

						<label
							class="flex items-center gap-3 rounded-2xl border border-gray-200 px-4 py-3 dark:border-gray-800"
						>
							<input
								type="checkbox"
								class="text-primary-600 h-4 w-4 rounded border-gray-300"
								bind:checked={workingBlock.requiresResponse}
								onchange={markDirty}
							/>
							<div>
								<p class="text-sm font-medium text-gray-900 dark:text-white">
									Exigir respuesta del alumno
								</p>
								<p class="text-xs text-gray-500 dark:text-gray-400">
									Si se desactiva, el alumno podrá continuar sin enviar mensaje.
								</p>
							</div>
						</label>
					{/if}

					{#if workingBlock.agentConfig.interactionMode === 'none' || workingBlock.agentConfig.autoStartOnEnter}
						<label class="block">
							<span class="mb-2 block text-sm font-medium text-gray-700 dark:text-gray-300"
								>Mensaje de lanzamiento interno</span
							>
							<textarea
								class="min-h-28 w-full rounded-xl border border-gray-300 bg-white px-3 py-2.5 text-sm dark:border-gray-700 dark:bg-gray-950 dark:text-white"
								bind:value={workingBlock.agentConfig.launchMessageTemplate}
								oninput={markDirty}
							></textarea>
							<p class="mt-2 text-xs leading-5 text-gray-500 dark:text-gray-400">
								Este mensaje se envía al modelo al entrar en el bloque, pero no se renderiza como mensaje visible del estudiante. Úsalo para indicar cómo debe arrancar la interacción.
							</p>
						</label>
					{/if}

					<label class="block">
						<span class="mb-2 block text-sm font-medium text-gray-700 dark:text-gray-300"
							>Siguiente bloque por defecto</span
						>
						<select
							class="w-full rounded-xl border border-gray-300 bg-white px-3 py-2.5 text-sm dark:border-gray-700 dark:bg-gray-950 dark:text-white"
							bind:value={workingBlock.next}
							onchange={markDirty}
						>
							{#each availableBlockIds as blockId (blockId)}
								<option value={blockId}>{blockId}</option>
							{/each}
						</select>
					</label>

					<div class="space-y-3 rounded-2xl border border-gray-200 p-4 dark:border-gray-800">
						<div class="flex flex-wrap items-center justify-between gap-3">
							<div>
								<h2 class="text-base font-semibold text-gray-900 dark:text-white">
									Salida estructurada
								</h2>
								<p class="text-sm text-gray-500 dark:text-gray-400">
									Campos disponibles luego como variables `blocks.{workingBlock.id}.outputs.*`.
								</p>
							</div>
							<button
								type="button"
								class="rounded-xl border border-gray-300 px-3 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 dark:border-gray-700 dark:text-gray-200 dark:hover:bg-gray-800"
								onclick={addOutputField}
							>
								<Plus class="mr-1 inline h-4 w-4" />
								Añadir campo
							</button>
						</div>

						{#each workingBlock.agentConfig.outputSchema ?? [] as field, fieldIndex (`${field.key}-${fieldIndex}`)}
							<div class="rounded-2xl border border-gray-200 p-4 dark:border-gray-800">
								<div class="grid gap-3 md:grid-cols-3">
									<label class="block">
										<span
											class="mb-1 block text-xs font-medium tracking-[0.14em] text-gray-500 uppercase"
											>Key</span
										>
										<input
											class="w-full rounded-xl border border-gray-300 bg-white px-3 py-2 font-mono text-sm dark:border-gray-700 dark:bg-gray-950 dark:text-white"
											bind:value={field.key}
											oninput={markDirty}
										/>
									</label>

									<label class="block">
										<span
											class="mb-1 block text-xs font-medium tracking-[0.14em] text-gray-500 uppercase"
											>Tipo</span
										>
										<select
											class="w-full rounded-xl border border-gray-300 bg-white px-3 py-2 text-sm dark:border-gray-700 dark:bg-gray-950 dark:text-white"
											bind:value={field.type}
											onchange={markDirty}
										>
											<option value="string">string</option>
											<option value="number">number</option>
											<option value="boolean">boolean</option>
											<option value="json">json</option>
										</select>
									</label>

									<label class="block">
										<span
											class="mb-1 block text-xs font-medium tracking-[0.14em] text-gray-500 uppercase"
											>Descripción</span
										>
										<input
											class="w-full rounded-xl border border-gray-300 bg-white px-3 py-2 text-sm dark:border-gray-700 dark:bg-gray-950 dark:text-white"
											bind:value={field.description}
											oninput={markDirty}
										/>
									</label>
								</div>

								<div class="mt-3 flex justify-end">
									<button
										type="button"
										class="rounded-xl border border-red-200 px-3 py-2 text-sm text-red-700 hover:bg-red-50 dark:border-red-900/40 dark:text-red-300 dark:hover:bg-red-950/20"
										onclick={() => removeOutputField(fieldIndex)}
									>
										<Trash2 class="mr-1 inline h-4 w-4" />
										Eliminar campo
									</button>
								</div>
							</div>
						{/each}
					</div>
				</div>
			{:else}
				<div class="space-y-4">
					<label class="block">
						<span class="mb-2 block text-sm font-medium text-gray-700 dark:text-gray-300">
							{workingBlock.kind === 'end' ? 'Mensaje final' : 'Contenido'}
						</span>
						<textarea
							class="min-h-36 w-full rounded-xl border border-gray-300 bg-white px-3 py-2.5 text-sm dark:border-gray-700 dark:bg-gray-950 dark:text-white"
							bind:value={workingBlock.body}
							oninput={markDirty}
						></textarea>
					</label>

					{#if workingBlock.kind === 'end'}
						<label class="block">
							<span class="mb-2 block text-sm font-medium text-gray-700 dark:text-gray-300"
								>Texto CTA</span
							>
							<input
								class="w-full rounded-xl border border-gray-300 bg-white px-3 py-2.5 text-sm dark:border-gray-700 dark:bg-gray-950 dark:text-white"
								bind:value={workingBlock.ctaLabel}
								oninput={markDirty}
							/>
						</label>
					{/if}
				</div>
			{/if}

			{#if workingBlock.kind === 'content' || workingBlock.kind === 'check' || workingBlock.kind === 'agent'}
				<div
					class="space-y-4 rounded-2xl border border-dashed border-gray-300 p-4 dark:border-gray-700"
				>
					<div class="flex flex-wrap items-center justify-between gap-3">
						<div>
							<h2 class="text-lg font-semibold text-gray-900 dark:text-white">Branching</h2>
							<p class="text-sm text-gray-500 dark:text-gray-400">
								Ramas condicionales evaluadas antes del siguiente bloque por defecto.
							</p>
						</div>
						<button
							type="button"
							class="rounded-xl border border-gray-300 px-3 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 dark:border-gray-700 dark:text-gray-200 dark:hover:bg-gray-800"
							onclick={addBranch}
						>
							<GitBranch class="mr-1 inline h-4 w-4" />
							Añadir rama
						</button>
					</div>

					{#if (workingBlock.branches?.length ?? 0) === 0}
						<p class="text-sm text-gray-500 dark:text-gray-400">
							Todavía no hay ramas condicionales.
						</p>
					{:else}
						<div class="space-y-3">
							{#each workingBlock.branches ?? [] as branch, branchIndex (`${branch.label}-${branchIndex}`)}
								{@const condition = ensureBranchCondition(branch)}
								<div class="rounded-2xl border border-gray-200 p-4 dark:border-gray-800">
									<div class="grid gap-3 md:grid-cols-2">
										<label class="block">
											<span
												class="mb-1 block text-xs font-medium tracking-[0.14em] text-gray-500 uppercase"
												>Etiqueta</span
											>
											<input
												class="w-full rounded-xl border border-gray-300 bg-white px-3 py-2 text-sm dark:border-gray-700 dark:bg-gray-950 dark:text-white"
												bind:value={branch.label}
												oninput={markDirty}
											/>
										</label>

										<label class="block">
											<span
												class="mb-1 block text-xs font-medium tracking-[0.14em] text-gray-500 uppercase"
												>Destino</span
											>
											<select
												class="w-full rounded-xl border border-gray-300 bg-white px-3 py-2 text-sm dark:border-gray-700 dark:bg-gray-950 dark:text-white"
												bind:value={branch.targetBlockId}
												onchange={markDirty}
											>
												{#each availableBlockIds as blockId (blockId)}
													<option value={blockId}>{blockId}</option>
												{/each}
											</select>
										</label>

										<label class="block">
											<span
												class="mb-1 block text-xs font-medium tracking-[0.14em] text-gray-500 uppercase"
												>Variable origen</span
											>
											<input
												class="w-full rounded-xl border border-gray-300 bg-white px-3 py-2 font-mono text-sm dark:border-gray-700 dark:bg-gray-950 dark:text-white"
												bind:value={condition.source}
												oninput={markDirty}
											/>
										</label>

										<label class="block">
											<span
												class="mb-1 block text-xs font-medium tracking-[0.14em] text-gray-500 uppercase"
												>Operador</span
											>
											<select
												class="w-full rounded-xl border border-gray-300 bg-white px-3 py-2 text-sm dark:border-gray-700 dark:bg-gray-950 dark:text-white"
												bind:value={condition.operator}
												onchange={markDirty}
											>
												{#each conditionOperators as operator (operator)}
													<option value={operator}>{operator}</option>
												{/each}
											</select>
										</label>
									</div>

									<label class="mt-3 block">
										<span
											class="mb-1 block text-xs font-medium tracking-[0.14em] text-gray-500 uppercase"
											>Valor esperado</span
										>
										<input
											class="w-full rounded-xl border border-gray-300 bg-white px-3 py-2 text-sm dark:border-gray-700 dark:bg-gray-950 dark:text-white"
											value={condition.value?.toString() ?? ''}
											oninput={(event) => {
												condition.value = (event.currentTarget as HTMLInputElement).value;
												markDirty();
											}}
										/>
									</label>

									<div class="mt-3 flex justify-end">
										<button
											type="button"
											class="rounded-xl border border-red-200 px-3 py-2 text-sm text-red-700 hover:bg-red-50 dark:border-red-900/40 dark:text-red-300 dark:hover:bg-red-950/20"
											onclick={() => removeBranch(branchIndex)}
										>
											<Trash2 class="mr-1 inline h-4 w-4" />
											Eliminar rama
										</button>
									</div>
								</div>
							{/each}
						</div>
					{/if}
				</div>
			{/if}

			<div
				class="flex flex-col gap-4 border-t border-gray-200 pt-5 sm:flex-row sm:items-center sm:justify-between dark:border-gray-800"
			>
				<div>
					{#if isDirty}
						<p class="text-sm text-amber-700 dark:text-amber-300">
							Hay cambios pendientes en este bloque.
						</p>
					{:else}
						<p class="text-sm text-gray-500 dark:text-gray-400">
							Guarda para revalidar la lesson completa y persistir solo este bloque.
						</p>
					{/if}
				</div>

				<button
					class="bg-primary-600 hover:bg-primary-700 rounded-xl px-4 py-2.5 text-sm font-medium text-white"
				>
					<Save class="mr-1 inline h-4 w-4" />
					Guardar bloque
				</button>
			</div>
		</form>

		<div class="space-y-6">
			<div
				class="rounded-2xl bg-white p-6 shadow-sm ring-1 ring-gray-200/80 dark:bg-gray-900/40 dark:ring-gray-800"
			>
				<h2 class="text-lg font-semibold text-gray-900 dark:text-white">Mapa del bloque</h2>
				<p class="mt-2 text-sm text-gray-500 dark:text-gray-400">
					El flujo real lo definen las conexiones del grafo. Cambiar el orden visual de la lesson no
					altera estas relaciones.
				</p>

				<div class="mt-4 grid gap-3 sm:grid-cols-2">
					<div
						class="rounded-2xl border border-sky-200 bg-sky-50/80 px-4 py-4 dark:border-sky-900/40 dark:bg-sky-950/20"
					>
						<p
							class="text-xs font-medium tracking-[0.16em] text-sky-700 uppercase dark:text-sky-300"
						>
							Entradas
						</p>
						<p class="mt-1 text-2xl font-semibold text-sky-950 dark:text-sky-50">
							{currentGraphSummary.incomingBlockIds.length}
						</p>
						<div class="mt-3 flex flex-wrap gap-2">
							{#if currentGraphSummary.incomingBlockIds.length}
								{#each currentGraphSummary.incomingBlockIds as sourceId (sourceId)}
									<span
										class="rounded-full border border-sky-200 px-2.5 py-1 text-[11px] font-medium text-sky-700 dark:border-sky-900/50 dark:text-sky-200"
									>
										{blockLabel(sourceId)}
									</span>
								{/each}
							{:else}
								<span class="text-sm text-sky-800/80 dark:text-sky-100/80"
									>Nadie llega todavía a este bloque.</span
								>
							{/if}
						</div>
					</div>
					<div
						class="rounded-2xl border border-emerald-200 bg-emerald-50/80 px-4 py-4 dark:border-emerald-900/40 dark:bg-emerald-950/20"
					>
						<p
							class="text-xs font-medium tracking-[0.16em] text-emerald-700 uppercase dark:text-emerald-300"
						>
							Salidas
						</p>
						<p class="mt-1 text-2xl font-semibold text-emerald-950 dark:text-emerald-50">
							{currentGraphSummary.outgoingBlockIds.length}
						</p>
						<div class="mt-3 flex flex-wrap gap-2">
							{#if currentGraphSummary.outgoingBlockIds.length}
								{#each currentGraphSummary.outgoingBlockIds as targetId (targetId)}
									<span
										class="rounded-full border border-emerald-200 px-2.5 py-1 text-[11px] font-medium text-emerald-700 dark:border-emerald-900/50 dark:text-emerald-200"
									>
										{blockLabel(targetId)}
									</span>
								{/each}
							{:else}
								<span class="text-sm text-emerald-800/80 dark:text-emerald-100/80">
									Este bloque no tiene destinos configurados.
								</span>
							{/if}
						</div>
					</div>
				</div>

				<div class="mt-4 flex flex-wrap gap-2">
					{#each availableBlockIds as blockId (blockId)}
						<span
							class="rounded-full bg-gray-100 px-3 py-1.5 text-xs font-medium text-gray-700 dark:bg-gray-800 dark:text-gray-200"
						>
							{blockId}
						</span>
					{/each}
				</div>
			</div>

			<div
				class="rounded-2xl bg-white p-6 shadow-sm ring-1 ring-gray-200/80 dark:bg-gray-900/40 dark:ring-gray-800"
			>
				<h2 class="text-lg font-semibold text-gray-900 dark:text-white">Qué expone este bloque</h2>
				<p class="mt-2 text-sm text-gray-500 dark:text-gray-400">
					Estas son las referencias estables que otros nodos podrán leer desde
					<code>{`{{blocks.${data.block.id}.state.*}}`}</code> y
					<code>{`{{blocks.${data.block.id}.outputs.*}}`}</code>.
				</p>

				<div class="mt-4 space-y-4">
					<div class="rounded-2xl border border-gray-200 px-4 py-4 dark:border-gray-800">
						<div class="flex items-center justify-between gap-3">
							<h3 class="text-sm font-semibold text-gray-900 dark:text-white">Estado runtime</h3>
							<span
								class="rounded-full bg-gray-100 px-2.5 py-1 text-xs font-medium text-gray-600 dark:bg-gray-800 dark:text-gray-300"
							>
								{currentBlockContract.state.length} referencia{currentBlockContract.state.length ===
								1
									? ''
									: 's'}
							</span>
						</div>
						<div class="mt-3 space-y-2">
							{#each currentBlockContract.state as field (field.path)}
								<div class="rounded-2xl bg-gray-50 px-3 py-3 dark:bg-gray-950/40">
									<p class="text-primary-700 dark:text-primary-300 font-mono text-xs">
										{`{{${field.path}}}`}
									</p>
									<p class="mt-1 text-sm font-medium text-gray-900 dark:text-white">
										{field.label}
									</p>
									<p class="mt-1 text-xs leading-5 text-gray-500 dark:text-gray-400">
										{field.description}
									</p>
								</div>
							{/each}
						</div>
					</div>
					<div class="rounded-2xl border border-gray-200 px-4 py-4 dark:border-gray-800">
						<div class="flex items-center justify-between gap-3">
							<h3 class="text-sm font-semibold text-gray-900 dark:text-white">
								Outputs reutilizables
							</h3>
							<span
								class="rounded-full bg-gray-100 px-2.5 py-1 text-xs font-medium text-gray-600 dark:bg-gray-800 dark:text-gray-300"
							>
								{currentBlockContract.outputs.length} referencia{currentBlockContract.outputs
									.length === 1
									? ''
									: 's'}
							</span>
						</div>
						<div class="mt-3 space-y-2">
							{#if currentBlockContract.outputs.length}
								{#each currentBlockContract.outputs as field (field.path)}
									<div class="rounded-2xl bg-gray-50 px-3 py-3 dark:bg-gray-950/40">
										<p class="text-primary-700 dark:text-primary-300 font-mono text-xs">
											{`{{${field.path}}}`}
										</p>
										<p class="mt-1 text-sm font-medium text-gray-900 dark:text-white">
											{field.label}
										</p>
										<p class="mt-1 text-xs leading-5 text-gray-500 dark:text-gray-400">
											{field.description}
										</p>
									</div>
								{/each}
							{:else}
								<p
									class="rounded-2xl bg-gray-50 px-3 py-3 text-sm text-gray-500 dark:bg-gray-950/40 dark:text-gray-400"
								>
									Este bloque todavía no publica outputs propios aparte del estado del sistema.
								</p>
							{/if}
						</div>
					</div>
				</div>
			</div>

			<div
				class="rounded-2xl bg-white p-6 shadow-sm ring-1 ring-gray-200/80 dark:bg-gray-900/40 dark:ring-gray-800"
			>
				<h2 class="text-lg font-semibold text-gray-900 dark:text-white">Referencias disponibles</h2>
				<p class="mt-2 text-sm text-gray-500 dark:text-gray-400">
					Úsalas en prompts, markdown y condiciones con la sintaxis
					<code>{'{{variable}}'}</code>. Si un bloque aún no se ha visitado, sus outputs resolverán
					vacío o <code>undefined</code> según el contexto.
				</p>

				<div class="mt-4 space-y-4">
					<div class="rounded-2xl border border-gray-200 px-4 py-4 dark:border-gray-800">
						<div class="flex items-center justify-between gap-3">
							<h3 class="text-sm font-semibold text-gray-900 dark:text-white">Sesión</h3>
							<span
								class="rounded-full bg-gray-100 px-2.5 py-1 text-xs font-medium text-gray-600 dark:bg-gray-800 dark:text-gray-300"
							>
								{sessionVariables.length} variable{sessionVariables.length === 1 ? '' : 's'}
							</span>
						</div>
						<div class="mt-3 space-y-2">
							{#each sessionVariables as variable (variable.path)}
								<div class="rounded-2xl bg-gray-50 px-3 py-3 dark:bg-gray-950/40">
									<p class="text-primary-700 dark:text-primary-300 font-mono text-xs">
										{`{{${variable.path}}}`}
									</p>
									<p class="mt-1 text-sm font-medium text-gray-900 dark:text-white">
										{variable.label}
									</p>
									<p class="mt-1 text-xs leading-5 text-gray-500 dark:text-gray-400">
										{variable.description}
									</p>
								</div>
							{/each}
						</div>
					</div>

					{#each referenceGroups as group (group.blockId)}
						<div class="rounded-2xl border border-gray-200 px-4 py-4 dark:border-gray-800">
							<div class="flex flex-wrap items-center gap-2">
								<h3 class="text-sm font-semibold text-gray-900 dark:text-white">
									{group.blockTitle}
								</h3>
								<span
									class="rounded-full bg-gray-100 px-2.5 py-1 font-mono text-xs font-medium text-gray-600 dark:bg-gray-800 dark:text-gray-300"
								>
									{group.blockId}
								</span>
								{#if group.blockId === data.block.id}
									<span
										class="rounded-full bg-amber-100 px-2.5 py-1 text-xs font-medium text-amber-700 dark:bg-amber-950/30 dark:text-amber-300"
									>
										Este bloque
									</span>
								{/if}
							</div>

							<div class="mt-4 grid gap-3">
								<div class="rounded-2xl bg-gray-50 px-3 py-3 dark:bg-gray-950/40">
									<p
										class="mb-2 text-xs font-medium tracking-[0.12em] text-gray-500 uppercase dark:text-gray-400"
									>
										State
									</p>
									<div class="space-y-2">
										{#each group.state as variable (variable.path)}
											<div>
												<p class="text-primary-700 dark:text-primary-300 font-mono text-xs">
													{`{{${variable.path}}}`}
												</p>
												<p class="mt-1 text-sm font-medium text-gray-900 dark:text-white">
													{variable.label}
												</p>
												<p class="mt-1 text-xs leading-5 text-gray-500 dark:text-gray-400">
													{variable.description}
												</p>
											</div>
										{/each}
									</div>
								</div>
								<div class="rounded-2xl bg-gray-50 px-3 py-3 dark:bg-gray-950/40">
									<p
										class="mb-2 text-xs font-medium tracking-[0.12em] text-gray-500 uppercase dark:text-gray-400"
									>
										Outputs
									</p>
									{#if group.outputs.length}
										<div class="space-y-2">
											{#each group.outputs as variable (variable.path)}
												<div>
													<p class="text-primary-700 dark:text-primary-300 font-mono text-xs">
														{`{{${variable.path}}}`}
													</p>
													<p class="mt-1 text-sm font-medium text-gray-900 dark:text-white">
														{variable.label}
													</p>
													<p class="mt-1 text-xs leading-5 text-gray-500 dark:text-gray-400">
														{variable.description}
													</p>
												</div>
											{/each}
										</div>
									{:else}
										<p class="text-sm text-gray-500 dark:text-gray-400">
											Este bloque no expone outputs públicos adicionales todavía.
										</p>
									{/if}
								</div>
							</div>
						</div>
					{/each}
				</div>
			</div>

			<div
				class="rounded-2xl bg-white p-6 shadow-sm ring-1 ring-gray-200/80 dark:bg-gray-900/40 dark:ring-gray-800"
			>
				<h2 class="text-lg font-semibold text-gray-900 dark:text-white">Recursos compartidos</h2>
				<p class="mt-2 text-sm text-gray-500 dark:text-gray-400">
					La lesson tiene {data.files.length} recurso{data.files.length === 1 ? '' : 's'} globales.
				</p>

				<a
					href={resolve(`/course/${cid}/admin/interactives/${ilid}/lessonedit/resources`)}
					class="mt-4 inline-flex items-center rounded-xl border border-gray-300 px-4 py-2.5 text-sm font-medium text-gray-700 hover:bg-gray-50 dark:border-gray-700 dark:text-gray-200 dark:hover:bg-gray-800"
				>
					Abrir recursos
					<ArrowRight class="ml-1 h-4 w-4" />
				</a>
			</div>
		</div>
	</div>
</div>
