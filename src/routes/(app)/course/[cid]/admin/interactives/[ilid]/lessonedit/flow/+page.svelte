<script lang="ts">
	import '@xyflow/svelte/dist/style.css';

	import type { PageProps } from './$types';
	import { deserialize } from '$app/forms';
	import { resolve } from '$app/paths';
	import { page } from '$app/state';
	import {
		Background,
		BackgroundVariant,
		ConnectionLineType,
		Controls,
		MiniMap,
		SvelteFlow,
		type Connection,
		type Viewport
	} from '@xyflow/svelte';
	import { breadcrumb } from '$lib/stores/breadcrumb';
	import {
		createLessonFlowGraph,
		getLessonFlowBranchEdgeId,
		getLessonFlowChoiceHandleId,
		getLessonFlowChoiceEdgeId,
		getLessonFlowEdgeTypeLabel,
		getLessonFlowNextEdgeId,
		getLessonFlowNextHandleId
	} from '$lib/lesson/lessonFlow';
	import LessonFlowNodeComponent from '$lib/components/lesson/flow/LessonFlowNode.svelte';
	import {
		normalizeLessonAgentConfig,
		type LessonAgentExecutionTrigger,
		type LessonAgentInteractionMode,
		lessonConditionOperators,
		type LessonBlock,
		type LessonDefinition
	} from '$lib/types/lesson';
	import type {
		LessonFlowEdge,
		LessonFlowGraph,
		LessonFlowNode as LessonFlowGraphNode
	} from '$lib/types/lessonFlow';
	import {
		ArrowLeft,
		BookOpenText,
		Bot,
		CheckCircle2,
		Flag,
		GitBranch,
		LayoutTemplate,
		ListChecks,
		MoveRight,
		Plus,
		Route,
		Save,
		SquarePen,
		Trash2
	} from 'lucide-svelte';

	type FlowActionSuccess = {
		success: true;
		message: string;
		definition: LessonDefinition;
		blockId?: string;
		deletedBlockId?: string;
	};

	type SelectionState = { kind: 'node'; id: string } | { kind: 'edge'; id: string } | null;

	type ConditionValue = string | number | boolean | null | undefined;

	let { data }: PageProps = $props();

	const nodeTypes = {
		'lesson-block': LessonFlowNodeComponent
	};

	const createButtons = [
		{ kind: 'content', label: 'Contenido', icon: BookOpenText },
		{ kind: 'choice', label: 'Decisión', icon: ListChecks },
		{ kind: 'agent', label: 'Tutor IA', icon: Bot },
		{ kind: 'end', label: 'Final', icon: Flag }
	] as const;

	function cloneLoadedDefinition() {
		return structuredClone(data.definition) as LessonDefinition;
	}

	let draftDefinition: LessonDefinition = $state.raw(cloneLoadedDefinition());
	let flowNodes: LessonFlowGraphNode[] = $state.raw([]);
	let flowEdges: LessonFlowEdge[] = $state.raw([]);
	let flowViewport: Viewport | undefined = $state.raw(undefined);
	let canvasElement: HTMLDivElement | null = $state.raw(null);
	let selection = $state<SelectionState>(null);
	let flowRenderVersion = $state(0);
	let isSubmitting = $state(false);
	let hasUnsavedChanges = $state(false);
	let actionMessage = $state('');
	let actionError = $state('');

	const cid = $derived(page.params.cid);
	const ilid = $derived(page.params.ilid);
	const selectedBlock = $derived.by(() => {
		const currentSelection = selection;
		if (currentSelection?.kind !== 'node') return null;
		return draftDefinition.blocks.find((block) => block.id === currentSelection.id) ?? null;
	});
	const selectedEdge = $derived.by(() => {
		const currentSelection = selection;
		if (currentSelection?.kind !== 'edge') return null;
		return flowEdges.find((edge) => edge.id === currentSelection.id) ?? null;
	});
	const selectedEdgeSourceBlock = $derived(
		selectedEdge
			? (draftDefinition.blocks.find((block) => block.id === selectedEdge.source) ?? null)
			: null
	);
	const selectedEdgeTargetBlock = $derived(
		selectedEdge
			? (draftDefinition.blocks.find((block) => block.id === selectedEdge.target) ?? null)
			: null
	);
	const availableBlocks = $derived(
		draftDefinition.blocks.map((block) => ({
			id: block.id,
			label: `${block.title} · ${block.id}`
		}))
	);
	const availableModels = $derived(data.models);
	const entryBlockTitle = $derived(
		draftDefinition.blocks.find((block) => block.id === draftDefinition.entryBlockId)?.title ??
			draftDefinition.entryBlockId
	);

	function getValidExecutionTriggers(
		interactionMode: LessonAgentInteractionMode
	): Array<{ value: LessonAgentExecutionTrigger; label: string }> {
		return interactionMode === 'none'
			? [{ value: 'on_enter', label: 'Al entrar' }]
			: [{ value: 'on_user_submit', label: 'Al enviar' }];
	}

	function updateSelectedAgentInteractionMode(interactionMode: LessonAgentInteractionMode) {
		updateSelectedBlock((block) => {
			if (block.kind !== 'agent') return;

			block.agentConfig = normalizeLessonAgentConfig({
				...block.agentConfig,
				interactionMode,
				executionTrigger: interactionMode === 'none' ? 'on_enter' : 'on_user_submit'
			});
			block.requiresResponse = interactionMode === 'none' ? false : (block.requiresResponse ?? true);
		});
	}

	function initializeCanvas(
		definition: LessonDefinition,
		nextSelection: SelectionState = { kind: 'node', id: definition.entryBlockId },
		message = '',
		error = ''
	) {
		draftDefinition = structuredClone(definition);
		actionMessage = message;
		actionError = error;
		hasUnsavedChanges = false;
		selection = nextSelection;
		syncCanvasFromDraft();
	}

	function applyActionDraft(
		definition: LessonDefinition,
		nextSelection: SelectionState,
		message: string
	) {
		draftDefinition = structuredClone(definition);
		actionMessage = message;
		actionError = '';
		hasUnsavedChanges = true;
		selection = nextSelection;
		syncCanvasFromDraft();
	}

	function syncCanvasFromDraft() {
		const graph = createLessonFlowGraph(draftDefinition);
		const nextSelection = ensureSelection(graph, selection);

		flowNodes = graph.nodes.map((node) => ({
			...node,
			selected: nextSelection?.kind === 'node' && nextSelection.id === node.id
		}));
		flowEdges = graph.edges.map((edge) => ({
			...edge,
			selected: nextSelection?.kind === 'edge' && nextSelection.id === edge.id
		}));
		selection = nextSelection;
	}

	function ensureSelection(graph: LessonFlowGraph, current: SelectionState): SelectionState {
		if (current?.kind === 'node' && graph.nodes.some((node) => node.id === current.id)) {
			return current;
		}

		if (current?.kind === 'edge' && graph.edges.some((edge) => edge.id === current.id)) {
			return current;
		}

		if (graph.nodes.some((node) => node.id === draftDefinition.entryBlockId)) {
			return { kind: 'node', id: draftDefinition.entryBlockId };
		}

		return graph.nodes[0] ? { kind: 'node', id: graph.nodes[0].id } : null;
	}

	function commitCanvasGraph(): LessonDefinition {
		const nextDefinition = structuredClone(draftDefinition);
		const positions = new Map(flowNodes.map((node) => [node.id, node.position]));

		for (const block of nextDefinition.blocks) {
			const position = positions.get(block.id);
			if (!position) continue;
			block.graph = {
				...(block.graph ?? {}),
				position: {
					x: position.x,
					y: position.y
				}
			};
		}

		draftDefinition = nextDefinition;
		return nextDefinition;
	}

	function mutateDefinition(
		mutator: (definition: LessonDefinition) => void,
		nextSelection = selection
	) {
		const nextDefinition = structuredClone(commitCanvasGraph());
		mutator(nextDefinition);
		draftDefinition = nextDefinition;
		selection = nextSelection;
		hasUnsavedChanges = true;
		actionMessage = '';
		actionError = '';
		syncCanvasFromDraft();
	}

	function selectNode(blockId: string) {
		selection = { kind: 'node', id: blockId };
		syncCanvasFromDraft();
	}

	function selectEdge(edgeId: string) {
		selection = { kind: 'edge', id: edgeId };
		syncCanvasFromDraft();
	}

	function clearSelection() {
		selection = null;
		syncCanvasFromDraft();
	}

	function handleSelectionChange(nodes: LessonFlowGraphNode[], edges: LessonFlowEdge[]) {
		if (nodes.length === 1 && edges.length === 0) {
			selection = { kind: 'node', id: nodes[0].id };
			return;
		}

		if (edges.length === 1 && nodes.length === 0) {
			selection = { kind: 'edge', id: edges[0].id };
			return;
		}

		if (nodes.length === 0 && edges.length === 0) {
			selection = null;
		}
	}

	function updateSelectedBlock(mutator: (block: LessonBlock) => void) {
		if (selection?.kind !== 'node') return;
		const blockId = selection.id;

		mutateDefinition(
			(definition) => {
				const block = definition.blocks.find((candidate) => candidate.id === blockId);
				if (!block) return;
				mutator(block);
			},
			{ kind: 'node', id: blockId }
		);
	}

	function updateSelectedEdge(
		mutator: (definition: LessonDefinition, edge: LessonFlowEdge) => void
	) {
		if (selection?.kind !== 'edge') return;
		const edgeId = selection.id;
		const edge = flowEdges.find((candidate) => candidate.id === edgeId);
		if (!edge) return;

		mutateDefinition(
			(definition) => {
				mutator(definition, edge);
			},
			{ kind: 'edge', id: edgeId }
		);
	}

	function findBlock(definition: LessonDefinition, blockId: string | null | undefined) {
		if (!blockId) return null;
		return definition.blocks.find((candidate) => candidate.id === blockId) ?? null;
	}

	function supportsDynamicIncomingOrder(block: LessonBlock | null | undefined) {
		return block?.kind === 'end';
	}

	function appendIncomingOrder(
		definition: LessonDefinition,
		targetBlockId: string,
		edgeId: string | null
	) {
		if (!edgeId) return;
		const targetBlock = findBlock(definition, targetBlockId);
		if (!supportsDynamicIncomingOrder(targetBlock)) return;

		const nextOrder = [
			...(targetBlock.graph?.incomingOrder ?? []).filter((candidate) => candidate !== edgeId),
			edgeId
		];

		targetBlock.graph = {
			...(targetBlock.graph ?? {}),
			incomingOrder: nextOrder
		};
	}

	function removeIncomingOrder(
		definition: LessonDefinition,
		targetBlockId: string | null | undefined,
		edgeId: string | null
	) {
		if (!targetBlockId || !edgeId) return;
		const targetBlock = findBlock(definition, targetBlockId);
		if (!supportsDynamicIncomingOrder(targetBlock)) return;

		const nextOrder = (targetBlock.graph?.incomingOrder ?? []).filter(
			(candidate) => candidate !== edgeId
		);

		targetBlock.graph = {
			...(targetBlock.graph ?? {}),
			...(nextOrder.length > 0 ? { incomingOrder: nextOrder } : {})
		};

		if (nextOrder.length === 0 && !targetBlock.graph?.position) {
			delete targetBlock.graph;
		} else if (nextOrder.length === 0 && targetBlock.graph) {
			delete targetBlock.graph.incomingOrder;
		}
	}

	function getEdgeIdFromConnection(connection: Connection): string | null {
		if (!connection.source) return null;

		if (connection.sourceHandle?.startsWith('out:choice:')) {
			const optionId = connection.sourceHandle.slice(getLessonFlowChoiceHandleId('').length);
			return optionId ? getLessonFlowChoiceEdgeId(connection.source, optionId) : null;
		}

		if (connection.sourceHandle?.startsWith('out:branch:')) {
			const branchIndex = Number(connection.sourceHandle.split(':').at(-1) ?? '-1');
			return Number.isInteger(branchIndex) && branchIndex >= 0
				? getLessonFlowBranchEdgeId(connection.source, branchIndex)
				: null;
		}

		return getLessonFlowNextEdgeId(connection.source);
	}

	function addBranchToSelectedBlock() {
		if (!selectedBlock || (selectedBlock.kind !== 'content' && selectedBlock.kind !== 'agent'))
			return;

		updateSelectedBlock((block) => {
			if (block.kind !== 'content' && block.kind !== 'agent') return;

			block.branches = [
				...(block.branches ?? []),
				{
					label: `Rama ${(block.branches?.length ?? 0) + 1}`,
					targetBlockId: draftDefinition.entryBlockId,
					condition: {
						source: 'session.attemptNumber',
						operator: 'equals',
						value: 1
					}
				}
			];
		});
	}

	function addChoiceOptionToSelectedBlock() {
		if (!selectedBlock || selectedBlock.kind !== 'choice') return;

		updateSelectedBlock((block) => {
			if (block.kind !== 'choice') return;
			const optionNumber = block.options.length + 1;
			block.options = [
				...block.options,
				{
					id: `option_${optionNumber}`,
					label: `Opción ${optionNumber}`,
					value: `option_${optionNumber}`,
					description: '',
					targetBlockId: ''
				}
			];
		});
	}

	function removeSelectedBranch() {
		if (selection?.kind !== 'edge' || selectedEdge?.data?.edgeType !== 'branch') return;
		const branchIndex = selectedEdge.data.branchIndex;
		if (branchIndex === undefined) return;

		updateSelectedEdge((definition, edge) => {
			removeIncomingOrder(definition, edge.target, edge.id);
			const block = definition.blocks.find((candidate) => candidate.id === edge.source);
			if (!block || (block.kind !== 'content' && block.kind !== 'agent')) return;
			block.branches = (block.branches ?? []).filter((_, index) => index !== branchIndex);
		});
	}

	function removeSelectedChoiceOption() {
		if (selection?.kind !== 'edge' || selectedEdge?.data?.edgeType !== 'choice-option') return;
		const optionId = selectedEdge.data.optionId;
		if (!optionId) return;

		updateSelectedEdge((definition, edge) => {
			removeIncomingOrder(definition, edge.target, edge.id);
			const block = definition.blocks.find((candidate) => candidate.id === edge.source);
			if (!block || block.kind !== 'choice') return;
			block.options = block.options.filter((option) => option.id !== optionId);
		});
	}

	function clearSelectedNextEdge() {
		if (selection?.kind !== 'edge' || selectedEdge?.data?.edgeType !== 'next') return;

		updateSelectedEdge((definition, edge) => {
			removeIncomingOrder(definition, edge.target, edge.id);
			const block = definition.blocks.find((candidate) => candidate.id === edge.source);
			if (!block || block.kind === 'choice' || block.kind === 'end') return;
			block.next = null;
		});
	}

	function clearSelectedEdgeConnection() {
		if (selection?.kind !== 'edge' || !selectedEdge) return;

		updateSelectedEdge((definition, edge) => {
			removeIncomingOrder(definition, edge.target, edge.id);
			const block = definition.blocks.find((candidate) => candidate.id === edge.source);
			if (!block) return;

			if (edge.data?.edgeType === 'next') {
				if (block.kind === 'choice' || block.kind === 'end') return;
				block.next = null;
				return;
			}

			if (edge.data?.edgeType === 'branch') {
				if (block.kind !== 'content' && block.kind !== 'agent') return;
				const branchIndex = edge.data.branchIndex;
				if (branchIndex === undefined || !block.branches?.[branchIndex]) return;
				block.branches[branchIndex].targetBlockId = '';
				return;
			}

			if (block.kind !== 'choice') return;
			const optionId = edge.data?.optionId;
			const option = block.options.find((candidate) => candidate.id === optionId);
			if (!option) return;
			option.targetBlockId = '';
		});
	}

	function handleConnect(connection: Connection) {
		if (!connection.source || !connection.target) return;

		const sourceBlock = draftDefinition.blocks.find((block) => block.id === connection.source);
		const targetBlock = draftDefinition.blocks.find((block) => block.id === connection.target);
		if (!sourceBlock) return;
		if (!targetBlock) return;

		if (sourceBlock.kind === 'end') {
			actionError = 'Un bloque final no puede abrir nuevas salidas.';
			actionMessage = '';
			return;
		}

		const edgeId = getEdgeIdFromConnection(connection);
		const previousEdge = edgeId ? (flowEdges.find((edge) => edge.id === edgeId) ?? null) : null;
		const previousTargetId = previousEdge?.target ?? null;
		mutateDefinition(
			(definition) => {
				const block = definition.blocks.find((candidate) => candidate.id === connection.source);
				if (!block || block.kind === 'end') return;

				if (block.kind === 'choice') {
					if (!connection.sourceHandle?.startsWith('out:choice:')) return;
					const optionId = connection.sourceHandle.slice(getLessonFlowChoiceHandleId('').length);
					const option = block.options.find((candidate) => candidate.id === optionId);
					if (!option) return;
					option.targetBlockId = connection.target;
					return;
				}

				if (!connection.sourceHandle || connection.sourceHandle === getLessonFlowNextHandleId()) {
					block.next = connection.target;
					return;
				}

				if (connection.sourceHandle.startsWith('out:branch:')) {
					const branchIndex = Number(connection.sourceHandle.split(':').at(-1) ?? '-1');
					if (!Number.isInteger(branchIndex) || branchIndex < 0 || !block.branches?.[branchIndex]) {
						return;
					}
					block.branches[branchIndex].targetBlockId = connection.target;
				}

				if (previousTargetId && previousTargetId !== connection.target) {
					removeIncomingOrder(definition, previousTargetId, edgeId);
				}

				if (supportsDynamicIncomingOrder(targetBlock)) {
					appendIncomingOrder(definition, connection.target, edgeId);
				}
			},
			{ kind: 'node', id: connection.source }
		);
	}

	function centerCanvas() {
		flowViewport = undefined;
		flowRenderVersion += 1;
	}

	function getSuggestedPosition() {
		const viewport = flowViewport ?? { x: 0, y: 0, zoom: 1 };
		const width = canvasElement?.clientWidth ?? 960;
		const height = canvasElement?.clientHeight ?? 640;
		const baseX = (width / 2 - viewport.x) / viewport.zoom;
		const baseY = (height / 2 - viewport.y) / viewport.zoom;
		const offset = draftDefinition.blocks.length * 16;

		return {
			x: Math.round(baseX + offset),
			y: Math.round(baseY + offset / 2)
		};
	}

	async function postAction(
		actionName: 'saveFlow' | 'createBlock' | 'deleteBlock',
		formData: FormData
	) {
		const response = await fetch(`?/${actionName}`, {
			method: 'POST',
			headers: {
				'x-sveltekit-action': 'true'
			},
			body: formData
		});

		const result = deserialize(await response.text());

		if (result.type === 'failure') {
			throw new Error(
				(result.data as { error?: string } | null)?.error || 'La acción no pudo completarse.'
			);
		}

		if (result.type !== 'success') {
			throw new Error('La respuesta del servidor no fue válida.');
		}

		return result.data as FlowActionSuccess;
	}

	async function saveFlow() {
		isSubmitting = true;
		actionError = '';
		actionMessage = '';

		try {
			const synced = commitCanvasGraph();
			const formData = new FormData();
			formData.set('definitionJson', JSON.stringify(synced));
			const result = await postAction('saveFlow', formData);
			initializeCanvas(result.definition, selection, result.message);
		} catch (errorValue) {
			actionError =
				errorValue instanceof Error ? errorValue.message : 'No se pudo guardar el editor visual.';
		} finally {
			isSubmitting = false;
		}
	}

	async function createBlock(kind: (typeof createButtons)[number]['kind']) {
		isSubmitting = true;
		actionError = '';
		actionMessage = '';

		try {
			const synced = commitCanvasGraph();
			const position = getSuggestedPosition();
			const formData = new FormData();
			formData.set('definitionJson', JSON.stringify(synced));
			formData.set('kind', kind);
			formData.set('positionX', String(position.x));
			formData.set('positionY', String(position.y));

			const result = await postAction('createBlock', formData);
			applyActionDraft(
				result.definition,
				result.blockId ? { kind: 'node', id: result.blockId } : selection,
				result.message
			);
		} catch (errorValue) {
			actionError =
				errorValue instanceof Error ? errorValue.message : 'No se pudo crear el bloque.';
		} finally {
			isSubmitting = false;
		}
	}

	async function deleteSelectedBlock() {
		if (!selectedBlock) return;
		if (
			!window.confirm(`Vas a eliminar "${selectedBlock.title}". Esta acción no se puede deshacer.`)
		) {
			return;
		}

		isSubmitting = true;
		actionError = '';
		actionMessage = '';

		try {
			const synced = commitCanvasGraph();
			const formData = new FormData();
			formData.set('definitionJson', JSON.stringify(synced));
			formData.set('blockId', selectedBlock.id);

			const result = await postAction('deleteBlock', formData);
			applyActionDraft(
				result.definition,
				{ kind: 'node', id: result.definition.entryBlockId },
				result.message
			);
		} catch (errorValue) {
			actionError =
				errorValue instanceof Error ? errorValue.message : 'No se pudo eliminar el bloque.';
		} finally {
			isSubmitting = false;
		}
	}

	function setEntryBlock(blockId: string) {
		mutateDefinition(
			(definition) => {
				definition.entryBlockId = blockId;
			},
			{ kind: 'node', id: blockId }
		);
	}

	function updateEdgeTarget(nextTargetId: string) {
		if (!selectedEdge) return;

		updateSelectedEdge((definition, edge) => {
			const sourceBlock = definition.blocks.find((block) => block.id === edge.source);
			if (!sourceBlock) return;

			if (edge.data?.edgeType === 'next') {
				if (sourceBlock.kind === 'choice' || sourceBlock.kind === 'end') return;
				sourceBlock.next = nextTargetId || null;
				return;
			}

			if (edge.data?.edgeType === 'branch') {
				if (sourceBlock.kind !== 'content' && sourceBlock.kind !== 'agent') return;
				const branchIndex = edge.data.branchIndex;
				if (branchIndex === undefined || !sourceBlock.branches?.[branchIndex]) return;
				sourceBlock.branches[branchIndex].targetBlockId = nextTargetId;
				return;
			}

			if (edge.data?.edgeType === 'choice-option') {
				if (sourceBlock.kind !== 'choice') return;
				const optionId = edge.data.optionId;
				const option = sourceBlock.options.find((candidate) => candidate.id === optionId);
				if (!option) return;
				option.targetBlockId = nextTargetId;
			}
		});
	}

	function updateConditionValue(value: string): ConditionValue {
		if (value === '') return '';
		if (value === 'true') return true;
		if (value === 'false') return false;
		const numericValue = Number(value);
		return Number.isFinite(numericValue) && value.trim() !== '' ? numericValue : value;
	}

	function isEditableKeyboardTarget(target: EventTarget | null) {
		if (!(target instanceof HTMLElement)) return false;
		return Boolean(target.closest('input, textarea, select, [contenteditable="true"]'));
	}

	function handleWindowKeydown(event: KeyboardEvent) {
		if (event.key !== 'Delete' && event.key !== 'Del') return;
		if (selection?.kind !== 'edge' || !selectedEdge || isSubmitting) return;
		if (isEditableKeyboardTarget(event.target)) return;

		event.preventDefault();
		clearSelectedEdgeConnection();
	}

	$effect(() => {
		breadcrumb.set([
			{ label: 'Inicio', href: '/' },
			{ label: 'Cursos', href: '/course' },
			{ label: 'Curso', href: `/course/${page.params.cid}` },
			{ label: 'Interactivos', href: `/course/${page.params.cid}/admin/interactives` },
			{
				label: data.activity.name,
				href: `/course/${page.params.cid}/admin/interactives/${page.params.ilid}`
			},
			{
				label: 'Editor lesson',
				href: `/course/${page.params.cid}/admin/interactives/${page.params.ilid}/lessonedit`
			},
			{ label: 'Editor visual' }
		]);
	});

	initializeCanvas(cloneLoadedDefinition());
