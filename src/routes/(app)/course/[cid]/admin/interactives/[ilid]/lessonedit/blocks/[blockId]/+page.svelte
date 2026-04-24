<script lang="ts">
	/* eslint-disable svelte/no-navigation-without-resolve */
	import type { PageProps } from './$types';
	import { beforeNavigate } from '$app/navigation';
	import { deserialize } from '$app/forms';
	import { page } from '$app/state';
	import { breadcrumb } from '$lib/stores/breadcrumb';
	import LessonAgentToolCatalog from '$lib/components/lesson/LessonAgentToolCatalog.svelte';
	import {
		getLessonAgentToolMetrics,
		type LessonAgentToolPresentationItem
	} from '$lib/lesson/lessonAgentToolPresentation';
	import {
		lessonDebuggerHref,
		lessonFlowHref,
		lessonResourcesHref,
		lessonStudioHref
	} from '$lib/lesson/lessonStudioNavigation';
	import RichTextEditor from '$lib/components/RichTextEditor.svelte';
	import { onMount } from 'svelte';
	import {
		getLessonAgentInteractionDescription,
		getLessonCheckModeLabel,
		normalizeLessonAgentConfig,
		normalizeLessonCheckConfig,
		type LessonAgentExecutionTrigger,
		type LessonAgentInteractionMode,
		type LessonAgentRuntimeMode,
		type LessonAssetRef,
		type LessonBlock,
		type LessonCheckMode,
		type LessonTransition,
		type LessonYoutubePausePoint
	} from '$lib/types/lesson';
	import {
		ArrowRight,
		BookOpenText,
		Bot,
		Bug,
		CircleCheck,
		Eye,
		Flag,
		GitBranch,
		ListChecks,
		MoveLeft,
		Paperclip,
		Plus,
		Route,
		Save,
		Sparkles,
		Trash2,
		Youtube
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
	let isSaving = $state(false);
	let isUploadingInlineImage = $state(false);
	let inlineImageError = $state('');

	const cid = $derived(page.params.cid ?? '');
	const ilid = $derived(page.params.ilid ?? '');
	const blockFlowHref = $derived(lessonFlowHref({ cid, ilid }, workingBlock.id));
	const blockResourcesHref = $derived(
		lessonResourcesHref({ cid, ilid }, { source: 'block', blockId: workingBlock.id })
	);
	const blockDebugHref = $derived(
		lessonDebuggerHref(
			{ cid, ilid },
			{
				source: 'block',
				blockId: workingBlock.id,
				view: 'debug',
				intent: 'inspect'
			}
		)
	);
	const blockPreviewHref = $derived(
		lessonDebuggerHref(
			{ cid, ilid },
			{
				source: 'block',
				blockId: workingBlock.id,
				view: 'student',
				intent: 'run',
				fresh: true
			}
		)
	);
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
	const effectiveAllowedAgentToolIds = $derived(
		data.definition.allowedAgentToolIds?.length
			? data.definition.allowedAgentToolIds
			: data.lessonAgentTools.map((tool) => tool.id)
	);
	const availableLessonAgentTools = $derived(
		data.lessonAgentTools.filter((tool) => effectiveAllowedAgentToolIds.includes(tool.id))
	);
	const selectedBlockAgentToolIds = $derived(
		workingBlock.kind === 'agent'
			? workingBlock.agentConfig.enabledToolIds === undefined
				? effectiveAllowedAgentToolIds
				: workingBlock.agentConfig.enabledToolIds.filter((toolId) =>
						effectiveAllowedAgentToolIds.includes(toolId)
					)
			: []
	);
	const selectedBlockAgentToolMetrics = $derived(
		workingBlock.kind === 'agent'
			? getLessonAgentToolMetrics(
					data.lessonAgentTools as LessonAgentToolPresentationItem[],
					selectedBlockAgentToolIds
				)
			: null
	);
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

	function updateAgentRuntimeMode(runtimeMode: LessonAgentRuntimeMode) {
		if (workingBlock.kind !== 'agent') return;
		workingBlock.agentConfig.runtimeMode = runtimeMode;
		if (runtimeMode === 'basic') {
			workingBlock.agentConfig.enabledToolIds = undefined;
		} else if (workingBlock.agentConfig.enabledToolIds === undefined) {
			workingBlock.agentConfig.enabledToolIds = [];
		}
		markDirty();
	}

	function isInheritingAllowedAgentTools() {
		return workingBlock.kind === 'agent' && workingBlock.agentConfig.enabledToolIds === undefined;
	}

	function setAgentToolInheritance(inherit: boolean) {
		if (workingBlock.kind !== 'agent') return;

		workingBlock.agentConfig.enabledToolIds = inherit ? undefined : [];
		markDirty();
	}

	function toggleAgentTool(toolId: string, checked: boolean) {
		if (workingBlock.kind !== 'agent') return;
		const nextSelected = workingBlock.agentConfig.enabledToolIds ?? [];
		const updated = checked
			? nextSelected.includes(toolId)
				? nextSelected
				: [...nextSelected, toolId]
			: nextSelected.filter((id) => id !== toolId);

		workingBlock.agentConfig.enabledToolIds = updated;
		markDirty();
	}

	function applyAgentPreset(preset: 'feedback' | 'generated_content' | 'summary') {
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
		if (block.kind === 'youtube') return 'YouTube';
		return 'Final';
	}

	function blockKindIcon(block: LessonBlock) {
		if (block.kind === 'content') return BookOpenText;
		if (block.kind === 'choice') return ListChecks;
		if (block.kind === 'check') return CircleCheck;
		if (block.kind === 'agent') return Bot;
		if (block.kind === 'youtube') return Youtube;
		return Flag;
	}

	function blockLabel(blockId: string) {
		return data.definition.blocks.find((block) => block.id === blockId)?.title ?? blockId;
	}

	function extractYoutubeVideoId(input: string): string | null {
		const trimmed = input.trim();
		if (!trimmed) return null;
		if (/^[A-Za-z0-9_-]{11}$/.test(trimmed)) return trimmed;

		try {
			const url = new URL(trimmed);
			const host = url.hostname.replace(/^www\./, '');
			if (host === 'youtu.be') {
				const candidate = url.pathname.split('/').filter(Boolean)[0];
				return candidate && /^[A-Za-z0-9_-]{11}$/.test(candidate) ? candidate : null;
			}
			if (host === 'youtube.com' || host === 'm.youtube.com' || host === 'youtube-nocookie.com') {
				const watchId = url.searchParams.get('v');
				if (watchId && /^[A-Za-z0-9_-]{11}$/.test(watchId)) return watchId;

				const parts = url.pathname.split('/').filter(Boolean);
				const candidate =
					parts[0] === 'embed' || parts[0] === 'shorts' || parts[0] === 'live' ? parts[1] : null;
				return candidate && /^[A-Za-z0-9_-]{11}$/.test(candidate) ? candidate : null;
			}
		} catch {
			return null;
		}

		return null;
	}

	function updateYoutubeVideoInput(value: string) {
		if (workingBlock.kind !== 'youtube') return;
		workingBlock.videoId = extractYoutubeVideoId(value) ?? value.trim();
		markDirty();
	}

	function updateYoutubeSeconds(field: 'startSeconds' | 'endSeconds', value: string) {
		if (workingBlock.kind !== 'youtube') return;
		const trimmed = value.trim();
		workingBlock[field] = trimmed === '' ? null : Number(trimmed);
		markDirty();
	}

	function addYoutubePausePoint() {
		if (workingBlock.kind !== 'youtube') return;
		const nextIndex = (workingBlock.pausePoints?.length ?? 0) + 1;
		const start = workingBlock.startSeconds ?? 0;
		const nextPausePoint: LessonYoutubePausePoint = {
			id: `pause_${nextIndex}`,
			seconds: start + nextIndex * 30,
			title: `Pausa ${nextIndex}`,
			body: '',
			resumeLabel: 'Continuar video'
		};
		workingBlock.pausePoints = [...(workingBlock.pausePoints ?? []), nextPausePoint];
		markDirty();
	}

	function removeYoutubePausePoint(index: number) {
		if (workingBlock.kind !== 'youtube') return;
		workingBlock.pausePoints = (workingBlock.pausePoints ?? []).filter(
			(_, pauseIndex) => pauseIndex !== index
		);
		markDirty();
	}

	function addBranch() {
		if (
			workingBlock.kind !== 'content' &&
			workingBlock.kind !== 'check' &&
			workingBlock.kind !== 'agent' &&
			workingBlock.kind !== 'youtube'
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
			workingBlock.kind !== 'agent' &&
			workingBlock.kind !== 'youtube'
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
			{
				label: 'Mapa',
				href: lessonFlowHref(
					{ cid: page.params.cid ?? '', ilid: page.params.ilid ?? '' },
					workingBlock.id
				)
			},
			{ label: workingBlock.title }
		]);
	});

	onMount(() => {
		const handleBeforeUnload = (event: BeforeUnloadEvent) => {
			if (!isDirty || isSaving) return;
			event.preventDefault();
			event.returnValue = '';
		};

		window.addEventListener('beforeunload', handleBeforeUnload);

		return () => {
			window.removeEventListener('beforeunload', handleBeforeUnload);
		};
	});

	beforeNavigate((navigation) => {
		if (
			isDirty &&
			!isSaving &&
			!window.confirm('Hay cambios sin guardar. ¿Deseas salir de todas formas?')
		) {
			navigation.cancel();
		}
	});
