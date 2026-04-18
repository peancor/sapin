<script lang="ts">
	import '@xyflow/svelte/dist/style.css';

	import type { PageProps } from './$types';
	import { beforeNavigate } from '$app/navigation';
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
		getLessonCheckModeLabel,
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
		CircleCheck,
		ChevronRight,
		Eye,
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
	import { onMount } from 'svelte';

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
		{ kind: 'check', label: 'Evaluación', icon: CircleCheck },
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
	let isInspectorCollapsed = $state(false);

	const cid = $derived(page.params.cid);
	const ilid = $derived(page.params.ilid);
	const previewHref = $derived(resolve(`/lesson/${ilid}`));
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
			block.requiresResponse =
				interactionMode === 'none' ? false : (block.requiresResponse ?? true);
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
		return block != null;
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
		if (
			!selectedBlock ||
			(selectedBlock.kind !== 'content' &&
				selectedBlock.kind !== 'check' &&
				selectedBlock.kind !== 'agent')
		)
			return;

		updateSelectedBlock((block) => {
			if (
				block.kind !== 'content' &&
				block.kind !== 'check' &&
				block.kind !== 'agent'
			)
				return;

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
			if (
				!block ||
				(block.kind !== 'content' && block.kind !== 'check' && block.kind !== 'agent')
			)
				return;
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
				if (
					block.kind !== 'content' &&
					block.kind !== 'check' &&
					block.kind !== 'agent'
				)
					return;
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
		const anchorBlockId =
			selection?.kind === 'node'
				? selection.id
				: selection?.kind === 'edge'
					? selectedEdge?.source
					: null;
		const anchorNode = anchorBlockId
			? flowNodes.find((node) => node.id === anchorBlockId) ?? null
			: null;
		const stagger = ((draftDefinition.blocks.length % 4) - 1.5) * 52;

		if (anchorNode) {
			return {
				x: Math.round(anchorNode.position.x + 430),
				y: Math.round(anchorNode.position.y + stagger)
			};
		}

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

	onMount(() => {
		const handleBeforeUnload = (event: BeforeUnloadEvent) => {
			if (!hasUnsavedChanges) return;
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
			hasUnsavedChanges &&
			!window.confirm('Hay cambios sin guardar. ¿Deseas salir de todas formas?')
		) {
			navigation.cancel();
		}
	});

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

<div
	class="min-h-dvh bg-[radial-gradient(circle_at_top_left,_rgba(245,158,11,0.16),_transparent_28%),linear-gradient(180deg,_#f8f5ef_0%,_#efe8dc_100%)] p-4 text-stone-900 sm:p-6 xl:hidden dark:bg-[radial-gradient(circle_at_top_left,_rgba(245,158,11,0.12),_transparent_24%),linear-gradient(180deg,_#111315_0%,_#191c20_100%)] dark:text-stone-100"
>
	<div class="mx-auto max-w-3xl space-y-5">
		<div
			class="rounded-[28px] border border-white/70 bg-white/90 p-6 shadow-[0_30px_80px_-50px_rgba(24,24,27,0.55)] backdrop-blur dark:border-white/10 dark:bg-[#16181b]/90"
		>
			<div class="flex items-start justify-between gap-4">
				<div class="max-w-xl">
					<div class="mb-3 flex items-center gap-3">
						<div class="rounded-2xl bg-amber-500/15 p-3 text-amber-700 dark:text-amber-300">
							<LayoutTemplate class="h-5 w-5" />
						</div>
						<div>
							<p
								class="text-xs font-semibold tracking-[0.24em] text-stone-500 uppercase dark:text-stone-400"
							>
								Studio lesson
							</p>
							<h1 class="mt-1 text-2xl font-semibold">{data.activity.name}</h1>
						</div>
					</div>
					<p class="text-sm leading-6 text-stone-600 dark:text-stone-300">
						El editor visual está optimizado para escritorio para evitar scroll vertical y conservar
						una lectura clara del grafo. En esta anchura te dejamos un fallback editorial para
						seguir trabajando sin una experiencia comprimida.
					</p>
				</div>
				<span
					class="rounded-full border border-amber-200 bg-amber-50 px-3 py-1 text-xs font-medium text-amber-800 dark:border-amber-900/40 dark:bg-amber-950/20 dark:text-amber-200"
				>
					Fallback responsive
				</span>
			</div>

			<div class="mt-5 grid gap-3 sm:grid-cols-3">
				<div
					class="rounded-2xl border border-stone-200/80 bg-stone-50/80 px-4 py-3 dark:border-stone-800 dark:bg-stone-900/60"
				>
					<p
						class="text-[11px] font-semibold tracking-[0.18em] text-stone-500 uppercase dark:text-stone-400"
					>
						Entrada
					</p>
					<p class="mt-2 text-sm font-semibold">{entryBlockTitle}</p>
				</div>
				<div
					class="rounded-2xl border border-stone-200/80 bg-stone-50/80 px-4 py-3 dark:border-stone-800 dark:bg-stone-900/60"
				>
					<p
						class="text-[11px] font-semibold tracking-[0.18em] text-stone-500 uppercase dark:text-stone-400"
					>
						Bloques
					</p>
					<p class="mt-2 text-2xl font-semibold">{draftDefinition.blocks.length}</p>
				</div>
				<div
					class="rounded-2xl border border-stone-200/80 bg-stone-50/80 px-4 py-3 dark:border-stone-800 dark:bg-stone-900/60"
				>
					<p
						class="text-[11px] font-semibold tracking-[0.18em] text-stone-500 uppercase dark:text-stone-400"
					>
						Conexiones
					</p>
					<p class="mt-2 text-2xl font-semibold">{flowEdges.length}</p>
				</div>
			</div>
		</div>

		<div class="grid gap-3 sm:grid-cols-3">
			<a
				href={resolve(`/course/${cid}/admin/interactives/${ilid}/lessonedit`)}
				class="inline-flex items-center justify-center rounded-2xl border border-stone-300 bg-white px-4 py-3 text-sm font-medium text-stone-700 shadow-sm hover:bg-stone-50 dark:border-stone-700 dark:bg-stone-950/50 dark:text-stone-200 dark:hover:bg-stone-900"
			>
				<ArrowLeft class="mr-2 h-4 w-4" />
				Volver al editor lesson
			</a>
			<a
				href={resolve(`/course/${cid}/admin/interactives/${ilid}`)}
				class="inline-flex items-center justify-center rounded-2xl border border-stone-300 bg-white px-4 py-3 text-sm font-medium text-stone-700 shadow-sm hover:bg-stone-50 dark:border-stone-700 dark:bg-stone-950/50 dark:text-stone-200 dark:hover:bg-stone-900"
			>
				Ficha de actividad
			</a>
			<a
				href={previewHref}
				target="_blank"
				rel="noreferrer"
				class="inline-flex items-center justify-center rounded-2xl border border-emerald-300 bg-emerald-50 px-4 py-3 text-sm font-medium text-emerald-800 shadow-sm hover:bg-emerald-100 dark:border-emerald-900/40 dark:bg-emerald-950/30 dark:text-emerald-200 dark:hover:bg-emerald-950/50"
			>
				<Eye class="mr-2 h-4 w-4" />
				Lanzar preview
			</a>
		</div>

		<div
			class="rounded-[28px] border border-stone-200/80 bg-white/90 p-5 shadow-sm dark:border-stone-800 dark:bg-[#16181b]/90"
		>
			<p
				class="text-xs font-semibold tracking-[0.18em] text-stone-500 uppercase dark:text-stone-400"
			>
				Qué puedes hacer desde aquí
			</p>
			<ul
				class="mt-4 list-disc space-y-2 pl-5 text-sm leading-6 text-stone-600 dark:text-stone-300"
			>
				<li>Revisar la estructura actual de la lesson sin perder el contexto.</li>
				<li>Volver a la portada de lesson para editar bloques y configuración.</li>
				<li>Usar escritorio para el canvas inmersivo con inspector acoplado.</li>
			</ul>
		</div>
	</div>
</div>

<div
	class="lesson-flow-shell hidden h-dvh min-h-dvh overflow-hidden bg-[#ebe7e0] text-stone-900 xl:flex xl:flex-col dark:bg-[#141516] dark:text-stone-100"
>
	<header
		class="studio-topbar shrink-0 border-b border-stone-300/80 bg-[#f7f3ec]/92 px-4 py-3 backdrop-blur-xl dark:border-stone-800 dark:bg-[#16181b]/92"
	>
		<div class="flex items-center gap-3">
			<div class="flex min-w-0 flex-1 items-center gap-3">
				<a
					href={resolve(`/course/${cid}/admin/interactives/${ilid}/lessonedit`)}
					class="inline-flex h-10 w-10 items-center justify-center rounded-2xl border border-stone-300 bg-white text-stone-700 shadow-sm transition hover:bg-stone-50 dark:border-stone-700 dark:bg-stone-900 dark:text-stone-200 dark:hover:bg-stone-800"
					aria-label="Volver al editor lesson"
				>
					<ArrowLeft class="h-4 w-4" />
				</a>

				<div class="min-w-0">
					<div class="flex items-center gap-2">
						<div class="rounded-xl bg-amber-500/15 p-2 text-amber-700 dark:text-amber-300">
							<LayoutTemplate class="h-4 w-4" />
						</div>
						<p
							class="truncate text-sm font-semibold tracking-[0.22em] text-stone-500 uppercase dark:text-stone-400"
						>
							Visual lesson studio
						</p>
					</div>
					<div class="mt-1 flex items-center gap-2">
						<h1 class="truncate text-lg font-semibold">{data.activity.name}</h1>
						{#if actionError}
							<span
								class="rounded-full border border-red-200 bg-red-50 px-2.5 py-1 text-xs font-medium text-red-700 dark:border-red-900/40 dark:bg-red-950/20 dark:text-red-200"
							>
								{actionError}
							</span>
						{:else if actionMessage}
							<span
								class="rounded-full border border-emerald-200 bg-emerald-50 px-2.5 py-1 text-xs font-medium text-emerald-700 dark:border-emerald-900/40 dark:bg-emerald-950/20 dark:text-emerald-200"
							>
								{actionMessage}
							</span>
						{:else if hasUnsavedChanges}
							<span
								class="rounded-full border border-amber-200 bg-amber-50 px-2.5 py-1 text-xs font-medium text-amber-800 dark:border-amber-900/40 dark:bg-amber-950/20 dark:text-amber-200"
							>
								Cambios sin guardar
							</span>
						{:else}
							<span
								class="rounded-full border border-stone-200 bg-white px-2.5 py-1 text-xs font-medium text-stone-500 dark:border-stone-700 dark:bg-stone-900 dark:text-stone-300"
							>
								Sincronizado
							</span>
						{/if}
					</div>
				</div>
			</div>

			<div class="hidden items-center gap-3 2xl:flex">
				<div
					class="rounded-2xl border border-stone-300/80 bg-white/85 px-3 py-2 text-sm shadow-sm dark:border-stone-700 dark:bg-stone-900/80"
				>
					<p
						class="text-[10px] font-semibold tracking-[0.18em] text-stone-500 uppercase dark:text-stone-400"
					>
						Entrada
					</p>
					<p class="mt-1 max-w-44 truncate font-semibold">{entryBlockTitle}</p>
				</div>
				<div
					class="rounded-2xl border border-stone-300/80 bg-white/85 px-3 py-2 text-sm shadow-sm dark:border-stone-700 dark:bg-stone-900/80"
				>
					<p
						class="text-[10px] font-semibold tracking-[0.18em] text-stone-500 uppercase dark:text-stone-400"
					>
						Bloques
					</p>
					<p class="mt-1 font-semibold">{draftDefinition.blocks.length}</p>
				</div>
				<div
					class="rounded-2xl border border-stone-300/80 bg-white/85 px-3 py-2 text-sm shadow-sm dark:border-stone-700 dark:bg-stone-900/80"
				>
					<p
						class="text-[10px] font-semibold tracking-[0.18em] text-stone-500 uppercase dark:text-stone-400"
					>
						Conexiones
					</p>
					<p class="mt-1 font-semibold">{flowEdges.length}</p>
				</div>
			</div>

			<div class="flex items-center gap-2">
				<a
					href={previewHref}
					target="_blank"
					rel="noreferrer"
					class="inline-flex items-center rounded-2xl border border-emerald-300 bg-emerald-50 px-3.5 py-2 text-sm font-medium text-emerald-800 shadow-sm transition hover:bg-emerald-100 dark:border-emerald-900/40 dark:bg-emerald-950/30 dark:text-emerald-200 dark:hover:bg-emerald-950/50"
				>
					<Eye class="mr-1.5 h-4 w-4" />
					Preview
				</a>
				<a
					href={resolve(`/course/${cid}/admin/interactives/${ilid}`)}
					class="inline-flex items-center rounded-2xl border border-stone-300 bg-white px-3.5 py-2 text-sm font-medium text-stone-700 shadow-sm transition hover:bg-stone-50 dark:border-stone-700 dark:bg-stone-900 dark:text-stone-200 dark:hover:bg-stone-800"
				>
					Ficha
				</a>
				<button
					type="button"
					class="inline-flex items-center rounded-2xl border border-stone-300 bg-white px-3.5 py-2 text-sm font-medium text-stone-700 shadow-sm transition hover:bg-stone-50 dark:border-stone-700 dark:bg-stone-900 dark:text-stone-200 dark:hover:bg-stone-800"
					onclick={centerCanvas}
				>
					<MoveRight class="mr-1.5 h-4 w-4" />
					Centrar
				</button>
				<button
					type="button"
					class="bg-primary-600 hover:bg-primary-700 inline-flex items-center rounded-2xl px-4 py-2.5 text-sm font-medium text-white shadow-sm transition disabled:opacity-50"
					onclick={saveFlow}
					disabled={isSubmitting}
				>
					<Save class="mr-1.5 h-4 w-4" />
					Guardar mapa
				</button>
			</div>
		</div>
	</header>

	<div class="flex min-h-0 flex-1 overflow-hidden">
		<aside
			class="studio-rail flex w-[112px] shrink-0 flex-col gap-4 border-r border-stone-300/80 bg-[#f5f0e7] px-3 py-4 dark:border-stone-800 dark:bg-[#17191c]"
		>
			<div>
				<p
					class="text-[10px] font-semibold tracking-[0.22em] text-stone-500 uppercase dark:text-stone-400"
				>
					Tool rail
				</p>
				<p class="mt-2 text-xs leading-5 text-stone-500 dark:text-stone-400">
					Acciones rápidas para ampliar el mapa sin perder altura de canvas.
				</p>
			</div>

			<div class="grid gap-2">
				{#each createButtons as button (button.kind)}
					<button
						type="button"
						class="group flex flex-col items-center gap-2 rounded-[24px] border border-stone-300/90 bg-white px-2 py-3 text-center text-[11px] font-medium text-stone-700 shadow-sm transition hover:-translate-y-0.5 hover:bg-stone-50 disabled:opacity-50 dark:border-stone-700 dark:bg-stone-900 dark:text-stone-200 dark:hover:bg-stone-800"
						onclick={() => createBlock(button.kind)}
						disabled={isSubmitting}
					>
						<span
							class="flex h-10 w-10 items-center justify-center rounded-2xl bg-stone-100 text-stone-700 dark:bg-stone-800 dark:text-stone-200"
						>
							<button.icon class="h-4 w-4" />
						</span>
						<span>{button.label}</span>
					</button>
				{/each}
			</div>

			<button
				type="button"
				class="flex flex-col items-center gap-2 rounded-[24px] border border-dashed border-stone-300 bg-transparent px-2 py-3 text-center text-[11px] font-medium text-stone-600 transition hover:bg-white/70 dark:border-stone-700 dark:text-stone-300 dark:hover:bg-stone-900/70"
				onclick={centerCanvas}
			>
				<span
					class="flex h-10 w-10 items-center justify-center rounded-2xl bg-stone-200/70 dark:bg-stone-800"
				>
					<MoveRight class="h-4 w-4" />
				</span>
				<span>Centrar</span>
			</button>

			<div
				class="mt-auto space-y-2 rounded-[26px] border border-stone-300/80 bg-white/80 p-3 text-[11px] shadow-sm dark:border-stone-700 dark:bg-stone-900/80"
			>
				<p class="font-semibold tracking-[0.18em] text-stone-500 uppercase dark:text-stone-400">
					Leyenda
				</p>
				<div class="space-y-2 text-stone-600 dark:text-stone-300">
					<div class="flex items-center gap-2">
						<span class="h-2.5 w-2.5 rounded-full bg-amber-500"></span>
						<span>Contenido</span>
					</div>
					<div class="flex items-center gap-2">
						<span class="h-2.5 w-2.5 rounded-full bg-teal-500"></span>
						<span>Decisión</span>
					</div>
					<div class="flex items-center gap-2">
						<span class="h-2.5 w-2.5 rounded-full bg-emerald-500"></span>
						<span>Evaluación</span>
					</div>
					<div class="flex items-center gap-2">
						<span class="h-2.5 w-2.5 rounded-full bg-indigo-500"></span>
						<span>Tutor IA</span>
					</div>
					<div class="flex items-center gap-2">
						<span class="h-2.5 w-2.5 rounded-full bg-rose-500"></span>
						<span>Final</span>
					</div>
				</div>
			</div>
		</aside>

		<section class="flex min-h-0 flex-1 flex-col overflow-hidden">
			<div class="flex min-h-0 flex-1 overflow-hidden p-4">
				<div
					class="studio-stage relative min-h-0 flex-1 overflow-hidden rounded-[32px] border border-stone-300/80 bg-[#f8f4ec] shadow-[0_30px_70px_-45px_rgba(24,24,27,0.65)] dark:border-stone-700 dark:bg-[#111315]"
				>
					<div
						class="pointer-events-none absolute inset-x-0 top-0 z-10 h-24 bg-linear-to-b from-[#f8f4ec] via-[#f8f4ec]/65 to-transparent dark:from-[#111315] dark:via-[#111315]/65"
					></div>

					<div class="pointer-events-none absolute top-5 left-5 z-20 flex flex-wrap gap-2">
						<div
							class="rounded-full border border-white/80 bg-white/90 px-3 py-1.5 text-xs font-medium text-stone-600 shadow-sm backdrop-blur dark:border-white/10 dark:bg-stone-900/90 dark:text-stone-300"
						>
							Panea con arrastre, edita con el inspector y usa zoom para recorrer el grafo.
						</div>
						{#if selection?.kind === 'node' && selectedBlock}
							<div
								class="rounded-full border border-amber-200 bg-amber-50 px-3 py-1.5 text-xs font-medium text-amber-800 shadow-sm dark:border-amber-900/40 dark:bg-amber-950/20 dark:text-amber-200"
							>
								Bloque activo: {selectedBlock.title}
							</div>
						{:else if selection?.kind === 'edge' && selectedEdge}
							<div
								class="rounded-full border border-sky-200 bg-sky-50 px-3 py-1.5 text-xs font-medium text-sky-800 shadow-sm dark:border-sky-900/40 dark:bg-sky-950/20 dark:text-sky-200"
							>
								Ruta activa: {selectedEdge.label ??
									getLessonFlowEdgeTypeLabel(selectedEdge.data?.edgeType ?? 'next')}
							</div>
						{/if}
					</div>

					<div bind:this={canvasElement} class="h-full w-full overflow-hidden">
						{#key flowRenderVersion}
							<SvelteFlow
								bind:nodes={flowNodes}
								bind:edges={flowEdges}
								bind:viewport={flowViewport}
								{nodeTypes}
								class="h-full w-full"
								style="background:
									radial-gradient(circle at top left, rgba(255,246,237,0.9), rgba(248,244,236,0.82) 32%, rgba(236,229,217,0.65) 100%),
									linear-gradient(180deg, rgba(255,255,255,0.16), rgba(255,255,255,0));"
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
									bgColor="#f7f1e8"
									patternColor="#d5c5b2"
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
			</div>
		</section>

		{#if isInspectorCollapsed}
			<aside
				class="flex w-16 shrink-0 flex-col items-center gap-4 border-l border-stone-300/80 bg-[#f5f0e7] px-2 py-4 dark:border-stone-800 dark:bg-[#17191c]"
			>
				<button
					type="button"
					class="flex h-10 w-10 items-center justify-center rounded-2xl border border-stone-300 bg-white text-stone-700 shadow-sm transition hover:bg-stone-50 dark:border-stone-700 dark:bg-stone-900 dark:text-stone-200 dark:hover:bg-stone-800"
					onclick={() => {
						isInspectorCollapsed = false;
					}}
					aria-label="Abrir inspector"
				>
					<ChevronRight class="h-4 w-4" />
				</button>
				<div
					class="inspector-tab rounded-full border border-stone-300/80 bg-white/80 px-2 py-3 text-[11px] font-semibold tracking-[0.2em] text-stone-500 uppercase shadow-sm dark:border-stone-700 dark:bg-stone-900/80 dark:text-stone-400"
				>
					Inspector
				</div>
			</aside>
		{:else}
			<aside
				class="flex w-[380px] shrink-0 flex-col overflow-hidden border-l border-stone-300/80 bg-[#f5f0e7] dark:border-stone-800 dark:bg-[#17191c]"
			>
				<div class="shrink-0 border-b border-stone-300/80 px-5 py-4 dark:border-stone-800">
					<div class="flex items-start justify-between gap-3">
						<div>
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
									Ajusta los campos esenciales del bloque y abre el editor profundo si necesitas
									trabajar el contenido completo.
								{:else if selectedEdge}
									Edita la ruta seleccionada, su destino y los metadatos que la acompañan.
								{:else}
									Selecciona un bloque o una conexión en el canvas para editarla aquí.
								{/if}
							</p>
						</div>
						<button
							type="button"
							class="inline-flex items-center rounded-2xl border border-stone-300 bg-white px-3 py-2 text-sm font-medium text-stone-700 shadow-sm transition hover:bg-stone-50 dark:border-stone-700 dark:bg-stone-900 dark:text-stone-200 dark:hover:bg-stone-800"
							onclick={() => {
								isInspectorCollapsed = true;
							}}
						>
							Ocultar
						</button>
					</div>
				</div>

				<div class="min-h-0 flex-1 overflow-y-auto px-5 py-5">
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
												: selectedBlock.kind === 'check'
													? 'Evaluación'
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
												{selectedBlock.branches?.length ?? 0} rama{(selectedBlock.branches
													?.length ?? 0) === 1
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
												Cada opción nueva aparece sin cable. Arrastra desde su salida o selecciona
												su conexión para editarla.
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
							{:else if selectedBlock.kind === 'check'}
								<div class="block">
									<span class="mb-2 block text-sm font-medium text-stone-700 dark:text-stone-300"
										>Modo</span
									>
									<p class="rounded-2xl border border-stone-300 bg-white px-3 py-2.5 text-sm font-medium text-stone-900 dark:border-stone-700 dark:bg-gray-950 dark:text-white">
										{getLessonCheckModeLabel(selectedBlock.checkConfig.mode)}
									</p>
								</div>

								<div class="grid gap-4 md:grid-cols-2">
									<label class="block">
										<span class="mb-2 block text-sm font-medium text-stone-700 dark:text-stone-300"
											>Botón continuar</span
										>
										<input
											class="w-full rounded-2xl border border-stone-300 bg-white px-3 py-2.5 text-sm dark:border-stone-700 dark:bg-gray-950 dark:text-white"
											value={selectedBlock.checkConfig.continueLabel ?? ''}
											oninput={(event) =>
												updateSelectedBlock((block) => {
													if (block.kind !== 'check') return;
													block.checkConfig.continueLabel = (
														event.currentTarget as HTMLInputElement
													).value;
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
													if (block.kind !== 'check') return;
													block.next = (event.currentTarget as HTMLSelectElement).value || null;
												})}
										>
											<option value="">Sin siguiente</option>
											{#each availableBlocks as blockOption (blockOption.id)}
												<option value={blockOption.id}>{blockOption.label}</option>
											{/each}
										</select>
									</label>
								</div>

								<div
									class="rounded-2xl border border-dashed border-stone-300 px-4 py-4 dark:border-stone-700"
								>
									<div class="flex items-center justify-between gap-3">
										<div>
											<p class="text-sm font-medium text-stone-900 dark:text-white">
												Ramas condicionales
											</p>
											<p class="text-xs text-stone-500 dark:text-stone-400">
												{selectedBlock.branches?.length ?? 0} rama{(selectedBlock.branches
													?.length ?? 0) === 1
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
										<div
											class="rounded-2xl border border-sky-200 bg-sky-50 px-4 py-3 text-sm text-sky-800 dark:border-sky-900/40 dark:bg-sky-950/20 dark:text-sky-200"
										>
											Este bloque se ejecutará automáticamente al entrar y mostrará la respuesta
											generada sin caja de texto.
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
												{selectedBlock.branches?.length ?? 0} rama{(selectedBlock.branches
													?.length ?? 0) === 1
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
									Desde <strong>{selectedEdgeSourceBlock?.title ?? selectedEdge.source}</strong>
									hacia
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
												if (
													!block ||
													(block.kind !== 'content' &&
														block.kind !== 'check' &&
														block.kind !== 'agent')
												)
													return;
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
													if (
														!block ||
														(block.kind !== 'content' &&
															block.kind !== 'check' &&
															block.kind !== 'agent')
													)
														return;
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
													if (
														!block ||
														(block.kind !== 'content' &&
															block.kind !== 'check' &&
															block.kind !== 'agent')
													)
														return;
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
												if (
													!block ||
													(block.kind !== 'content' &&
														block.kind !== 'check' &&
														block.kind !== 'agent')
												)
													return;
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
								<li>Crear bloques nuevos desde la rail izquierda.</li>
								<li>Mover nodos para organizar el mapa pedagógico.</li>
								<li>Seleccionar una conexión para editar su destino o su condición.</li>
								<li>
									Abrir el editor profundo del bloque cuando necesites tocar prompts o contenido
									rico.
								</li>
							</ul>
						</div>
					{/if}
				</div>
			</aside>
		{/if}
	</div>
</div>

<style>
	.inspector-tab {
		writing-mode: vertical-rl;
		text-orientation: mixed;
	}

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

	:global(.lesson-flow-shell .svelte-flow__panel) {
		margin: 1rem;
	}

	:global(.lesson-flow-shell .svelte-flow__minimap-mask) {
		fill: rgba(120, 113, 108, 0.08);
	}
</style>