</script>

<svelte:window onkeydown={handleWindowKeydown} />

<div class="lesson-flow-shell space-y-6">
	<div
		class="rounded-[30px] bg-linear-to-br from-stone-100 via-orange-50 to-white p-6 shadow-sm ring-1 ring-stone-200/80 dark:from-stone-950 dark:via-gray-900 dark:to-gray-900 dark:ring-stone-800"
	>
		<div class="flex flex-col gap-5 xl:flex-row xl:items-end xl:justify-between">
			<div class="max-w-3xl">
				<div class="mb-4 flex items-center gap-3">
					<div class="bg-primary-500/10 text-primary-700 dark:text-primary-300 rounded-2xl p-3">
						<LayoutTemplate class="h-5 w-5" />
					</div>
					<div>
						<p
							class="text-sm font-medium tracking-[0.18em] text-stone-500 uppercase dark:text-stone-400"
						>
							Autoría visual
						</p>
						<h1 class="text-2xl font-semibold text-stone-900 dark:text-white">
							Editor avanzado de {data.activity.name}
						</h1>
					</div>
				</div>

				<p class="text-sm leading-6 text-stone-600 dark:text-stone-300">
					Organiza el recorrido de la lesson como un mapa visual. Aquí ajustas la estructura, las
					rutas y las decisiones; el contenido rico de cada bloque sigue en su editor especializado.
				</p>

				<div class="mt-4 flex flex-wrap gap-2">
					<span
						class="rounded-full bg-white/85 px-3 py-1.5 text-xs font-medium text-stone-600 ring-1 ring-stone-200 dark:bg-gray-900/60 dark:text-stone-300 dark:ring-stone-700"
					>
						<Route class="mr-1 inline h-3.5 w-3.5" />
						Entrada: {entryBlockTitle}
					</span>
					<span
						class="rounded-full bg-white/85 px-3 py-1.5 text-xs font-medium text-stone-600 ring-1 ring-stone-200 dark:bg-gray-900/60 dark:text-stone-300 dark:ring-stone-700"
					>
						{draftDefinition.blocks.length} bloque{draftDefinition.blocks.length === 1 ? '' : 's'}
					</span>
					<span
						class="rounded-full bg-white/85 px-3 py-1.5 text-xs font-medium text-stone-600 ring-1 ring-stone-200 dark:bg-gray-900/60 dark:text-stone-300 dark:ring-stone-700"
					>
						{flowEdges.length} conexión{flowEdges.length === 1 ? '' : 'es'}
					</span>
				</div>
			</div>

			<div class="flex flex-wrap gap-2">
				<a
					href={resolve(`/course/${cid}/admin/interactives/${ilid}/lessonedit`)}
					class="rounded-2xl border border-stone-300 bg-white px-4 py-2.5 text-sm font-medium text-stone-700 hover:bg-stone-50 dark:border-stone-700 dark:bg-gray-950/40 dark:text-stone-200 dark:hover:bg-gray-800"
				>
					<ArrowLeft class="mr-1 inline h-4 w-4" />
					Volver a portada
				</a>
				<a
					href={resolve(`/course/${cid}/admin/interactives/${ilid}`)}
					class="rounded-2xl border border-stone-300 bg-white px-4 py-2.5 text-sm font-medium text-stone-700 hover:bg-stone-50 dark:border-stone-700 dark:bg-gray-950/40 dark:text-stone-200 dark:hover:bg-gray-800"
				>
					Ficha de actividad
				</a>
			</div>
		</div>
	</div>

	<div class="grid gap-6 xl:grid-cols-[minmax(0,1fr)_380px]">
		<div class="space-y-4">
			<div
				class="rounded-[30px] bg-white p-5 shadow-sm ring-1 ring-stone-200/80 dark:bg-gray-900/40 dark:ring-stone-800"
			>
				<div class="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
					<div>
						<h2 class="text-lg font-semibold text-stone-900 dark:text-white">Mapa de bloques</h2>
						<p class="text-sm text-stone-500 dark:text-stone-400">
							Crea bloques, mueve nodos y revisa cada ruta desde el inspector lateral.
						</p>
					</div>

					<div class="flex flex-wrap gap-2">
						{#each createButtons as button (button.kind)}
							<button
								type="button"
								class="rounded-2xl border border-stone-300 px-3 py-2 text-sm font-medium text-stone-700 hover:bg-stone-50 disabled:opacity-50 dark:border-stone-700 dark:text-stone-200 dark:hover:bg-gray-800"
								onclick={() => createBlock(button.kind)}
								disabled={isSubmitting}
							>
								<button.icon class="mr-1 inline h-4 w-4" />
								{button.label}
							</button>
						{/each}

						<button
							type="button"
							class="rounded-2xl border border-stone-300 px-3 py-2 text-sm font-medium text-stone-700 hover:bg-stone-50 dark:border-stone-700 dark:text-stone-200 dark:hover:bg-gray-800"
							onclick={centerCanvas}
						>
							<MoveRight class="mr-1 inline h-4 w-4" />
							Centrar vista
						</button>

						<button
							type="button"
							class="bg-primary-600 hover:bg-primary-700 rounded-2xl px-4 py-2.5 text-sm font-medium text-white disabled:opacity-50"
							onclick={saveFlow}
							disabled={isSubmitting}
						>
							<Save class="mr-1 inline h-4 w-4" />
							Guardar mapa
						</button>
					</div>
				</div>

				<div class="mt-4 flex flex-wrap gap-2 text-xs text-stone-500 dark:text-stone-400">
					<span
						class="rounded-full bg-amber-50 px-3 py-1.5 text-amber-800 ring-1 ring-amber-200 dark:bg-amber-950/30 dark:text-amber-200 dark:ring-amber-900/40"
					>
						Contenido: recorrido principal
					</span>
					<span
						class="rounded-full bg-teal-50 px-3 py-1.5 text-teal-800 ring-1 ring-teal-200 dark:bg-teal-950/30 dark:text-teal-200 dark:ring-teal-900/40"
					>
						Decisión: opciones de salida
					</span>
					<span
						class="rounded-full bg-indigo-50 px-3 py-1.5 text-indigo-800 ring-1 ring-indigo-200 dark:bg-indigo-950/30 dark:text-indigo-200 dark:ring-indigo-900/40"
					>
						Tutor IA: diálogo y branching
					</span>
				</div>

				{#if actionError}
					<div
						class="mt-4 rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800 dark:border-red-900/40 dark:bg-red-950/20 dark:text-red-200"
					>
						{actionError}
					</div>
				{/if}

				{#if actionMessage}
					<div
						class="mt-4 rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800 dark:border-emerald-900/40 dark:bg-emerald-950/20 dark:text-emerald-200"
					>
						<CheckCircle2 class="mr-1 inline h-4 w-4" />
						{actionMessage}
					</div>
				{:else if hasUnsavedChanges}
					<div
						class="mt-4 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800 dark:border-amber-900/40 dark:bg-amber-950/20 dark:text-amber-200"
					>
						Hay cambios sin guardar en el mapa visual.
					</div>
				{/if}
			</div>

			<div
				bind:this={canvasElement}
				class="h-[72vh] min-h-[620px] overflow-hidden rounded-[30px] bg-white shadow-sm ring-1 ring-stone-200/80 dark:bg-gray-900/40 dark:ring-stone-800"
			>
				{#key flowRenderVersion}
					<SvelteFlow
						bind:nodes={flowNodes}
						bind:edges={flowEdges}
						bind:viewport={flowViewport}
						{nodeTypes}
						class="h-full w-full"
						style="background: radial-gradient(circle at top left, rgba(255,246,237,0.85), rgba(246,244,240,0.9) 38%, rgba(255,255,255,0.98));"
						fitView
						minZoom={0.35}
						maxZoom={1.7}
						panOnDrag={true}
						panOnScroll={true}
						zoomOnScroll={false}
						selectNodesOnDrag={false}
						connectionLineType={ConnectionLineType.SmoothStep}
						onnodeclick={({ node }) => selectNode(node.id)}
						onedgeclick={({ edge }) => selectEdge(edge.id)}
						onpaneclick={clearSelection}
						onselectionchange={({ nodes, edges }) =>
							handleSelectionChange(nodes as LessonFlowGraphNode[], edges as LessonFlowEdge[])}
						onnodedragstop={() => {
							commitCanvasGraph();
							hasUnsavedChanges = true;
							actionMessage = '';
							actionError = '';
						}}
						onconnect={handleConnect}
					>
						<Background
							bgColor="#fbf7f1"
							patternColor="#d6c8b8"
							variant={BackgroundVariant.Dots}
							gap={28}
							size={1.05}
						/>
						<Controls />
						<MiniMap />
					</SvelteFlow>
				{/key}
			</div>
		</div>

		<aside
			class="rounded-[30px] bg-white p-5 shadow-sm ring-1 ring-stone-200/80 dark:bg-gray-900/40 dark:ring-stone-800"
		>
			<div class="mb-5">
				<p
					class="text-xs font-semibold tracking-[0.18em] text-stone-500 uppercase dark:text-stone-400"
				>
					Inspector
				</p>
				<h2 class="mt-2 text-lg font-semibold text-stone-900 dark:text-white">
					{#if selectedBlock}
						{selectedBlock.title}
					{:else if selectedEdge}
						{selectedEdge.label ??
							getLessonFlowEdgeTypeLabel(selectedEdge.data?.edgeType ?? 'next')}
					{:else}
						Sin selección
					{/if}
				</h2>
				<p class="mt-2 text-sm leading-6 text-stone-500 dark:text-stone-400">
					{#if selectedBlock}
						Ajusta los campos esenciales del bloque y abre el editor profundo si necesitas trabajar
						el contenido completo.
					{:else if selectedEdge}
						Edita la ruta seleccionada, su destino y los metadatos que la acompañan.
					{:else}
						Selecciona un bloque o una conexión en el canvas para editarla aquí.
					{/if}
				</p>
			</div>

			{#if selectedBlock}
				<div class="space-y-5">
					<div
						class="rounded-2xl border border-stone-200 bg-stone-50/80 px-4 py-4 dark:border-stone-800 dark:bg-stone-950/30"
					>
						<div class="flex items-center justify-between gap-3">
							<div>
								<p
									class="text-xs font-semibold tracking-[0.14em] text-stone-500 uppercase dark:text-stone-400"
								>
									ID técnico
								</p>
								<p class="mt-1 font-mono text-sm text-stone-700 dark:text-stone-200">
									{selectedBlock.id}
								</p>
							</div>
							{#if draftDefinition.entryBlockId === selectedBlock.id}
								<span
									class="rounded-full bg-emerald-100 px-2.5 py-1 text-xs font-medium text-emerald-700 dark:bg-emerald-950/30 dark:text-emerald-300"
								>
									Entrada actual
								</span>
							{/if}
						</div>
					</div>

					<label class="block">
						<span class="mb-2 block text-sm font-medium text-stone-700 dark:text-stone-300"
							>Título</span
						>
						<input
							class="w-full rounded-2xl border border-stone-300 bg-white px-3 py-2.5 text-sm dark:border-stone-700 dark:bg-gray-950 dark:text-white"
							value={selectedBlock.title}
							oninput={(event) =>
								updateSelectedBlock((block) => {
									block.title = (event.currentTarget as HTMLInputElement).value;
								})}
						/>
					</label>

					<div class="grid gap-4 md:grid-cols-2">
						<div class="rounded-2xl border border-stone-200 px-4 py-3 dark:border-stone-800">
							<p
								class="text-xs font-semibold tracking-[0.14em] text-stone-500 uppercase dark:text-stone-400"
							>
								Tipo
							</p>
							<p class="mt-1 text-sm font-medium text-stone-900 dark:text-white">
								{selectedBlock.kind === 'content'
									? 'Contenido'
									: selectedBlock.kind === 'choice'
										? 'Decisión'
										: selectedBlock.kind === 'agent'
											? 'Tutor IA'
											: 'Final'}
							</p>
						</div>
						<div class="rounded-2xl border border-stone-200 px-4 py-3 dark:border-stone-800">
							<p
								class="text-xs font-semibold tracking-[0.14em] text-stone-500 uppercase dark:text-stone-400"
							>
								Posición
							</p>
							<p class="mt-1 text-sm font-medium text-stone-900 dark:text-white">
								{Math.round(selectedBlock.graph?.position?.x ?? 0)},
								{Math.round(selectedBlock.graph?.position?.y ?? 0)}
							</p>
						</div>
					</div>

					{#if draftDefinition.entryBlockId !== selectedBlock.id}
						<button
							type="button"
							class="w-full rounded-2xl border border-emerald-300 px-4 py-2.5 text-sm font-medium text-emerald-700 hover:bg-emerald-50 dark:border-emerald-900/40 dark:text-emerald-300 dark:hover:bg-emerald-950/20"
							onclick={() => setEntryBlock(selectedBlock.id)}
						>
							<Route class="mr-1 inline h-4 w-4" />
							Marcar como bloque de entrada
						</button>
					{/if}

					{#if selectedBlock.kind === 'content'}
						<label class="block">
							<span class="mb-2 block text-sm font-medium text-stone-700 dark:text-stone-300"
								>Texto del botón</span
							>
							<input
								class="w-full rounded-2xl border border-stone-300 bg-white px-3 py-2.5 text-sm dark:border-stone-700 dark:bg-gray-950 dark:text-white"
								value={selectedBlock.continueLabel ?? ''}
								oninput={(event) =>
									updateSelectedBlock((block) => {
										if (block.kind !== 'content') return;
										block.continueLabel = (event.currentTarget as HTMLInputElement).value;
									})}
							/>
						</label>

						<label class="block">
							<span class="mb-2 block text-sm font-medium text-stone-700 dark:text-stone-300"
								>Siguiente bloque</span
							>
							<select
								class="w-full rounded-2xl border border-stone-300 bg-white px-3 py-2.5 text-sm dark:border-stone-700 dark:bg-gray-950 dark:text-white"
								value={selectedBlock.next ?? ''}
								onchange={(event) =>
									updateSelectedBlock((block) => {
										if (block.kind !== 'content') return;
										block.next = (event.currentTarget as HTMLSelectElement).value || null;
									})}
							>
								<option value="">Sin siguiente</option>
								{#each availableBlocks as blockOption (blockOption.id)}
									<option value={blockOption.id}>{blockOption.label}</option>
								{/each}
							</select>
						</label>

						<div
							class="rounded-2xl border border-dashed border-stone-300 px-4 py-4 dark:border-stone-700"
						>
							<div class="flex items-center justify-between gap-3">
								<div>
									<p class="text-sm font-medium text-stone-900 dark:text-white">
										Ramas condicionales
									</p>
									<p class="text-xs text-stone-500 dark:text-stone-400">
										{selectedBlock.branches?.length ?? 0} rama{(selectedBlock.branches?.length ??
											0) === 1
											? ''
											: 's'} activa{(selectedBlock.branches?.length ?? 0) === 1 ? '' : 's'}
									</p>
								</div>
								<button
									type="button"
									class="rounded-2xl border border-stone-300 px-3 py-2 text-sm font-medium text-stone-700 hover:bg-stone-50 dark:border-stone-700 dark:text-stone-200 dark:hover:bg-gray-800"
									onclick={addBranchToSelectedBlock}
								>
									<GitBranch class="mr-1 inline h-4 w-4" />
									Añadir rama
								</button>
							</div>
						</div>
					{:else if selectedBlock.kind === 'choice'}
						<label class="block">
							<span class="mb-2 block text-sm font-medium text-stone-700 dark:text-stone-300"
								>Clave de salida</span
							>
							<input
								class="w-full rounded-2xl border border-stone-300 bg-white px-3 py-2.5 font-mono text-sm dark:border-stone-700 dark:bg-gray-950 dark:text-white"
								value={selectedBlock.outputKey ?? ''}
								oninput={(event) =>
									updateSelectedBlock((block) => {
										if (block.kind !== 'choice') return;
										block.outputKey = (event.currentTarget as HTMLInputElement).value;
									})}
							/>
						</label>

						<div
							class="rounded-2xl border border-dashed border-stone-300 px-4 py-4 dark:border-stone-700"
						>
							<div class="flex items-center justify-between gap-3">
								<div>
									<p class="text-sm font-medium text-stone-900 dark:text-white">Opciones</p>
									<p class="text-xs text-stone-500 dark:text-stone-400">
										Cada opción nueva aparece sin cable. Arrastra desde su salida o selecciona su
										conexión para editarla.
									</p>
								</div>
								<button
									type="button"
									class="rounded-2xl border border-stone-300 px-3 py-2 text-sm font-medium text-stone-700 hover:bg-stone-50 dark:border-stone-700 dark:text-stone-200 dark:hover:bg-gray-800"
									onclick={addChoiceOptionToSelectedBlock}
								>
									<Plus class="mr-1 inline h-4 w-4" />
									Añadir opción
								</button>
							</div>
						</div>
					{:else if selectedBlock.kind === 'agent'}
						<label class="block">
							<span class="mb-2 block text-sm font-medium text-stone-700 dark:text-stone-300"
								>Modelo</span
							>
							<select
								class="w-full rounded-2xl border border-stone-300 bg-white px-3 py-2.5 text-sm dark:border-stone-700 dark:bg-gray-950 dark:text-white"
								value={selectedBlock.agentConfig.model ?? ''}
								onchange={(event) =>
									updateSelectedBlock((block) => {
										if (block.kind !== 'agent') return;
										block.agentConfig.model =
											(event.currentTarget as HTMLSelectElement).value || null;
									})}
							>
								<option value="">{data.defaultModel} · modelo por defecto</option>
								{#each availableModels as model (model.name)}
									<option value={model.name}>{model.name} ({model.provider})</option>
								{/each}
							</select>
						</label>

						<label class="block">
							<span class="mb-2 block text-sm font-medium text-stone-700 dark:text-stone-300"
								>Modo de interacción</span
							>
							<select
								class="w-full rounded-2xl border border-stone-300 bg-white px-3 py-2.5 text-sm dark:border-stone-700 dark:bg-gray-950 dark:text-white"
								value={selectedBlock.agentConfig.interactionMode}
								onchange={(event) =>
									updateSelectedAgentInteractionMode(
										(event.currentTarget as HTMLSelectElement)
											.value as LessonAgentInteractionMode
									)}
							>
								<option value="single_turn">Turno guiado</option>
								<option value="multi_turn">Mini chat</option>
								<option value="none">Generación automática</option>
							</select>
						</label>

						<label class="block">
							<span class="mb-2 block text-sm font-medium text-stone-700 dark:text-stone-300"
								>Disparo</span
							>
							<select
								class="w-full rounded-2xl border border-stone-300 bg-white px-3 py-2.5 text-sm dark:border-stone-700 dark:bg-gray-950 dark:text-white"
								value={selectedBlock.agentConfig.executionTrigger}
								onchange={(event) =>
									updateSelectedBlock((block) => {
										if (block.kind !== 'agent') return;
										block.agentConfig.executionTrigger = (
											event.currentTarget as HTMLSelectElement
										).value as LessonAgentExecutionTrigger;
									})}
							>
								{#each getValidExecutionTriggers(selectedBlock.agentConfig.interactionMode) as trigger (trigger.value)}
									<option value={trigger.value}>{trigger.label}</option>
								{/each}
							</select>
						</label>

						<div class="grid gap-4 md:grid-cols-2">
							<label class="block">
								<span class="mb-2 block text-sm font-medium text-stone-700 dark:text-stone-300"
									>Botón continuar</span
								>
								<input
									class="w-full rounded-2xl border border-stone-300 bg-white px-3 py-2.5 text-sm dark:border-stone-700 dark:bg-gray-950 dark:text-white"
									value={selectedBlock.agentConfig.continueLabel ?? ''}
									oninput={(event) =>
										updateSelectedBlock((block) => {
											if (block.kind !== 'agent') return;
											block.agentConfig.continueLabel = (
												event.currentTarget as HTMLInputElement
											).value;
										})}
								/>
							</label>

							{#if selectedBlock.agentConfig.interactionMode !== 'none'}
								<label
									class="flex items-center gap-3 rounded-2xl border border-stone-200 px-4 py-3 dark:border-stone-800"
								>
									<input
										type="checkbox"
										class="text-primary-600 h-4 w-4 rounded border-stone-300"
										checked={selectedBlock.requiresResponse ?? true}
										onchange={(event) =>
											updateSelectedBlock((block) => {
												if (block.kind !== 'agent') return;
												block.requiresResponse = (
													event.currentTarget as HTMLInputElement
												).checked;
											})}
									/>
									<div>
										<p class="text-sm font-medium text-stone-900 dark:text-white">
											Requiere respuesta
										</p>
										<p class="text-xs text-stone-500 dark:text-stone-400">
											Impide avanzar si el estudiante aún no ha intervenido.
										</p>
									</div>
								</label>
							{:else}
								<div class="rounded-2xl border border-sky-200 bg-sky-50 px-4 py-3 text-sm text-sky-800 dark:border-sky-900/40 dark:bg-sky-950/20 dark:text-sky-200">
									Este bloque se ejecutará automáticamente al entrar y mostrará la respuesta generada sin caja de texto.
								</div>
							{/if}
						</div>

						<label class="block">
							<span class="mb-2 block text-sm font-medium text-stone-700 dark:text-stone-300"
								>Siguiente bloque</span
							>
							<select
								class="w-full rounded-2xl border border-stone-300 bg-white px-3 py-2.5 text-sm dark:border-stone-700 dark:bg-gray-950 dark:text-white"
								value={selectedBlock.next ?? ''}
								onchange={(event) =>
									updateSelectedBlock((block) => {
										if (block.kind !== 'agent') return;
										block.next = (event.currentTarget as HTMLSelectElement).value || null;
									})}
							>
								<option value="">Sin siguiente</option>
								{#each availableBlocks as blockOption (blockOption.id)}
									<option value={blockOption.id}>{blockOption.label}</option>
								{/each}
							</select>
						</label>

						<div
							class="rounded-2xl border border-dashed border-stone-300 px-4 py-4 dark:border-stone-700"
						>
							<div class="flex items-center justify-between gap-3">
								<div>
									<p class="text-sm font-medium text-stone-900 dark:text-white">
										Ramas condicionales
									</p>
									<p class="text-xs text-stone-500 dark:text-stone-400">
										{selectedBlock.branches?.length ?? 0} rama{(selectedBlock.branches?.length ??
											0) === 1
											? ''
											: 's'} activa{(selectedBlock.branches?.length ?? 0) === 1 ? '' : 's'}
									</p>
								</div>
								<button
									type="button"
									class="rounded-2xl border border-stone-300 px-3 py-2 text-sm font-medium text-stone-700 hover:bg-stone-50 dark:border-stone-700 dark:text-stone-200 dark:hover:bg-gray-800"
									onclick={addBranchToSelectedBlock}
								>
									<GitBranch class="mr-1 inline h-4 w-4" />
									Añadir rama
								</button>
							</div>
						</div>
					{:else if selectedBlock.kind === 'end'}
						<label class="block">
							<span class="mb-2 block text-sm font-medium text-stone-700 dark:text-stone-300"
								>Texto CTA</span
							>
							<input
								class="w-full rounded-2xl border border-stone-300 bg-white px-3 py-2.5 text-sm dark:border-stone-700 dark:bg-gray-950 dark:text-white"
								value={selectedBlock.ctaLabel ?? ''}
								oninput={(event) =>
									updateSelectedBlock((block) => {
										if (block.kind !== 'end') return;
										block.ctaLabel = (event.currentTarget as HTMLInputElement).value;
									})}
							/>
						</label>
					{/if}

					<div class="grid gap-3">
						<a
							href={resolve(
								`/course/${cid}/admin/interactives/${ilid}/lessonedit/blocks/${selectedBlock.id}`
							)}
							class="inline-flex items-center justify-center rounded-2xl border border-stone-300 px-4 py-2.5 text-sm font-medium text-stone-700 hover:bg-stone-50 dark:border-stone-700 dark:text-stone-200 dark:hover:bg-gray-800"
						>
							<SquarePen class="mr-1 h-4 w-4" />
							Editar bloque en detalle
						</a>

						<button
							type="button"
							class="inline-flex items-center justify-center rounded-2xl border border-red-200 px-4 py-2.5 text-sm font-medium text-red-700 hover:bg-red-50 dark:border-red-900/40 dark:text-red-300 dark:hover:bg-red-950/20"
							onclick={deleteSelectedBlock}
							disabled={isSubmitting}
						>
							<Trash2 class="mr-1 h-4 w-4" />
							Eliminar bloque
						</button>
					</div>
				</div>
			{:else if selectedEdge}
				<div class="space-y-5">
					<div
						class="rounded-2xl border border-stone-200 bg-stone-50/80 px-4 py-4 dark:border-stone-800 dark:bg-stone-950/30"
					>
						<p
							class="text-xs font-semibold tracking-[0.14em] text-stone-500 uppercase dark:text-stone-400"
						>
							Tipo de ruta
						</p>
						<p class="mt-1 text-sm font-medium text-stone-900 dark:text-white">
							{getLessonFlowEdgeTypeLabel(selectedEdge.data?.edgeType ?? 'next')}
						</p>
						<p class="mt-3 text-xs leading-5 text-stone-500 dark:text-stone-400">
							Desde <strong>{selectedEdgeSourceBlock?.title ?? selectedEdge.source}</strong> hacia
							<strong> {selectedEdgeTargetBlock?.title ?? selectedEdge.target}</strong>.
						</p>
					</div>

					<label class="block">
						<span class="mb-2 block text-sm font-medium text-stone-700 dark:text-stone-300"
							>Destino</span
						>
						<select
							class="w-full rounded-2xl border border-stone-300 bg-white px-3 py-2.5 text-sm dark:border-stone-700 dark:bg-gray-950 dark:text-white"
							value={selectedEdge.target}
							onchange={(event) =>
								updateEdgeTarget((event.currentTarget as HTMLSelectElement).value)}
						>
							{#each availableBlocks as blockOption (blockOption.id)}
								<option value={blockOption.id}>{blockOption.label}</option>
							{/each}
						</select>
					</label>

					{#if selectedEdge.data?.edgeType === 'branch' && selectedEdge.data.branchIndex !== undefined}
						<label class="block">
							<span class="mb-2 block text-sm font-medium text-stone-700 dark:text-stone-300"
								>Etiqueta</span
							>
							<input
								class="w-full rounded-2xl border border-stone-300 bg-white px-3 py-2.5 text-sm dark:border-stone-700 dark:bg-gray-950 dark:text-white"
								value={selectedEdge.label ?? ''}
								oninput={(event) =>
									updateSelectedEdge((definition, edge) => {
										const block = definition.blocks.find(
											(candidate) => candidate.id === edge.source
										);
										if (!block || (block.kind !== 'content' && block.kind !== 'agent')) return;
										const branch = block.branches?.[edge.data?.branchIndex ?? -1];
										if (!branch) return;
										branch.label = (event.currentTarget as HTMLInputElement).value;
									})}
							/>
						</label>

						<div class="grid gap-4 md:grid-cols-2">
							<label class="block">
								<span class="mb-2 block text-sm font-medium text-stone-700 dark:text-stone-300"
									>Variable origen</span
								>
								<input
									class="w-full rounded-2xl border border-stone-300 bg-white px-3 py-2.5 font-mono text-sm dark:border-stone-700 dark:bg-gray-950 dark:text-white"
									value={selectedEdge.data?.conditionSource ?? ''}
									oninput={(event) =>
										updateSelectedEdge((definition, edge) => {
											const block = definition.blocks.find(
												(candidate) => candidate.id === edge.source
											);
											if (!block || (block.kind !== 'content' && block.kind !== 'agent')) return;
											const branch = block.branches?.[edge.data?.branchIndex ?? -1];
											if (!branch) return;
											branch.condition ??= {
												source: 'session.attemptNumber',
												operator: 'equals',
												value: 1
											};
											branch.condition.source = (event.currentTarget as HTMLInputElement).value;
										})}
								/>
							</label>

							<label class="block">
								<span class="mb-2 block text-sm font-medium text-stone-700 dark:text-stone-300"
									>Operador</span
								>
								<select
									class="w-full rounded-2xl border border-stone-300 bg-white px-3 py-2.5 text-sm dark:border-stone-700 dark:bg-gray-950 dark:text-white"
									value={selectedEdge.data?.conditionOperator ?? 'equals'}
									onchange={(event) =>
										updateSelectedEdge((definition, edge) => {
											const block = definition.blocks.find(
												(candidate) => candidate.id === edge.source
											);
											if (!block || (block.kind !== 'content' && block.kind !== 'agent')) return;
											const branch = block.branches?.[edge.data?.branchIndex ?? -1];
											if (!branch) return;
											branch.condition ??= {
												source: 'session.attemptNumber',
												operator: 'equals',
												value: 1
											};
											branch.condition.operator = (event.currentTarget as HTMLSelectElement)
												.value as (typeof lessonConditionOperators)[number];
										})}
								>
									{#each lessonConditionOperators as operator (operator)}
										<option value={operator}>{operator}</option>
									{/each}
								</select>
							</label>
						</div>

						<label class="block">
							<span class="mb-2 block text-sm font-medium text-stone-700 dark:text-stone-300"
								>Valor esperado</span
							>
							<input
								class="w-full rounded-2xl border border-stone-300 bg-white px-3 py-2.5 text-sm dark:border-stone-700 dark:bg-gray-950 dark:text-white"
								value={String(selectedEdge.data?.conditionValue ?? '')}
								oninput={(event) =>
									updateSelectedEdge((definition, edge) => {
										const block = definition.blocks.find(
											(candidate) => candidate.id === edge.source
										);
										if (!block || (block.kind !== 'content' && block.kind !== 'agent')) return;
										const branch = block.branches?.[edge.data?.branchIndex ?? -1];
										if (!branch) return;
										branch.condition ??= {
											source: 'session.attemptNumber',
											operator: 'equals',
											value: 1
										};
										branch.condition.value = updateConditionValue(
											(event.currentTarget as HTMLInputElement).value
										);
									})}
							/>
						</label>

						<button
							type="button"
							class="inline-flex items-center justify-center rounded-2xl border border-red-200 px-4 py-2.5 text-sm font-medium text-red-700 hover:bg-red-50 dark:border-red-900/40 dark:text-red-300 dark:hover:bg-red-950/20"
							onclick={removeSelectedBranch}
						>
							<Trash2 class="mr-1 h-4 w-4" />
							Eliminar rama
						</button>
					{:else if selectedEdge.data?.edgeType === 'choice-option'}
						<label class="block">
							<span class="mb-2 block text-sm font-medium text-stone-700 dark:text-stone-300"
								>Etiqueta visible</span
							>
							<input
								class="w-full rounded-2xl border border-stone-300 bg-white px-3 py-2.5 text-sm dark:border-stone-700 dark:bg-gray-950 dark:text-white"
								value={selectedEdge.label ?? ''}
								oninput={(event) =>
									updateSelectedEdge((definition, edge) => {
										const block = definition.blocks.find(
											(candidate) => candidate.id === edge.source
										);
										if (!block || block.kind !== 'choice') return;
										const option = block.options.find(
											(candidate) => candidate.id === edge.data?.optionId
										);
										if (!option) return;
										option.label = (event.currentTarget as HTMLInputElement).value;
									})}
							/>
						</label>

						<label class="block">
							<span class="mb-2 block text-sm font-medium text-stone-700 dark:text-stone-300"
								>Valor</span
							>
							<input
								class="w-full rounded-2xl border border-stone-300 bg-white px-3 py-2.5 font-mono text-sm dark:border-stone-700 dark:bg-gray-950 dark:text-white"
								value={selectedEdge.data?.optionValue ?? ''}
								oninput={(event) =>
									updateSelectedEdge((definition, edge) => {
										const block = definition.blocks.find(
											(candidate) => candidate.id === edge.source
										);
										if (!block || block.kind !== 'choice') return;
										const option = block.options.find(
											(candidate) => candidate.id === edge.data?.optionId
										);
										if (!option) return;
										option.value = (event.currentTarget as HTMLInputElement).value;
									})}
							/>
						</label>

						<button
							type="button"
							class="inline-flex items-center justify-center rounded-2xl border border-red-200 px-4 py-2.5 text-sm font-medium text-red-700 hover:bg-red-50 dark:border-red-900/40 dark:text-red-300 dark:hover:bg-red-950/20"
							onclick={removeSelectedChoiceOption}
						>
							<Trash2 class="mr-1 h-4 w-4" />
							Eliminar opción
						</button>
					{:else}
						<div
							class="rounded-2xl border border-dashed border-stone-300 px-4 py-4 text-sm text-stone-600 dark:border-stone-700 dark:text-stone-300"
						>
							Esta ruta pertenece al recorrido principal del bloque. Si la quitas, asegúrate de
							dejar alguna salida alternativa antes de guardar.
						</div>

						<button
							type="button"
							class="inline-flex items-center justify-center rounded-2xl border border-red-200 px-4 py-2.5 text-sm font-medium text-red-700 hover:bg-red-50 dark:border-red-900/40 dark:text-red-300 dark:hover:bg-red-950/20"
							onclick={clearSelectedNextEdge}
						>
							<Trash2 class="mr-1 h-4 w-4" />
							Quitar siguiente por defecto
						</button>
					{/if}
				</div>
			{:else}
				<div
					class="rounded-2xl border border-dashed border-stone-300 px-4 py-6 text-sm leading-6 text-stone-500 dark:border-stone-700 dark:text-stone-400"
				>
					<p class="font-medium text-stone-700 dark:text-stone-200">Qué puedes hacer aquí</p>
					<ul class="mt-3 list-disc space-y-2 pl-5">
						<li>Crear bloques nuevos desde la barra superior.</li>
						<li>Mover nodos para organizar el mapa pedagógico.</li>
						<li>Seleccionar una conexión para editar su destino o su condición.</li>
						<li>
							Abrir el editor profundo del bloque cuando necesites tocar prompts o contenido rico.
						</li>
					</ul>
				</div>
			{/if}
		</aside>
	</div>
</div>

<style>
	:global(.lesson-flow-shell .svelte-flow__controls) {
		border-radius: 1.25rem;
		overflow: hidden;
		border: 1px solid rgba(214, 201, 183, 0.85);
		box-shadow: 0 18px 35px -28px rgba(28, 25, 23, 0.45);
	}

	:global(.lesson-flow-shell .svelte-flow__controls button) {
		background: rgba(255, 252, 247, 0.96);
		color: rgb(68, 64, 60);
		border-bottom: 1px solid rgba(231, 229, 228, 0.95);
	}

	:global(.lesson-flow-shell .svelte-flow__controls button:last-child) {
		border-bottom: 0;
	}

	:global(.lesson-flow-shell .svelte-flow__controls button:hover) {
		background: rgba(255, 247, 237, 0.98);
	}

	:global(.lesson-flow-shell .svelte-flow__minimap) {
		background: rgba(255, 251, 245, 0.95);
		border-radius: 1.1rem;
		border: 1px solid rgba(214, 201, 183, 0.85);
		box-shadow: 0 18px 35px -28px rgba(28, 25, 23, 0.45);
	}

	:global(.lesson-flow-shell .svelte-flow__edge-textbg) {
		fill: rgba(255, 251, 245, 0.96);
	}

	:global(.lesson-flow-shell .svelte-flow__attribution) {
		background: rgba(255, 251, 245, 0.9);
		border-radius: 999px;
		padding: 0.25rem 0.55rem;
	}
</style>