</script>

<div
	class="min-h-dvh bg-[radial-gradient(circle_at_top_left,_rgba(245,158,11,0.14),_transparent_28%),linear-gradient(180deg,_#f8f5ef_0%,_#efe8dc_100%)] p-4 text-stone-900 sm:p-6 dark:bg-[radial-gradient(circle_at_top_left,_rgba(245,158,11,0.1),_transparent_24%),linear-gradient(180deg,_#111315_0%,_#191c20_100%)] dark:text-stone-100"
>
	<div class="mx-auto max-w-[1480px] space-y-5">
		<div
			class="rounded-2xl bg-white p-4 shadow-sm ring-1 ring-gray-200/80 dark:bg-gray-900/40 dark:ring-gray-800"
		>
			<div class="flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between">
				<div class="flex min-w-0 items-start gap-3">
					<div
						class="shrink-0 rounded-2xl bg-amber-100 p-3 text-amber-700 dark:bg-amber-950/30 dark:text-amber-300"
					>
						<HeaderIcon class="h-5 w-5" />
					</div>
					<div class="min-w-0">
						<div class="mb-2 flex flex-wrap items-center gap-2 text-xs font-semibold">
							<a
								class="text-gray-500 hover:text-amber-700 dark:text-gray-400 dark:hover:text-amber-300"
								href={lessonStudioHref({ cid, ilid })}
							>
								Studio
							</a>
							<span class="text-gray-300 dark:text-gray-700">/</span>
							<a
								class="text-gray-500 hover:text-amber-700 dark:text-gray-400 dark:hover:text-amber-300"
								href={blockFlowHref}
							>
								Mapa
							</a>
							<span class="text-gray-300 dark:text-gray-700">/</span>
							<span class="text-gray-500 dark:text-gray-400">Bloque</span>
						</div>
						<div class="flex flex-wrap items-center gap-2">
							<p class="text-xs tracking-[0.18em] text-gray-500 uppercase dark:text-gray-400">
								{blockKindLabel(workingBlock)}
							</p>
							<span
								class="rounded-full bg-gray-100 px-2.5 py-1 text-xs font-medium text-gray-600 dark:bg-gray-800 dark:text-gray-300"
							>
								{currentGraphSummary.incomingBlockIds.length} entrada{currentGraphSummary
									.incomingBlockIds.length === 1
									? ''
									: 's'} · {currentGraphSummary.outgoingBlockIds.length} salida{currentGraphSummary
									.outgoingBlockIds.length === 1
									? ''
									: 's'}
							</span>
							{#if isDirty}
								<span
									class="rounded-full border border-amber-200 bg-amber-50 px-2.5 py-1 text-xs font-semibold text-amber-700 dark:border-amber-900/40 dark:bg-amber-950/20 dark:text-amber-300"
								>
									Sin guardar
								</span>
							{/if}
						</div>
						<h1 class="mt-1 truncate text-2xl font-semibold text-gray-900 dark:text-white">
							{workingBlock.title}
						</h1>
						<p class="mt-1 truncate font-mono text-xs text-gray-500 dark:text-gray-400">
							{workingBlock.id}
						</p>
					</div>
				</div>

				<div class="flex flex-wrap gap-2">
					<a
						href={blockFlowHref}
						class="bg-primary-600 hover:bg-primary-700 inline-flex items-center justify-center rounded-xl px-4 py-2.5 text-sm font-semibold text-white shadow-sm"
					>
						<MoveLeft class="mr-1 h-4 w-4" />
						Volver al mapa
					</a>
					{#if isDirty}
						<button
							type="submit"
							form="block-editor-form"
							name="redirectTo"
							value="debug"
							disabled={isSaving}
							class="inline-flex items-center justify-center rounded-xl border border-sky-300 bg-sky-50 px-3 py-2.5 text-sm font-medium text-sky-800 hover:bg-sky-100 disabled:cursor-not-allowed disabled:opacity-60 dark:border-sky-900/40 dark:bg-sky-950/30 dark:text-sky-200"
						>
							<Bug class="mr-1 h-4 w-4" />
							Guardar y debug
						</button>
						<button
							type="submit"
							form="block-editor-form"
							name="redirectTo"
							value="preview"
							disabled={isSaving}
							class="inline-flex items-center justify-center rounded-xl border border-emerald-300 bg-emerald-50 px-3 py-2.5 text-sm font-medium text-emerald-800 hover:bg-emerald-100 disabled:cursor-not-allowed disabled:opacity-60 dark:border-emerald-900/40 dark:bg-emerald-950/30 dark:text-emerald-200"
						>
							<Eye class="mr-1 h-4 w-4" />
							Guardar y preview
						</button>
					{:else}
						<a
							href={blockDebugHref}
							class="inline-flex items-center justify-center rounded-xl border border-sky-300 bg-sky-50 px-3 py-2.5 text-sm font-medium text-sky-800 hover:bg-sky-100 dark:border-sky-900/40 dark:bg-sky-950/30 dark:text-sky-200"
						>
							<Bug class="mr-1 h-4 w-4" />
							Debug
						</a>
						<a
							href={blockPreviewHref}
							class="inline-flex items-center justify-center rounded-xl border border-emerald-300 bg-emerald-50 px-3 py-2.5 text-sm font-medium text-emerald-800 hover:bg-emerald-100 dark:border-emerald-900/40 dark:bg-emerald-950/30 dark:text-emerald-200"
						>
							<Eye class="mr-1 h-4 w-4" />
							Preview
						</a>
					{/if}
					<a
						href={blockResourcesHref}
						class="inline-flex items-center justify-center rounded-xl border border-gray-300 px-3 py-2.5 text-sm font-medium text-gray-700 hover:bg-gray-50 dark:border-gray-700 dark:text-gray-200 dark:hover:bg-gray-800"
					>
						<Paperclip class="mr-1 h-4 w-4" />
						Recursos
					</a>
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

		<div class="grid gap-6 xl:grid-cols-[minmax(0,1.55fr)_minmax(320px,0.85fr)]">
			<form
				id="block-editor-form"
				method="POST"
				action="?/saveBlock"
				onsubmit={() => {
					isSaving = true;
				}}
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
						<span class="mb-2 block text-sm font-medium text-gray-700 dark:text-gray-300"
							>Título</span
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
					necesitas cambiarlo, crea un bloque nuevo del tipo correcto y elimina este cuando ya no
					esté referenciado.
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
							<label class="mt-5 block">
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
									href={blockResourcesHref}
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

						<div
							class="rounded-2xl border border-emerald-200 bg-emerald-50/80 p-4 dark:border-emerald-900/40 dark:bg-emerald-950/10"
						>
							<div class="flex flex-wrap items-center justify-between gap-3">
								<div>
									<h2 class="text-base font-semibold text-gray-900 dark:text-white">
										Presets de evaluación
									</h2>
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
								<span class="mb-2 block text-sm font-medium text-gray-700 dark:text-gray-300"
									>Modo</span
								>
								<select
									class="w-full rounded-xl border border-gray-300 bg-white px-3 py-2.5 text-sm dark:border-gray-700 dark:bg-gray-950 dark:text-white"
									bind:value={workingBlock.checkConfig.mode}
									onchange={(event) =>
										updateCheckMode(
											(event.currentTarget as HTMLSelectElement).value as LessonCheckMode
										)}
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
								<p class="text-sm font-medium text-gray-900 dark:text-white">
									Revelar respuesta correcta
								</p>
								<p class="text-xs text-gray-500 dark:text-gray-400">
									Permite mostrar la solución al alumno tras la corrección.
								</p>
							</div>
						</label>

						{#if workingBlock.checkConfig.mode === 'single_choice' || workingBlock.checkConfig.mode === 'multiple_choice' || workingBlock.checkConfig.mode === 'true_false'}
							<div class="space-y-3 rounded-2xl border border-gray-200 p-4 dark:border-gray-800">
								<div class="flex flex-wrap items-center justify-between gap-3">
									<div>
										<h2 class="text-base font-semibold text-gray-900 dark:text-white">
											Opciones evaluables
										</h2>
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
											<label
												class="flex items-center gap-2 text-sm font-medium text-gray-900 dark:text-white"
											>
												<input
													type={workingBlock.checkConfig.mode === 'multiple_choice'
														? 'checkbox'
														: 'radio'}
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
												<span
													class="mb-1 block text-xs font-medium tracking-[0.14em] text-gray-500 uppercase"
													>ID</span
												>
												<input
													class="w-full rounded-xl border border-gray-300 bg-white px-3 py-2 font-mono text-sm dark:border-gray-700 dark:bg-gray-950 dark:text-white"
													bind:value={option.id}
													oninput={markDirty}
													disabled={workingBlock.checkConfig.mode === 'true_false'}
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
									</div>
								{/each}
							</div>
						{:else if workingBlock.checkConfig.mode === 'numeric'}
							<div class="grid gap-4 md:grid-cols-3">
								<label class="mt-5 block">
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

								<label class="mt-5 block">
									<span class="mb-2 block text-sm font-medium text-gray-700 dark:text-gray-300"
										>Mínimo</span
									>
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
									<span class="mb-2 block text-sm font-medium text-gray-700 dark:text-gray-300"
										>Máximo</span
									>
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
											workingBlock.checkConfig.acceptedAnswers = (
												event.currentTarget as HTMLTextAreaElement
											).value
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

									<label
										class="flex items-center gap-3 rounded-2xl border border-gray-200 px-4 py-3 dark:border-gray-800"
									>
										<input
											type="checkbox"
											class="text-primary-600 h-4 w-4 rounded border-gray-300"
											bind:checked={workingBlock.checkConfig.caseSensitive}
											onchange={markDirty}
										/>
										<span class="text-sm text-gray-900 dark:text-white">Distinguir mayúsculas</span>
									</label>

									<label
										class="flex items-center gap-3 rounded-2xl border border-gray-200 px-4 py-3 dark:border-gray-800"
									>
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
				{:else if workingBlock.kind === 'youtube'}
					<div class="space-y-6">
						<section class="space-y-5 rounded-2xl border border-gray-200 p-5 dark:border-gray-800">
							<div class="flex flex-wrap items-start justify-between gap-4">
								<div>
									<h2 class="text-lg font-semibold text-gray-900 dark:text-white">Video YouTube</h2>
									<p class="mt-1 text-sm text-gray-500 dark:text-gray-400">
										Pega la URL completa del video, un enlace corto o el ID de 11 caracteres. La
										lección usará el reproductor guiado sin controles nativos.
									</p>
								</div>
								<span
									class="rounded-full bg-red-50 px-3 py-1 text-xs font-semibold text-red-700 dark:bg-red-950/30 dark:text-red-200"
								>
									YouTube IFrame API
								</span>
							</div>

							<label class="block">
								<span class="mb-2 block text-sm font-medium text-gray-700 dark:text-gray-300">
									URL o ID de YouTube
								</span>
								<input
									class="w-full rounded-xl border border-gray-300 bg-white px-3 py-2.5 text-sm dark:border-gray-700 dark:bg-gray-950 dark:text-white"
									value={workingBlock.videoId}
									placeholder="https://www.youtube.com/watch?v=M7lc1UVf-VE"
									oninput={(event) =>
										updateYoutubeVideoInput((event.currentTarget as HTMLInputElement).value)}
								/>
								<div class="mt-2 flex flex-wrap items-center gap-2 text-xs">
									<span class="text-gray-500 dark:text-gray-400">ID guardado:</span>
									<code
										class="rounded bg-gray-100 px-2 py-1 font-mono text-gray-700 dark:bg-gray-800 dark:text-gray-200"
									>
										{workingBlock.videoId || 'sin configurar'}
									</code>
								</div>
							</label>

							{#if /^[A-Za-z0-9_-]{11}$/.test(workingBlock.videoId)}
								<div class="overflow-hidden rounded-2xl bg-black shadow-sm">
									<iframe
										class="aspect-video w-full"
										title={`Preview YouTube ${workingBlock.videoId}`}
										src={`https://www.youtube-nocookie.com/embed/${workingBlock.videoId}?rel=0&modestbranding=1${workingBlock.startSeconds !== null && workingBlock.startSeconds !== undefined ? `&start=${Math.floor(workingBlock.startSeconds)}` : ''}${workingBlock.endSeconds !== null && workingBlock.endSeconds !== undefined ? `&end=${Math.floor(workingBlock.endSeconds)}` : ''}`}
										allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
										allowfullscreen
									></iframe>
								</div>
							{:else}
								<div
									class="rounded-2xl border border-dashed border-red-200 bg-red-50/70 p-4 text-sm text-red-700 dark:border-red-900/40 dark:bg-red-950/10 dark:text-red-200"
								>
									Introduce una URL válida de YouTube o un ID de video de 11 caracteres para ver el
									preview.
								</div>
							{/if}
						</section>

						<section class="space-y-5 rounded-2xl border border-gray-200 p-5 dark:border-gray-800">
							<div>
								<h2 class="text-base font-semibold text-gray-900 dark:text-white">
									Ritmo de reproducción
								</h2>
								<p class="mt-1 text-sm text-gray-500 dark:text-gray-400">
									Define si el alumno debe ver el video completo o solo un tramo concreto.
								</p>
							</div>

							<label class="block">
								<span class="mb-2 block text-sm font-medium text-gray-700 dark:text-gray-300">
									Introducción antes del video
								</span>
								<textarea
									class="min-h-28 w-full rounded-xl border border-gray-300 bg-white px-3 py-2.5 text-sm dark:border-gray-700 dark:bg-gray-950 dark:text-white"
									bind:value={workingBlock.body}
									oninput={markDirty}
									placeholder="Contexto breve, objetivo de observación o instrucción para el alumno."
								></textarea>
							</label>

							<div class="grid gap-4 md:grid-cols-4">
								<label class="block">
									<span class="mb-2 block text-sm font-medium text-gray-700 dark:text-gray-300">
										Inicio, segundos
									</span>
									<input
										type="number"
										min="0"
										step="1"
										class="w-full rounded-xl border border-gray-300 bg-white px-3 py-2.5 text-sm dark:border-gray-700 dark:bg-gray-950 dark:text-white"
										value={workingBlock.startSeconds ?? ''}
										placeholder="0"
										oninput={(event) =>
											updateYoutubeSeconds(
												'startSeconds',
												(event.currentTarget as HTMLInputElement).value
											)}
									/>
								</label>

								<label class="block">
									<span class="mb-2 block text-sm font-medium text-gray-700 dark:text-gray-300">
										Fin, segundos
									</span>
									<input
										type="number"
										min="0"
										step="1"
										class="w-full rounded-xl border border-gray-300 bg-white px-3 py-2.5 text-sm dark:border-gray-700 dark:bg-gray-950 dark:text-white"
										value={workingBlock.endSeconds ?? ''}
										placeholder="Sin límite"
										oninput={(event) =>
											updateYoutubeSeconds(
												'endSeconds',
												(event.currentTarget as HTMLInputElement).value
											)}
									/>
								</label>

								<label class="block">
									<span class="mb-2 block text-sm font-medium text-gray-700 dark:text-gray-300">
										Texto del botón
									</span>
									<input
										class="w-full rounded-xl border border-gray-300 bg-white px-3 py-2.5 text-sm dark:border-gray-700 dark:bg-gray-950 dark:text-white"
										bind:value={workingBlock.continueLabel}
										oninput={markDirty}
										placeholder="Continuar"
									/>
								</label>

								<label class="block">
									<span class="mb-2 block text-sm font-medium text-gray-700 dark:text-gray-300">
										Siguiente bloque
									</span>
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
						</section>

						<section class="space-y-5 rounded-2xl border border-gray-200 p-5 dark:border-gray-800">
							<div class="flex flex-wrap items-start justify-between gap-4">
								<div>
									<h2 class="text-base font-semibold text-gray-900 dark:text-white">
										Pausas guiadas
									</h2>
									<p class="mt-1 text-sm text-gray-500 dark:text-gray-400">
										En esos segundos el reproductor se pausa, oscurece el video y muestra el prompt
										configurado.
									</p>
								</div>
								<button
									type="button"
									class="rounded-xl border border-gray-300 px-3 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 dark:border-gray-700 dark:text-gray-200 dark:hover:bg-gray-800"
									onclick={addYoutubePausePoint}
								>
									<Plus class="mr-1 inline h-4 w-4" />
									Añadir pausa
								</button>
							</div>

							{#if (workingBlock.pausePoints?.length ?? 0) === 0}
								<p class="text-sm text-gray-500 dark:text-gray-400">
									No hay pausas configuradas. El bloque se completará al terminar el video o el
									segmento.
								</p>
							{:else}
								<div class="space-y-3">
									{#each workingBlock.pausePoints ?? [] as pausePoint, pauseIndex (pausePoint.id)}
										<div class="rounded-2xl border border-gray-200 p-4 dark:border-gray-800">
											<div class="grid gap-3 md:grid-cols-[minmax(0,1fr)_9rem]">
												<label class="block">
													<span
														class="mb-1 block text-xs font-medium tracking-[0.14em] text-gray-500 uppercase"
														>ID</span
													>
													<input
														class="w-full rounded-xl border border-gray-300 bg-white px-3 py-2 font-mono text-sm dark:border-gray-700 dark:bg-gray-950 dark:text-white"
														bind:value={pausePoint.id}
														oninput={markDirty}
													/>
												</label>
												<label class="block">
													<span
														class="mb-1 block text-xs font-medium tracking-[0.14em] text-gray-500 uppercase"
														>Segundo</span
													>
													<input
														type="number"
														min="0"
														step="1"
														class="w-full rounded-xl border border-gray-300 bg-white px-3 py-2 text-sm dark:border-gray-700 dark:bg-gray-950 dark:text-white"
														bind:value={pausePoint.seconds}
														oninput={markDirty}
													/>
												</label>
											</div>

											<div class="mt-3 grid gap-3 md:grid-cols-2">
												<label class="block">
													<span
														class="mb-1 block text-xs font-medium tracking-[0.14em] text-gray-500 uppercase"
														>Título</span
													>
													<input
														class="w-full rounded-xl border border-gray-300 bg-white px-3 py-2 text-sm dark:border-gray-700 dark:bg-gray-950 dark:text-white"
														bind:value={pausePoint.title}
														oninput={markDirty}
														placeholder="Antes de continuar"
													/>
												</label>
												<label class="block">
													<span
														class="mb-1 block text-xs font-medium tracking-[0.14em] text-gray-500 uppercase"
														>Botón de reanudar</span
													>
													<input
														class="w-full rounded-xl border border-gray-300 bg-white px-3 py-2 text-sm dark:border-gray-700 dark:bg-gray-950 dark:text-white"
														bind:value={pausePoint.resumeLabel}
														oninput={markDirty}
														placeholder="Continuar video"
													/>
												</label>
											</div>

											<label class="mt-3 block">
												<span
													class="mb-1 block text-xs font-medium tracking-[0.14em] text-gray-500 uppercase"
													>Prompt visible</span
												>
												<textarea
													class="min-h-24 w-full rounded-xl border border-gray-300 bg-white px-3 py-2 text-sm dark:border-gray-700 dark:bg-gray-950 dark:text-white"
													bind:value={pausePoint.body}
													oninput={markDirty}
													placeholder="Pregunta, reflexión o instrucción que verá el alumno."
												></textarea>
											</label>

											<div class="mt-3 flex justify-end">
												<button
													type="button"
													class="rounded-xl border border-red-200 px-3 py-2 text-sm text-red-700 hover:bg-red-50 dark:border-red-900/40 dark:text-red-300 dark:hover:bg-red-950/20"
													onclick={() => removeYoutubePausePoint(pauseIndex)}
												>
													<Trash2 class="mr-1 inline h-4 w-4" />
													Eliminar pausa
												</button>
											</div>
										</div>
									{/each}
								</div>
							{/if}
						</section>
					</div>
				{:else if workingBlock.kind === 'agent'}
					<div class="space-y-6">
						<section class="space-y-5 rounded-2xl border border-gray-200 p-5 dark:border-gray-800">
							<div>
								<h2 class="text-base font-semibold text-gray-900 dark:text-white">
									Comportamiento
								</h2>
								<p class="mt-1 text-sm text-gray-500 dark:text-gray-400">
									Configura cómo entra en escena la IA, cómo conversa y cuál es el ritmo del bloque.
								</p>
							</div>

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

							<div
								class="rounded-2xl border border-amber-200 bg-amber-50/80 p-4 dark:border-amber-900/40 dark:bg-amber-950/10"
							>
								<div class="flex flex-wrap items-center justify-between gap-3">
									<div>
										<h3 class="text-base font-semibold text-gray-900 dark:text-white">
											Presets de arranque
										</h3>
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

							<div class="grid gap-4 md:grid-cols-4">
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
										>Runtime</span
									>
									<select
										class="w-full rounded-xl border border-gray-300 bg-white px-3 py-2.5 text-sm dark:border-gray-700 dark:bg-gray-950 dark:text-white"
										bind:value={workingBlock.agentConfig.runtimeMode}
										onchange={(event) =>
											updateAgentRuntimeMode(
												(event.currentTarget as HTMLSelectElement).value as LessonAgentRuntimeMode
											)}
									>
										<option value="basic">Básico</option>
										<option value="agent">Agéntico con tools</option>
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

							<div
								class="rounded-2xl border border-gray-200 bg-gray-50/80 px-4 py-3 text-sm text-gray-700 dark:border-gray-800 dark:bg-gray-950/20 dark:text-gray-200"
							>
								{getLessonAgentInteractionDescription(workingBlock.agentConfig)}
							</div>

							{#if workingBlock.agentConfig.interactionMode !== 'none'}
								<label
									class="flex items-center gap-3 rounded-2xl border border-gray-200 px-4 py-3 dark:border-gray-800"
								>
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
											La IA puede abrir el bloque automáticamente al entrar y después seguir con el
											modo interactivo configurado.
										</p>
									</div>
								</label>
							{:else}
								<div
									class="rounded-2xl border border-sky-200 bg-sky-50/80 px-4 py-3 text-sm text-sky-900 dark:border-sky-900/40 dark:bg-sky-950/20 dark:text-sky-100"
								>
									Este modo siempre se autoarranca al entrar porque no espera una intervención del
									alumno.
								</div>
							{/if}

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

							{#if workingBlock.agentConfig.interactionMode === 'multi_turn'}
								<label class="block">
									<span class="mb-2 block text-sm font-medium text-gray-700 dark:text-gray-300"
										>Máx. turnos del alumno</span
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
							{:else if workingBlock.agentConfig.interactionMode === 'single_turn'}
								<div
									class="border-primary-200 bg-primary-50/80 text-primary-900 dark:border-primary-900/40 dark:bg-primary-950/20 dark:text-primary-100 rounded-2xl border px-4 py-3 text-sm"
								>
									En turno guiado el alumno solo puede intervenir una vez. El límite de turnos no se
									configura aquí porque forma parte del propio modo.
								</div>
							{/if}

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
								</div>
							{/if}
						</section>

						<details class="rounded-2xl border border-gray-200 p-5 dark:border-gray-800">
							<summary class="cursor-pointer list-none marker:hidden">
								<h2 class="text-base font-semibold text-gray-900 dark:text-white">Prompts</h2>
								<p class="mt-1 text-sm text-gray-500 dark:text-gray-400">
									Aquí viven las instrucciones visibles y ocultas que guían la respuesta del bloque.
								</p>
							</summary>

							<label class="mt-5 block">
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

							{#if workingBlock.agentConfig.interactionMode !== 'none'}
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
										Mensaje fijo opcional. Si además activas el autoarranque, este texto se mostrará
										antes de la primera respuesta generada.
									</p>
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
										Este mensaje se envía al modelo al entrar en el bloque, pero no se renderiza
										como mensaje visible del estudiante. Úsalo para indicar cómo debe arrancar la
										interacción.
									</p>
								</label>
							{/if}
						</details>

						{#if workingBlock.agentConfig.runtimeMode === 'agent'}
							{@const inheritsTools = isInheritingAllowedAgentTools()}
							<details class="rounded-2xl border border-gray-200 p-5 dark:border-gray-800">
								<summary
									class="flex cursor-pointer list-none flex-wrap items-start justify-between gap-4 marker:hidden"
								>
									<div>
										<h2 class="text-base font-semibold text-gray-900 dark:text-white">
											Tools del bloque
										</h2>
										<p class="mt-1 text-sm text-gray-500 dark:text-gray-400">
											El bloque puede heredar la política global o quedarse con un subconjunto más
											estrecho.
										</p>
									</div>
									<span
										class="rounded-full bg-gray-100 px-3 py-1 text-xs font-medium text-gray-700 dark:bg-gray-800 dark:text-gray-200"
									>
										{inheritsTools
											? `Hereda ${selectedBlockAgentToolMetrics?.total ?? 0}`
											: `${workingBlock.agentConfig.enabledToolIds?.length ?? 0} seleccionadas`}
									</span>
								</summary>

								<div class="mt-5 space-y-5">
									<a
										href={lessonStudioHref({ cid, ilid })}
										class="inline-flex rounded-xl border border-gray-300 px-3 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 dark:border-gray-700 dark:text-gray-200 dark:hover:bg-gray-800"
									>
										Editar allowlist global
									</a>

									<label
										class="flex items-center gap-3 rounded-2xl border border-gray-200 px-4 py-3 dark:border-gray-800"
									>
										<input
											type="checkbox"
											class="text-primary-600 h-4 w-4 rounded border-gray-300"
											checked={inheritsTools}
											onchange={(event) =>
												setAgentToolInheritance((event.currentTarget as HTMLInputElement).checked)}
										/>
										<div>
											<p class="text-sm font-medium text-gray-900 dark:text-white">
												Heredar todas las tools permitidas por la lesson
											</p>
											<p class="text-xs text-gray-500 dark:text-gray-400">
												La portada de la lesson define el catálogo global y este bloque puede usarlo
												íntegro sin mantener una lista propia.
											</p>
										</div>
									</label>

									{#if inheritsTools}
										<div
											class="rounded-2xl border border-emerald-200 bg-emerald-50/80 px-4 py-4 dark:border-emerald-900/40 dark:bg-emerald-950/20"
										>
											<div class="flex flex-wrap items-center justify-between gap-3">
												<div>
													<p class="text-sm font-semibold text-emerald-900 dark:text-emerald-100">
														Este bloque hereda la allowlist completa de la lesson
													</p>
													<p class="mt-1 text-sm text-emerald-800/80 dark:text-emerald-100/80">
														{selectedBlockAgentToolMetrics?.total ?? 0} tools · {selectedBlockAgentToolMetrics?.interactive ??
															0} UI · {selectedBlockAgentToolMetrics?.hitl ?? 0}
														HITL
													</p>
												</div>
												<span
													class="rounded-full bg-emerald-100 px-3 py-1 text-xs font-medium text-emerald-700 dark:bg-emerald-950/30 dark:text-emerald-300"
												>
													Allowlist lesson: {effectiveAllowedAgentToolIds.length}
												</span>
											</div>
										</div>
									{:else}
										<div class="space-y-4">
											<div
												class="rounded-2xl border border-amber-200 bg-amber-50/80 px-4 py-4 text-sm text-amber-900 dark:border-amber-900/40 dark:bg-amber-950/20 dark:text-amber-100"
											>
												Este bloque usa un subconjunto propio. La lista empieza vacía por diseño
												para que actives solo lo que realmente necesites.
											</div>

											<LessonAgentToolCatalog
												tools={availableLessonAgentTools}
												selectedToolIds={workingBlock.agentConfig.enabledToolIds ?? []}
												onToggle={toggleAgentTool}
												emptyMessage="La allowlist global no deja tools disponibles para este bloque."
												compact={true}
												initiallyOpenGroupIds={['evaluation_interaction']}
											/>
										</div>
									{/if}
								</div>
							</details>
						{/if}

						<details class="rounded-2xl border border-gray-200 p-5 dark:border-gray-800">
							<summary
								class="flex cursor-pointer list-none flex-wrap items-center justify-between gap-3 marker:hidden"
							>
								<div>
									<h2 class="text-base font-semibold text-gray-900 dark:text-white">
										Salida estructurada
									</h2>
									<p class="mt-1 text-sm text-gray-500 dark:text-gray-400">
										Campos disponibles luego como variables `blocks.{workingBlock.id}.outputs.*`.
									</p>
								</div>
								<span
									class="rounded-full bg-gray-100 px-3 py-1 text-xs font-medium text-gray-700 dark:bg-gray-800 dark:text-gray-200"
								>
									{workingBlock.agentConfig.outputSchema?.length ?? 0} campo{(workingBlock
										.agentConfig.outputSchema?.length ?? 0) === 1
										? ''
										: 's'}
								</span>
							</summary>

							<div class="mt-5 flex justify-end">
								<button
									type="button"
									class="rounded-xl border border-gray-300 px-3 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 dark:border-gray-700 dark:text-gray-200 dark:hover:bg-gray-800"
									onclick={addOutputField}
								>
									<Plus class="mr-1 inline h-4 w-4" />
									Añadir campo
								</button>
							</div>

							{#if (workingBlock.agentConfig.outputSchema?.length ?? 0) === 0}
								<div
									class="mt-4 rounded-2xl border border-dashed border-gray-300 px-4 py-4 text-sm text-gray-500 dark:border-gray-700 dark:text-gray-400"
								>
									Este bloque todavía no define outputs estructurados. Puedes dejarlo así o añadir
									campos para exponer datos reutilizables al resto del grafo.
								</div>
							{/if}

							{#each workingBlock.agentConfig.outputSchema ?? [] as field, fieldIndex (`${field.key}-${fieldIndex}`)}
								<div class="mt-4 rounded-2xl border border-gray-200 p-4 dark:border-gray-800">
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
						</details>
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

				{#if workingBlock.kind === 'content' || workingBlock.kind === 'check' || workingBlock.kind === 'agent' || workingBlock.kind === 'youtube'}
					<details
						class="rounded-2xl border border-dashed border-gray-300 p-4 dark:border-gray-700"
					>
						<summary
							class="flex cursor-pointer list-none flex-wrap items-center justify-between gap-3 marker:hidden"
						>
							<div>
								<h2 class="text-lg font-semibold text-gray-900 dark:text-white">Branching</h2>
								<p class="text-sm text-gray-500 dark:text-gray-400">
									Ramas condicionales evaluadas antes del siguiente bloque por defecto.
								</p>
							</div>
							<span
								class="rounded-full bg-gray-100 px-3 py-1 text-xs font-medium text-gray-700 dark:bg-gray-800 dark:text-gray-200"
							>
								{workingBlock.branches?.length ?? 0} rama{(workingBlock.branches?.length ?? 0) === 1
									? ''
									: 's'}
							</span>
						</summary>

						<div class="mt-4 flex justify-end">
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
							<p class="mt-4 text-sm text-gray-500 dark:text-gray-400">
								Todavía no hay ramas condicionales.
							</p>
						{:else}
							<div class="mt-4 space-y-3">
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
					</details>
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

					<div class="flex flex-wrap gap-2">
						<button
							disabled={isSaving}
							class="rounded-xl border border-gray-300 px-4 py-2.5 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-50 dark:border-gray-700 dark:text-gray-200 dark:hover:bg-gray-800"
						>
							<Save class="mr-1 inline h-4 w-4" />
							{isSaving ? 'Guardando...' : 'Guardar'}
						</button>
						<button
							name="redirectTo"
							value="flow"
							disabled={isSaving}
							class="bg-primary-600 hover:bg-primary-700 rounded-xl px-4 py-2.5 text-sm font-medium text-white disabled:cursor-not-allowed disabled:opacity-50"
						>
							<Route class="mr-1 inline h-4 w-4" />
							{isSaving ? 'Guardando...' : 'Guardar y volver al mapa'}
						</button>
					</div>
				</div>
			</form>

			<div class="space-y-6">
				<div
					class="rounded-2xl bg-white p-5 shadow-sm ring-1 ring-gray-200/80 dark:bg-gray-900/40 dark:ring-gray-800"
				>
					<div class="flex items-center justify-between gap-3">
						<h2 class="text-base font-semibold text-gray-900 dark:text-white">Conexiones</h2>
						<a
							href={blockFlowHref}
							class="inline-flex items-center rounded-xl border border-gray-300 px-3 py-1.5 text-xs font-medium text-gray-700 hover:bg-gray-50 dark:border-gray-700 dark:text-gray-200 dark:hover:bg-gray-800"
						>
							<Route class="mr-1 h-3.5 w-3.5" />
							Ver en mapa
						</a>
					</div>

					<div class="mt-4 grid gap-3">
						<div
							class="rounded-xl border border-sky-200 bg-sky-50/80 px-3 py-3 dark:border-sky-900/40 dark:bg-sky-950/20"
						>
							<div class="flex items-center justify-between gap-3">
								<p class="text-sm font-semibold text-sky-950 dark:text-sky-50">Entradas</p>
								<span
									class="rounded-full bg-white/70 px-2.5 py-1 text-xs font-semibold text-sky-700 dark:bg-sky-950/60 dark:text-sky-200"
								>
									{currentGraphSummary.incomingBlockIds.length}
								</span>
							</div>
							<div class="mt-2 flex flex-wrap gap-1.5">
								{#if currentGraphSummary.incomingBlockIds.length}
									{#each currentGraphSummary.incomingBlockIds as sourceId (sourceId)}
										<span
											class="rounded-full border border-sky-200 px-2 py-0.5 text-[11px] font-medium text-sky-700 dark:border-sky-900/50 dark:text-sky-200"
										>
											{blockLabel(sourceId)}
										</span>
									{/each}
								{:else}
									<span class="text-xs text-sky-800/80 dark:text-sky-100/80">Sin entradas</span>
								{/if}
							</div>
						</div>
						<div
							class="rounded-xl border border-emerald-200 bg-emerald-50/80 px-3 py-3 dark:border-emerald-900/40 dark:bg-emerald-950/20"
						>
							<div class="flex items-center justify-between gap-3">
								<p class="text-sm font-semibold text-emerald-950 dark:text-emerald-50">Salidas</p>
								<span
									class="rounded-full bg-white/70 px-2.5 py-1 text-xs font-semibold text-emerald-700 dark:bg-emerald-950/60 dark:text-emerald-200"
								>
									{currentGraphSummary.outgoingBlockIds.length}
								</span>
							</div>
							<div class="mt-2 flex flex-wrap gap-1.5">
								{#if currentGraphSummary.outgoingBlockIds.length}
									{#each currentGraphSummary.outgoingBlockIds as targetId (targetId)}
										<span
											class="rounded-full border border-emerald-200 px-2 py-0.5 text-[11px] font-medium text-emerald-700 dark:border-emerald-900/50 dark:text-emerald-200"
										>
											{blockLabel(targetId)}
										</span>
									{/each}
								{:else}
									<span class="text-xs text-emerald-800/80 dark:text-emerald-100/80">
										Sin salidas
									</span>
								{/if}
							</div>
						</div>
					</div>
				</div>

				<div
					class="rounded-2xl bg-white p-6 shadow-sm ring-1 ring-gray-200/80 dark:bg-gray-900/40 dark:ring-gray-800"
				>
					<h2 class="text-lg font-semibold text-gray-900 dark:text-white">
						Qué expone este bloque
					</h2>
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
									{currentBlockContract.state.length} referencia{currentBlockContract.state
										.length === 1
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
					<h2 class="text-lg font-semibold text-gray-900 dark:text-white">
						Referencias disponibles
					</h2>
					<p class="mt-2 text-sm text-gray-500 dark:text-gray-400">
						Úsalas en prompts, markdown y condiciones con la sintaxis
						<code>{'{{variable}}'}</code>. Si un bloque aún no se ha visitado, sus outputs
						resolverán vacío o <code>undefined</code> según el contexto.
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
						href={blockResourcesHref}
						class="mt-4 inline-flex items-center rounded-xl border border-gray-300 px-4 py-2.5 text-sm font-medium text-gray-700 hover:bg-gray-50 dark:border-gray-700 dark:text-gray-200 dark:hover:bg-gray-800"
					>
						Abrir recursos
						<ArrowRight class="ml-1 h-4 w-4" />
					</a>
				</div>
			</div>
		</div>
	</div>
</div>
