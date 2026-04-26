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
	import LessonFlowQuickMenu from '$lib/components/lesson/flow/LessonFlowQuickMenu.svelte';
	import {
		getLessonAgentToolMetrics,
		type LessonAgentToolPresentationItem
	} from '$lib/lesson/lessonAgentToolPresentation';
	import { lessonDebuggerHref } from '$lib/lesson/lessonStudioNavigation';
	import type {
		LessonFlowQuickMenuContext,
		LessonFlowQuickMenuItem
	} from '$lib/lesson/lessonFlowQuickMenu';
	import {
		getLessonCheckModeLabel,
		normalizeLessonAgentConfig,
		normalizeLessonCheckConfig,
		type LessonAgentExecutionTrigger,
		type LessonAgentInteractionMode,
		type LessonAgentRuntimeMode,
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
		Bug,
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
		Trash2,
		Youtube
	} from 'lucide-svelte';
	import { onMount, tick } from 'svelte';

	type FlowActionSuccess = {
		success: true;
		message: string;
		definition: LessonDefinition;
		blockId?: string;
		deletedBlockId?: string;
	};

	type SelectionState = { kind: 'node'; id: string } | { kind: 'edge'; id: string } | null;

	type ConditionValue = string | number | boolean | null | undefined;
	type QuickMenuPayload = {
		nodeId?: string;
		edgeId?: string;
		sourceBlockId?: string;
		sourceHandle?: string | null;
		flowPosition?: { x: number; y: number } | null;
	};
	type CreateBlockOptions = {
		position?: { x: number; y: number };
		connectFrom?: { sourceBlockId: string; sourceHandle: string | null };
	};

	let { data, form }: PageProps = $props();

	const nodeTypes = {
		'lesson-block': LessonFlowNodeComponent
	};

	const createButtons = [
		{ kind: 'content', label: 'Contenido', icon: BookOpenText },
		{ kind: 'choice', label: 'Decisión', icon: ListChecks },
		{ kind: 'check', label: 'Evaluación', icon: CircleCheck },
		{ kind: 'agent', label: 'Tutor IA', icon: Bot },
		{ kind: 'youtube', label: 'YouTube', icon: Youtube },
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
	let stageElement: HTMLDivElement | null = $state.raw(null);
	let selection = $state<SelectionState>(null);
	let flowRenderVersion = $state(0);
	let isSubmitting = $state(false);
	let hasUnsavedChanges = $state(false);
	let actionMessage = $state('');
	let actionError = $state('');
	let isInspectorCollapsed = $state(false);
	let quickMenuContext = $state<LessonFlowQuickMenuContext>('closed');
	let quickMenuQuery = $state('');
	let quickMenuPosition = $state.raw({ x: 28, y: 28 });
	let quickMenuPayload = $state.raw<QuickMenuPayload>({});
	let lastCanvasPointer = $state.raw<{ clientX: number; clientY: number } | null>(null);
	let pendingConnectionSource = $state.raw<{
		sourceBlockId: string;
		sourceHandle: string | null;
	} | null>(null);
	let isRenamingSelectedBlock = $state(false);
	let renameDraft = $state('');
	let renameInputElement: HTMLInputElement | null = $state.raw(null);

	const cid = $derived(page.params.cid ?? '');
	const ilid = $derived(page.params.ilid ?? '');
	const revisionDiff = $derived(data.revisionSummary.diff);
	const revisionImpact = $derived(data.revisionSummary.impact);
	const hasDraftChanges = $derived(
		revisionDiff.totalChangedBlocks > 0 || revisionDiff.entryBlockChanged
	);
	const isQuickMenuOpen = $derived(quickMenuContext !== 'closed');
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
	const effectiveAllowedAgentToolIds = $derived(
		draftDefinition.allowedAgentToolIds?.length
			? draftDefinition.allowedAgentToolIds
			: data.lessonAgentTools.map((tool) => tool.id)
	);
	const entryBlockTitle = $derived(
		draftDefinition.blocks.find((block) => block.id === draftDefinition.entryBlockId)?.title ??
			draftDefinition.entryBlockId
	);
	const quickMenuTitle = $derived.by(() => {
		if (quickMenuContext === 'canvas') return 'Quick Add';
		if (quickMenuContext === 'node') return 'Acciones del bloque';
		if (quickMenuContext === 'edge') return 'Acciones de la ruta';
		if (quickMenuContext === 'connect-from-handle') return 'Crear y conectar';
		return 'Acciones rapidas';
	});
	const quickMenuSubtitle = $derived.by(() => {
		if (quickMenuContext === 'canvas') {
			return 'Crea bloques justo donde los necesitas o lanza acciones globales del studio.';
		}

		if (quickMenuContext === 'node') {
			return selectedBlock
				? `Trabajando sobre "${selectedBlock.title}".`
				: 'Acciones contextuales para el bloque seleccionado.';
		}

		if (quickMenuContext === 'edge') {
			return selectedEdge
				? `Ruta ${selectedEdge.label ?? getLessonFlowEdgeTypeLabel(selectedEdge.data?.edgeType ?? 'next')}.`
				: 'Acciones contextuales para la conexion seleccionada.';
		}

		if (quickMenuContext === 'connect-from-handle') {
			return 'Elige un tipo y el bloque nuevo quedara cableado automaticamente desde esa salida.';
		}

		return '';
	});
	const quickMenuItems = $derived.by(() => getQuickMenuItems());

	function buildLessonDebuggerQuery(options?: {
		blockId?: string;
		view?: 'student' | 'debug';
		intent?: 'inspect' | 'run';
		fresh?: boolean;
	}) {
		const debuggerOptions: Parameters<typeof lessonDebuggerHref>[1] = { source: 'flow' };
		if (options?.blockId) debuggerOptions.blockId = options.blockId;
		if (options?.view) debuggerOptions.view = options.view;
		if (options?.intent) debuggerOptions.intent = options.intent;
		if (options?.fresh) debuggerOptions.fresh = options.fresh;

		const href = lessonDebuggerHref({ cid, ilid }, debuggerOptions);
		return href.slice(href.indexOf('?') + 1);
	}

	function openLessonDebugger(options?: {
		blockId?: string;
		view?: 'student' | 'debug';
		intent?: 'inspect' | 'run';
		fresh?: boolean;
	}) {
		window.location.href = resolve(
			`/course/${cid}/lesson-studio/${ilid}/debug?${buildLessonDebuggerQuery(options)}`
		);
	}

	$effect(() => {
		if (form?.message) {
			actionMessage = form.message;
			actionError = '';
		} else if (form?.error) {
			actionError = form.error;
		}
	});

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

	function updateSelectedAgentRuntimeMode(runtimeMode: LessonAgentRuntimeMode) {
		updateSelectedBlock((block) => {
			if (block.kind !== 'agent') return;
			block.agentConfig.runtimeMode = runtimeMode;
			if (runtimeMode === 'basic') {
				block.agentConfig.enabledToolIds = undefined;
			} else if (block.agentConfig.enabledToolIds === undefined) {
				block.agentConfig.enabledToolIds = [];
			}
		});
	}

	function getSelectedAgentToolSummary(block: Extract<LessonBlock, { kind: 'agent' }>) {
		const selectedToolIds = block.agentConfig.enabledToolIds;
		const inheritsAllowedTools = selectedToolIds === undefined;
		const effectiveToolIds = inheritsAllowedTools
			? effectiveAllowedAgentToolIds
			: selectedToolIds.filter((toolId) => effectiveAllowedAgentToolIds.includes(toolId));
		const metrics = getLessonAgentToolMetrics(
			data.lessonAgentTools as LessonAgentToolPresentationItem[],
			effectiveToolIds
		);

		return {
			headline: inheritsAllowedTools
				? 'Hereda allowlist de la lesson'
				: `Allowlist propia: ${metrics.total}`,
			detail: `${metrics.total} tools · ${metrics.interactive} UI · ${metrics.hitl} HITL${metrics.persistent ? ` · ${metrics.persistent} persistentes` : ''}`
		};
	}

	function extractYoutubeVideoId(input: string): string {
		const value = input.trim();
		if (/^[a-zA-Z0-9_-]{11}$/.test(value)) return value;

		const urlMatch = value.match(
			/(?:youtube\.com\/(?:watch\?[^#]*v=|embed\/|shorts\/)|youtu\.be\/)([a-zA-Z0-9_-]{11})/
		);
		return urlMatch?.[1] ?? value;
	}

	function parseOptionalSeconds(input: string): number | null {
		if (!input.trim()) return null;
		const value = Number(input);
		return Number.isFinite(value) ? Math.max(0, value) : null;
	}

	function addYoutubePausePointToSelectedBlock() {
		updateSelectedBlock((block) => {
			if (block.kind !== 'youtube') return;
			const existingPausePoints = block.pausePoints ?? [];
			const id = `pause_${existingPausePoints.length + 1}`;
			block.pausePoints = [
				...existingPausePoints,
				{
					id,
					seconds: block.startSeconds ?? 0,
					title: 'Pausa guiada',
					body: '',
					resumeLabel: 'Continuar video'
				}
			];
		});
	}

	function removeYoutubePausePointFromSelectedBlock(pausePointId: string) {
		updateSelectedBlock((block) => {
			if (block.kind !== 'youtube') return;
			block.pausePoints = (block.pausePoints ?? []).filter(
				(pausePoint) => pausePoint.id !== pausePointId
			);
		});
	}

	function getInitialSelection(definition: LessonDefinition): SelectionState {
		const requestedBlockId = page.url.searchParams.get('blockId')?.trim();

		if (requestedBlockId) {
			return definition.blocks.some((block) => block.id === requestedBlockId)
				? { kind: 'node', id: requestedBlockId }
				: null;
		}

		return definition.blocks.some((block) => block.id === definition.entryBlockId)
			? { kind: 'node', id: definition.entryBlockId }
			: null;
	}

	function replaceSelectionUrl(blockId: string | null) {
		const url = new URL(window.location.href);

		if (blockId) {
			url.searchParams.set('blockId', blockId);
		} else {
			url.searchParams.delete('blockId');
		}

		window.history.replaceState(
			window.history.state,
			'',
			`${url.pathname}${url.search}${url.hash}`
		);
	}

	async function focusSelectedNodeInCanvas(nextSelection: SelectionState = selection) {
		if (nextSelection?.kind !== 'node') return;
		await tick();

		const node = flowNodes.find((candidate) => candidate.id === nextSelection.id);
		if (!node) return;

		const width = canvasElement?.clientWidth ?? stageElement?.clientWidth ?? 960;
		const height = canvasElement?.clientHeight ?? stageElement?.clientHeight ?? 640;
		const zoom = Math.min(Math.max(flowViewport?.zoom ?? 0.9, 0.55), 1.15);

		flowViewport = {
			x: Math.round(width / 2 - (node.position.x + 160) * zoom),
			y: Math.round(height / 2 - (node.position.y + 90) * zoom),
			zoom
		};
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

		return null;
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
		isRenamingSelectedBlock = false;
		selection = { kind: 'node', id: blockId };
		replaceSelectionUrl(blockId);
		syncCanvasFromDraft();
	}

	function selectEdge(edgeId: string) {
		isRenamingSelectedBlock = false;
		selection = { kind: 'edge', id: edgeId };
		replaceSelectionUrl(null);
		syncCanvasFromDraft();
	}

	function clearSelection() {
		isRenamingSelectedBlock = false;
		selection = null;
		replaceSelectionUrl(null);
		syncCanvasFromDraft();
	}

	function handleSelectionChange(nodes: LessonFlowGraphNode[], edges: LessonFlowEdge[]) {
		isRenamingSelectedBlock = false;

		if (nodes.length === 1 && edges.length === 0) {
			selection = { kind: 'node', id: nodes[0].id };
			replaceSelectionUrl(nodes[0].id);
			return;
		}

		if (edges.length === 1 && nodes.length === 0) {
			selection = { kind: 'edge', id: edges[0].id };
			replaceSelectionUrl(null);
			return;
		}

		if (nodes.length === 0 && edges.length === 0) {
			selection = null;
			replaceSelectionUrl(null);
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

	function edgeIdStartsFromBlock(edgeId: string, blockId: string) {
		return (
			edgeId === getLessonFlowNextEdgeId(blockId) ||
			edgeId.startsWith(`branch:${blockId}:`) ||
			edgeId.startsWith(`choice:${blockId}:`)
		);
	}

	function removeBlockConnections(definition: LessonDefinition, deletedBlockId: string) {
		for (const block of definition.blocks) {
			if (block.id === deletedBlockId) continue;

			if (block.kind !== 'choice' && block.kind !== 'end' && block.next === deletedBlockId) {
				block.next = null;
			}

			if (block.branches?.length) {
				block.branches = block.branches.map((branch) => ({
					...branch,
					targetBlockId: branch.targetBlockId === deletedBlockId ? '' : branch.targetBlockId
				}));
			}

			if (block.kind === 'choice') {
				block.options = block.options.map((option) => ({
					...option,
					targetBlockId: option.targetBlockId === deletedBlockId ? '' : option.targetBlockId
				}));
			}

			if (block.graph?.incomingOrder?.length) {
				const incomingOrder = block.graph.incomingOrder.filter(
					(edgeId) => !edgeIdStartsFromBlock(edgeId, deletedBlockId)
				);

				if (incomingOrder.length > 0) {
					block.graph = { ...block.graph, incomingOrder };
				} else if (block.graph.position) {
					block.graph = { position: block.graph.position };
				} else {
					delete block.graph;
				}
			}
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

	function closeQuickMenu() {
		quickMenuContext = 'closed';
		quickMenuQuery = '';
		quickMenuPayload = {};
	}

	function clampQuickMenuPosition(position: { x: number; y: number }) {
		const width = stageElement?.clientWidth ?? 1100;
		const height = stageElement?.clientHeight ?? 720;

		return {
			x: Math.max(16, Math.min(position.x, Math.max(16, width - 380))),
			y: Math.max(16, Math.min(position.y, Math.max(16, height - 340)))
		};
	}

	function clientToStagePosition(clientX: number, clientY: number) {
		const rect = stageElement?.getBoundingClientRect() ?? canvasElement?.getBoundingClientRect();
		if (!rect) {
			return clampQuickMenuPosition({ x: clientX, y: clientY });
		}

		return clampQuickMenuPosition({
			x: clientX - rect.left,
			y: clientY - rect.top
		});
	}

	function clientToFlowPosition(clientX: number, clientY: number) {
		const rect = stageElement?.getBoundingClientRect() ?? canvasElement?.getBoundingClientRect();
		const viewport = flowViewport ?? { x: 0, y: 0, zoom: 1 };

		if (!rect) {
			return getSuggestedPosition();
		}

		return {
			x: Math.round((clientX - rect.left - viewport.x) / viewport.zoom),
			y: Math.round((clientY - rect.top - viewport.y) / viewport.zoom)
		};
	}

	function getClientPoint(event: MouseEvent | TouchEvent) {
		if ('changedTouches' in event) {
			const touch = event.changedTouches[0] ?? event.touches[0];
			if (!touch) return null;
			return { x: touch.clientX, y: touch.clientY };
		}

		return { x: event.clientX, y: event.clientY };
	}

	function rememberCanvasPointer(event: PointerEvent | MouseEvent) {
		lastCanvasPointer = { clientX: event.clientX, clientY: event.clientY };
	}

	function getNodeQuickMenuPosition(blockId: string) {
		const node = flowNodes.find((candidate) => candidate.id === blockId);
		const viewport = flowViewport ?? { x: 0, y: 0, zoom: 1 };

		if (!node) {
			return clampQuickMenuPosition({
				x: (stageElement?.clientWidth ?? 960) / 2 - 160,
				y: (stageElement?.clientHeight ?? 640) / 2 - 140
			});
		}

		return clampQuickMenuPosition({
			x: node.position.x * viewport.zoom + viewport.x + 168,
			y: node.position.y * viewport.zoom + viewport.y + 36
		});
	}

	function openQuickMenu(
		context: Exclude<LessonFlowQuickMenuContext, 'closed'>,
		position: { x: number; y: number },
		payload: QuickMenuPayload = {}
	) {
		quickMenuContext = context;
		quickMenuPosition = clampQuickMenuPosition(position);
		quickMenuPayload = payload;
		quickMenuQuery = '';
	}

	function createQuickMenuItem(
		id: string,
		label: string,
		description: string,
		options: Partial<LessonFlowQuickMenuItem> = {}
	): LessonFlowQuickMenuItem {
		return {
			id,
			label,
			description,
			...options
		};
	}

	function buildCreateBlockQuickMenuItems(
		prefix: 'create' | 'create-connected',
		descriptionPrefix: string
	) {
		return [
			createQuickMenuItem(
				`${prefix}:content`,
				'Contenido',
				`${descriptionPrefix} un bloque narrativo o explicativo.`,
				{ keywords: ['texto', 'contenido', 'lecture'] }
			),
			createQuickMenuItem(
				`${prefix}:choice`,
				'Decision',
				`${descriptionPrefix} una decision con opciones ramificadas.`,
				{ keywords: ['decision', 'choice', 'branch'] }
			),
			createQuickMenuItem(
				`${prefix}:check`,
				'Evaluacion',
				`${descriptionPrefix} un bloque de comprobacion automatica.`,
				{ keywords: ['check', 'quiz', 'assessment'] }
			),
			createQuickMenuItem(
				`${prefix}:agent`,
				'Tutor IA',
				`${descriptionPrefix} una intervencion agéntica.`,
				{ keywords: ['agent', 'ia', 'assistant'] }
			),
			createQuickMenuItem(
				`${prefix}:youtube`,
				'YouTube',
				`${descriptionPrefix} un video guiado con pausas.`,
				{ keywords: ['youtube', 'video', 'iframe'] }
			),
			createQuickMenuItem(
				`${prefix}:end`,
				'Final',
				`${descriptionPrefix} un cierre o hito final.`,
				{ keywords: ['end', 'final', 'finish'] }
			)
		] satisfies LessonFlowQuickMenuItem[];
	}

	function getQuickMenuItems(): LessonFlowQuickMenuItem[] {
		if (quickMenuContext === 'canvas') {
			return [
				...buildCreateBlockQuickMenuItems('create', 'Anade'),
				createQuickMenuItem('center-canvas', 'Centrar vista', 'Reencuadra el mapa completo.', {
					shortcut: 'Home',
					keywords: ['fit', 'center', 'view'],
					tone: 'accent'
				}),
				createQuickMenuItem('save-flow', 'Guardar mapa', 'Persistir los cambios del studio.', {
					shortcut: 'Ctrl+S',
					keywords: ['save', 'guardar'],
					tone: 'accent'
				})
			];
		}

		if (quickMenuContext === 'connect-from-handle') {
			return buildCreateBlockQuickMenuItems('create-connected', 'Crea y conecta');
		}

		if (quickMenuContext === 'node' && selectedBlock) {
			const items: LessonFlowQuickMenuItem[] = [
				createQuickMenuItem('rename-node', 'Renombrar', 'Edita el titulo sin salir del canvas.', {
					shortcut: 'F2',
					keywords: ['rename', 'title']
				}),
				createQuickMenuItem(
					'duplicate-node',
					'Duplicar',
					'Crea una copia desconectada y desplazada del bloque.',
					{ shortcut: 'Ctrl+D', keywords: ['duplicate', 'copy'] }
				),
				createQuickMenuItem(
					'open-detail-editor',
					'Abrir editor detallado',
					'Salta a la ficha completa del bloque.',
					{
						keywords: ['detail', 'editor', 'open'],
						tone: 'accent'
					}
				),
				createQuickMenuItem(
					'open-debugger',
					'Inspeccionar en debugger',
					'Abre el debugger técnico con este bloque seleccionado, sin tocar la sesión activa.',
					{
						keywords: ['debug', 'inspect', 'preview'],
						tone: 'accent'
					}
				),
				createQuickMenuItem(
					'run-from-node',
					'Probar desde aqui',
					'Crea una preview limpia, salta a este bloque y abre la vista alumno para validarlo.',
					{
						keywords: ['debug', 'test', 'run', 'preview'],
						tone: 'accent'
					}
				)
			];

			if (selectedBlock.id !== draftDefinition.entryBlockId) {
				items.push(
					createQuickMenuItem(
						'set-entry',
						'Convertir en entrada',
						'Haz que este bloque sea el punto de inicio de la lesson.',
						{ keywords: ['entry', 'start'] }
					)
				);
			}

			items.push(...buildCreateBlockQuickMenuItems('create-connected', 'Crea junto a este bloque'));

			if (
				selectedBlock.kind === 'content' ||
				selectedBlock.kind === 'check' ||
				selectedBlock.kind === 'agent' ||
				selectedBlock.kind === 'youtube'
			) {
				items.push(
					createQuickMenuItem(
						'add-branch',
						'Anadir rama',
						'Agrega una rama condicional al bloque activo.',
						{ keywords: ['branch', 'condition'] }
					)
				);
			}

			if (selectedBlock.kind === 'choice') {
				items.push(
					createQuickMenuItem(
						'add-option',
						'Anadir opcion',
						'Agrega una opcion nueva a la decision.',
						{ keywords: ['option', 'choice'] }
					)
				);
			}

			items.push(
				createQuickMenuItem(
					'delete-node',
					'Eliminar bloque',
					'Borra el bloque seleccionado del borrador actual.',
					{ shortcut: 'Delete', keywords: ['delete', 'remove'], tone: 'danger' }
				)
			);

			return items;
		}

		if (quickMenuContext === 'edge' && selectedEdge) {
			const items: LessonFlowQuickMenuItem[] = [
				createQuickMenuItem(
					'edit-edge-target',
					'Cambiar destino',
					'La ruta queda seleccionada para ajustar su destino desde el inspector.',
					{ keywords: ['target', 'destination', 'edge'] }
				),
				createQuickMenuItem(
					'disconnect-edge',
					'Desconectar',
					'Quita el enlace pero conserva el bloque de origen.',
					{ keywords: ['disconnect', 'unlink'], tone: 'accent' }
				)
			];

			if (selectedEdge.data?.edgeType === 'branch') {
				items.push(
					createQuickMenuItem(
						'remove-branch',
						'Eliminar rama',
						'Borra la rama condicional completa del bloque.',
						{ keywords: ['branch', 'remove'], tone: 'danger' }
					)
				);
			}

			if (selectedEdge.data?.edgeType === 'choice-option') {
				items.push(
					createQuickMenuItem(
						'remove-choice-option',
						'Eliminar opcion',
						'Borra la opcion completa de la decision.',
						{ keywords: ['option', 'choice', 'remove'], tone: 'danger' }
					)
				);
			}

			return items;
		}

		return [];
	}

	function createUniqueBlockId(definition: LessonDefinition, kind: LessonBlock['kind']) {
		const baseByKind = {
			content: 'content',
			choice: 'choice',
			check: 'check',
			agent: 'agent',
			youtube: 'youtube',
			end: 'end'
		} satisfies Record<LessonBlock['kind'], string>;
		const existingIds = new Set(definition.blocks.map((block) => block.id));
		const base = baseByKind[kind];

		if (!existingIds.has(base)) return base;

		let counter = 2;
		let nextId = `${base}_${counter}`;
		while (existingIds.has(nextId)) {
			counter += 1;
			nextId = `${base}_${counter}`;
		}

		return nextId;
	}

	function createDraftBlockTemplate(
		definition: LessonDefinition,
		kind: LessonBlock['kind'],
		position: { x: number; y: number }
	): LessonBlock {
		const id = createUniqueBlockId(definition, kind);
		const graph = { position };

		if (kind === 'content') {
			return {
				id,
				kind,
				title: 'Nuevo contenido',
				body: '',
				continueLabel: 'Siguiente',
				next: null,
				assetRefs: [],
				graph
			};
		}

		if (kind === 'choice') {
			return {
				id,
				kind,
				title: 'Nueva decisión',
				body: '',
				outputKey: 'selection',
				options: [
					{
						id: 'option_1',
						label: 'Opción 1',
						value: 'option_1',
						description: '',
						targetBlockId: ''
					}
				],
				graph
			};
		}

		if (kind === 'check') {
			return {
				id,
				kind,
				title: 'Nueva evaluación',
				body: '',
				next: null,
				checkConfig: normalizeLessonCheckConfig({
					mode: 'single_choice',
					submitLabel: 'Enviar',
					retryLabel: 'Reintentar',
					continueLabel: 'Continuar',
					options: [
						{
							id: 'option_1',
							label: 'Opción 1',
							value: 'option_1',
							description: ''
						},
						{
							id: 'option_2',
							label: 'Opción 2',
							value: 'option_2',
							description: ''
						}
					],
					correctOptionIds: ['option_1']
				}),
				graph
			};
		}

		if (kind === 'agent') {
			return {
				id,
				kind,
				title: 'Nuevo bloque IA',
				body: '',
				next: null,
				requiresResponse: true,
				agentConfig: normalizeLessonAgentConfig({
					runtimeMode: 'basic',
					interactionMode: 'single_turn',
					executionTrigger: 'on_user_submit',
					autoStartOnEnter: false,
					promptTemplate: '',
					systemPrompt: '',
					placeholder: 'Escribe tu respuesta',
					submitLabel: 'Enviar',
					continueLabel: 'Continuar',
					enabledToolIds: undefined,
					outputSchema: []
				}),
				graph
			};
		}

		if (kind === 'youtube') {
			return {
				id,
				kind,
				title: 'Nuevo video YouTube',
				body: '',
				videoId: '',
				startSeconds: null,
				endSeconds: null,
				continueLabel: 'Continuar',
				pausePoints: [],
				next: null,
				graph
			};
		}

		return {
			id,
			kind,
			title: 'Bloque final',
			body: 'Has llegado al final de esta lección.',
			ctaLabel: 'Volver al curso',
			graph
		};
	}

	function disconnectBlockCopy(block: LessonBlock) {
		if (block.kind !== 'choice' && block.kind !== 'end') {
			block.next = null;
		}

		if (block.branches?.length) {
			block.branches = block.branches.map((branch) => ({
				...branch,
				targetBlockId: ''
			}));
		}

		if (block.kind === 'choice') {
			block.options = block.options.map((option) => ({
				...option,
				targetBlockId: ''
			}));
		}

		if (block.graph?.incomingOrder) {
			delete block.graph.incomingOrder;
		}
	}

	function applyConnectionToDefinition(definition: LessonDefinition, connection: Connection) {
		if (!connection.source || !connection.target) return false;

		const sourceBlock = definition.blocks.find((block) => block.id === connection.source);
		const targetBlock = definition.blocks.find((block) => block.id === connection.target);
		if (!sourceBlock || !targetBlock || sourceBlock.kind === 'end') return false;

		const edgeId = getEdgeIdFromConnection(connection);
		if (!edgeId) return false;

		let previousTargetId: string | null = null;

		if (sourceBlock.kind === 'choice') {
			if (!connection.sourceHandle?.startsWith('out:choice:')) return false;
			const optionId = connection.sourceHandle.slice(getLessonFlowChoiceHandleId('').length);
			const option = sourceBlock.options.find((candidate) => candidate.id === optionId);
			if (!option) return false;
			previousTargetId = option.targetBlockId || null;
			option.targetBlockId = connection.target;
		} else if (
			!connection.sourceHandle ||
			connection.sourceHandle === getLessonFlowNextHandleId()
		) {
			previousTargetId = sourceBlock.next ?? null;
			sourceBlock.next = connection.target;
		} else if (connection.sourceHandle.startsWith('out:branch:')) {
			const branchIndex = Number(connection.sourceHandle.split(':').at(-1) ?? '-1');
			if (
				!Number.isInteger(branchIndex) ||
				branchIndex < 0 ||
				!sourceBlock.branches?.[branchIndex]
			) {
				return false;
			}

			previousTargetId = sourceBlock.branches[branchIndex].targetBlockId || null;
			sourceBlock.branches[branchIndex].targetBlockId = connection.target;
		} else {
			return false;
		}

		if (previousTargetId && previousTargetId !== connection.target) {
			removeIncomingOrder(definition, previousTargetId, edgeId);
		}

		if (supportsDynamicIncomingOrder(targetBlock)) {
			appendIncomingOrder(definition, connection.target, edgeId);
		}

		return true;
	}

	function addBranchToSelectedBlock() {
		if (
			!selectedBlock ||
			(selectedBlock.kind !== 'content' &&
				selectedBlock.kind !== 'check' &&
				selectedBlock.kind !== 'agent' &&
				selectedBlock.kind !== 'youtube')
		)
			return;

		updateSelectedBlock((block) => {
			if (
				block.kind !== 'content' &&
				block.kind !== 'check' &&
				block.kind !== 'agent' &&
				block.kind !== 'youtube'
			)
				return;

			block.branches = [
				...(block.branches ?? []),
				{
					label: `Rama ${(block.branches?.length ?? 0) + 1}`,
					targetBlockId: '',
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

	function duplicateSelectedBlock() {
		if (!selectedBlock || isSubmitting) return;

		let duplicatedBlockId = '';

		mutateDefinition(
			(definition) => {
				const block = definition.blocks.find((candidate) => candidate.id === selectedBlock.id);
				if (!block) return;

				const duplicate = structuredClone(block);
				duplicatedBlockId = createUniqueBlockId(definition, duplicate.kind);
				duplicate.id = duplicatedBlockId;
				duplicate.title = `${duplicate.title} copia`;
				duplicate.graph = {
					...(duplicate.graph ?? {}),
					position: {
						x: (duplicate.graph?.position?.x ?? 0) + 72,
						y: (duplicate.graph?.position?.y ?? 0) + 56
					}
				};
				disconnectBlockCopy(duplicate);
				definition.blocks.push(duplicate);
			},
			duplicatedBlockId ? { kind: 'node', id: duplicatedBlockId } : selection
		);

		if (duplicatedBlockId) {
			selection = { kind: 'node', id: duplicatedBlockId };
			actionMessage = 'Se ha creado una copia desconectada del bloque seleccionado.';
			actionError = '';
			syncCanvasFromDraft();
		}
	}

	async function startRenameSelectedBlock() {
		if (!selectedBlock) return;
		isRenamingSelectedBlock = true;
		renameDraft = selectedBlock.title;
		await tick();
		renameInputElement?.focus();
		renameInputElement?.select();
	}

	function cancelRenameSelectedBlock() {
		isRenamingSelectedBlock = false;
		renameDraft = '';
	}

	function commitRenameSelectedBlock() {
		if (!selectedBlock) {
			cancelRenameSelectedBlock();
			return;
		}

		const nextTitle = renameDraft.trim();
		if (nextTitle && nextTitle !== selectedBlock.title) {
			updateSelectedBlock((block) => {
				block.title = nextTitle;
			});
		}

		isRenamingSelectedBlock = false;
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
				(block.kind !== 'content' &&
					block.kind !== 'check' &&
					block.kind !== 'agent' &&
					block.kind !== 'youtube')
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
					block.kind !== 'agent' &&
					block.kind !== 'youtube'
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

		const nextDefinition = structuredClone(commitCanvasGraph());
		const connected = applyConnectionToDefinition(nextDefinition, connection);

		if (!connected) {
			actionError = '';
			actionMessage = '';
			return;
		}

		draftDefinition = nextDefinition;
		selection = { kind: 'node', id: connection.source };
		hasUnsavedChanges = true;
		actionMessage = '';
		actionError = '';
		syncCanvasFromDraft();
	}

	function centerCanvas() {
		flowViewport = undefined;
		flowRenderVersion += 1;
	}

	function getSuggestedPosition(
		anchorBlockId: string | null = null,
		explicitPosition: { x: number; y: number } | null = null
	) {
		if (explicitPosition) {
			return {
				x: Math.round(explicitPosition.x),
				y: Math.round(explicitPosition.y)
			};
		}

		const activeAnchorBlockId =
			anchorBlockId ??
			(selection?.kind === 'node'
				? selection.id
				: selection?.kind === 'edge'
					? selectedEdge?.source
					: null);
		const anchorNode = activeAnchorBlockId
			? (flowNodes.find((node) => node.id === activeAnchorBlockId) ?? null)
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

	async function postAction(actionName: 'saveFlow', formData: FormData) {
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
			return true;
		} catch (errorValue) {
			actionError =
				errorValue instanceof Error ? errorValue.message : 'No se pudo guardar el editor visual.';
			return false;
		} finally {
			isSubmitting = false;
		}
	}

	async function openSelectedBlockDetail() {
		if (!selectedBlock) return;
		const blockId = selectedBlock.id;
		const destination = resolve(
			`/course/${cid}/lesson-studio/${ilid}/blocks/${blockId}`
		);

		if (hasUnsavedChanges) {
			const shouldSaveFirst = window.confirm(
				'Hay cambios sin guardar en el mapa. Para editar el bloque en detalle conviene guardar primero las conexiones y posiciones actuales. ¿Quieres guardar el mapa y abrir el editor detallado?'
			);

			if (!shouldSaveFirst) return;
			const saved = await saveFlow();
			if (!saved) return;
		}

		window.location.href = destination;
	}

	async function createBlock(
		kind: (typeof createButtons)[number]['kind'],
		options: CreateBlockOptions = {}
	) {
		actionError = '';
		actionMessage = '';

		try {
			const position = getSuggestedPosition(
				options.connectFrom?.sourceBlockId ?? null,
				options.position ?? null
			);
			const nextDefinition = structuredClone(commitCanvasGraph());
			const block = createDraftBlockTemplate(nextDefinition, kind, position);
			nextDefinition.blocks.push(block);

			if (!nextDefinition.entryBlockId || nextDefinition.blocks.length === 1) {
				nextDefinition.entryBlockId = block.id;
			}

			let connected = false;
			if (options.connectFrom) {
				connected = applyConnectionToDefinition(nextDefinition, {
					source: options.connectFrom.sourceBlockId,
					target: block.id,
					sourceHandle: options.connectFrom.sourceHandle,
					targetHandle: null
				});
			}

			applyActionDraft(
				nextDefinition,
				{ kind: 'node', id: block.id },
				connected
					? 'Bloque creado y conectado desde la salida activa.'
					: 'Bloque creado en el canvas. Puedes cablearlo cuando encaje.'
			);
		} catch (errorValue) {
			actionError =
				errorValue instanceof Error ? errorValue.message : 'No se pudo crear el bloque.';
		}
	}

	async function deleteSelectedBlock() {
		if (!selectedBlock) return;
		const blockId = selectedBlock.id;
		const blockTitle = selectedBlock.title;
		if (
			!window.confirm(
				`Vas a eliminar "${blockTitle}" y sus conexiones. Esta acción no se puede deshacer.`
			)
		) {
			return;
		}

		actionError = '';
		actionMessage = '';

		try {
			const nextDefinition = structuredClone(commitCanvasGraph());
			removeBlockConnections(nextDefinition, blockId);
			nextDefinition.blocks = nextDefinition.blocks.filter((block) => block.id !== blockId);

			if (nextDefinition.entryBlockId === blockId) {
				nextDefinition.entryBlockId = nextDefinition.blocks[0]?.id ?? '';
			}

			applyActionDraft(nextDefinition, null, 'Bloque eliminado. Sus conexiones se han retirado.');
		} catch (errorValue) {
			actionError =
				errorValue instanceof Error ? errorValue.message : 'No se pudo eliminar el bloque.';
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
			applyConnectionToDefinition(definition, {
				source: edge.source,
				target: nextTargetId,
				sourceHandle: edge.sourceHandle ?? null,
				targetHandle: null
			});
		});
	}

	function updateConditionValue(value: string): ConditionValue {
		if (value === '') return '';
		if (value === 'true') return true;
		if (value === 'false') return false;
		const numericValue = Number(value);
		return Number.isFinite(numericValue) && value.trim() !== '' ? numericValue : value;
	}

	async function executeQuickMenuAction(actionId: string) {
		const quickContext = quickMenuContext;
		const payload = quickMenuPayload;
		closeQuickMenu();

		if (actionId === 'center-canvas') {
			centerCanvas();
			return;
		}

		if (actionId === 'save-flow') {
			await saveFlow();
			return;
		}

		if (actionId === 'rename-node') {
			await startRenameSelectedBlock();
			return;
		}

		if (actionId === 'duplicate-node') {
			duplicateSelectedBlock();
			return;
		}

		if (actionId === 'delete-node') {
			await deleteSelectedBlock();
			return;
		}

		if (actionId === 'set-entry' && selectedBlock) {
			setEntryBlock(selectedBlock.id);
			return;
		}

		if (actionId === 'open-detail-editor' && selectedBlock) {
			await openSelectedBlockDetail();
			return;
		}

		if (actionId === 'open-debugger' && selectedBlock) {
			openLessonDebugger({
				blockId: selectedBlock.id,
				view: 'debug',
				intent: 'inspect'
			});
			return;
		}

		if (actionId === 'run-from-node' && selectedBlock) {
			openLessonDebugger({
				blockId: selectedBlock.id,
				view: 'student',
				intent: 'run',
				fresh: true
			});
			return;
		}

		if (actionId === 'add-branch') {
			addBranchToSelectedBlock();
			return;
		}

		if (actionId === 'add-option') {
			addChoiceOptionToSelectedBlock();
			return;
		}

		if (actionId === 'disconnect-edge') {
			clearSelectedEdgeConnection();
			return;
		}

		if (actionId === 'remove-branch') {
			removeSelectedBranch();
			return;
		}

		if (actionId === 'remove-choice-option') {
			removeSelectedChoiceOption();
			return;
		}

		if (actionId === 'edit-edge-target') {
			return;
		}

		if (actionId.startsWith('create-connected:')) {
			const kind = actionId.slice(
				'create-connected:'.length
			) as (typeof createButtons)[number]['kind'];
			const connectFrom =
				quickContext === 'connect-from-handle'
					? payload.sourceBlockId
						? {
								sourceBlockId: payload.sourceBlockId,
								sourceHandle: payload.sourceHandle ?? null
							}
						: null
					: selectedBlock && selectedBlock.kind !== 'end'
						? {
								sourceBlockId: selectedBlock.id,
								sourceHandle: selectedBlock.kind === 'choice' ? null : getLessonFlowNextHandleId()
							}
						: null;

			await createBlock(kind, {
				position: payload.flowPosition ?? undefined,
				...(connectFrom ? { connectFrom } : {})
			});
			return;
		}

		if (actionId.startsWith('create:')) {
			const kind = actionId.slice('create:'.length) as (typeof createButtons)[number]['kind'];
			await createBlock(kind, {
				position: payload.flowPosition ?? undefined
			});
		}
	}

	function openCanvasQuickMenuFromKeyboard() {
		if (lastCanvasPointer) {
			openQuickMenu(
				'canvas',
				clientToStagePosition(lastCanvasPointer.clientX, lastCanvasPointer.clientY),
				{
					flowPosition: clientToFlowPosition(lastCanvasPointer.clientX, lastCanvasPointer.clientY)
				}
			);
			return;
		}

		if (selectedBlock) {
			openQuickMenu('canvas', getNodeQuickMenuPosition(selectedBlock.id), {
				flowPosition: getSuggestedPosition(selectedBlock.id)
			});
			return;
		}

		const fallbackPosition = clampQuickMenuPosition({
			x: (stageElement?.clientWidth ?? 960) / 2 - 180,
			y: (stageElement?.clientHeight ?? 680) / 2 - 180
		});
		openQuickMenu('canvas', fallbackPosition, {
			flowPosition: getSuggestedPosition()
		});
	}

	function handlePaneContextMenu(event: MouseEvent) {
		event.preventDefault();
		rememberCanvasPointer(event);
		clearSelection();
		openQuickMenu('canvas', clientToStagePosition(event.clientX, event.clientY), {
			flowPosition: clientToFlowPosition(event.clientX, event.clientY)
		});
	}

	function handleNodeContextMenu(nodeId: string, event: MouseEvent) {
		event.preventDefault();
		rememberCanvasPointer(event);
		selectNode(nodeId);
		openQuickMenu('node', clientToStagePosition(event.clientX, event.clientY), {
			nodeId,
			flowPosition: getSuggestedPosition(nodeId)
		});
	}

	function handleEdgeContextMenu(edgeId: string, event: MouseEvent) {
		event.preventDefault();
		rememberCanvasPointer(event);
		selectEdge(edgeId);
		openQuickMenu('edge', clientToStagePosition(event.clientX, event.clientY), {
			edgeId
		});
	}

	function handleConnectStart(
		event: MouseEvent | TouchEvent,
		params: { nodeId: string | null; handleId: string | null }
	) {
		const point = getClientPoint(event);
		if (point) {
			lastCanvasPointer = { clientX: point.x, clientY: point.y };
		}

		pendingConnectionSource =
			params.nodeId && params.handleId
				? {
						sourceBlockId: params.nodeId,
						sourceHandle: params.handleId
					}
				: null;
	}

	function handleConnectEnd(
		event: MouseEvent | TouchEvent,
		connectionState: { toNode?: unknown | null; toHandle?: unknown | null }
	) {
		const point = getClientPoint(event);
		const connectFrom = pendingConnectionSource;
		pendingConnectionSource = null;

		if (!point) return;

		lastCanvasPointer = { clientX: point.x, clientY: point.y };

		if (!connectFrom) return;
		if (connectionState.toNode || connectionState.toHandle) return;

		openQuickMenu('connect-from-handle', clientToStagePosition(point.x, point.y), {
			sourceBlockId: connectFrom.sourceBlockId,
			sourceHandle: connectFrom.sourceHandle,
			flowPosition: clientToFlowPosition(point.x, point.y)
		});
	}

	function isEditableKeyboardTarget(target: EventTarget | null) {
		if (!(target instanceof HTMLElement)) return false;
		return Boolean(target.closest('input, textarea, select, [contenteditable="true"]'));
	}

	function handleWindowKeydown(event: KeyboardEvent) {
		if (isQuickMenuOpen) {
			if (event.key === 'Escape') {
				event.preventDefault();
				closeQuickMenu();
			}
			return;
		}

		if (isEditableKeyboardTarget(event.target)) return;

		const normalizedKey = event.key.toLowerCase();
		const hasModifier = event.metaKey || event.ctrlKey;

		if (event.key === 'Escape' && isRenamingSelectedBlock) {
			event.preventDefault();
			cancelRenameSelectedBlock();
			return;
		}

		if (event.shiftKey && normalizedKey === 'a') {
			event.preventDefault();
			openCanvasQuickMenuFromKeyboard();
			return;
		}

		if (hasModifier && normalizedKey === 's') {
			event.preventDefault();
			if (!isSubmitting) {
				void saveFlow();
			}
			return;
		}

		if (hasModifier && normalizedKey === 'd') {
			event.preventDefault();
			duplicateSelectedBlock();
			return;
		}

		if (event.key === 'F2') {
			event.preventDefault();
			void startRenameSelectedBlock();
			return;
		}

		if (event.key === 'Home') {
			event.preventDefault();
			centerCanvas();
			return;
		}

		if (event.key !== 'Delete' && event.key !== 'Del' && event.key !== 'Backspace') return;
		if (isSubmitting) return;

		event.preventDefault();
		if (selection?.kind === 'edge' && selectedEdge) {
			clearSelectedEdgeConnection();
			return;
		}

		if (selection?.kind === 'node' && selectedBlock) {
			void deleteSelectedBlock();
		}
	}

	onMount(() => {
		const handleBeforeUnload = (event: BeforeUnloadEvent) => {
			if (!hasUnsavedChanges) return;
			event.preventDefault();
			event.returnValue = '';
		};

		window.addEventListener('beforeunload', handleBeforeUnload);
		if (page.url.searchParams.get('blockId')) {
			void focusSelectedNodeInCanvas();
		}

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
				href: `/course/${page.params.cid}/lesson-studio/${page.params.ilid}`
			},
			{ label: 'Editor visual' }
		]);
	});

	{
		const loadedDefinition = cloneLoadedDefinition();
		initializeCanvas(loadedDefinition, getInitialSelection(loadedDefinition));
	}
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

		<div class="grid gap-3 sm:grid-cols-4">
			<a
				href={resolve(`/course/${cid}/lesson-studio/${ilid}`)}
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
				href={resolve(`/lesson/${ilid}?preview=published`)}
				target="_blank"
				rel="noreferrer"
				class="inline-flex items-center justify-center rounded-2xl border border-emerald-300 bg-emerald-50 px-4 py-3 text-sm font-medium text-emerald-800 shadow-sm hover:bg-emerald-100 dark:border-emerald-900/40 dark:bg-emerald-950/30 dark:text-emerald-200 dark:hover:bg-emerald-950/50"
			>
				<Eye class="mr-2 h-4 w-4" />
				Preview publicado
			</a>
			<a
				href={resolve(
					`/course/${cid}/lesson-studio/${ilid}/debug?${buildLessonDebuggerQuery({
						view: 'debug',
						intent: 'inspect'
					})}`
				)}
				class="inline-flex items-center justify-center rounded-2xl border border-sky-300 bg-sky-50 px-4 py-3 text-sm font-medium text-sky-800 shadow-sm hover:bg-sky-100 dark:border-sky-900/40 dark:bg-sky-950/30 dark:text-sky-200 dark:hover:bg-sky-950/50"
			>
				<Bug class="mr-2 h-4 w-4" />
				Abrir debugger
			</a>
		</div>

		<div
			class="rounded-[28px] border border-stone-200/80 bg-white/90 p-5 shadow-sm dark:border-stone-800 dark:bg-[#16181b]/90"
		>
			<div class="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
				<div class="max-w-3xl">
					<p
						class="text-[11px] font-semibold tracking-[0.18em] text-stone-500 uppercase dark:text-stone-400"
					>
						Revisiones
					</p>
					<h2 class="mt-2 text-base font-semibold">
						Publicado #{data.revisionSummary.published.revisionNumber} · borrador #
						{data.revisionSummary.draft.revisionNumber}
					</h2>
					<p class="mt-2 text-sm leading-6 text-stone-600 dark:text-stone-300">
						Guarda el mapa antes de publicar. El preview de borrador está aislado y los intentos
						learner existentes conservan su revisión ligada.
					</p>
				</div>

				<div class="flex flex-wrap gap-2">
					<a
						href={resolve(`/lesson/${ilid}?preview=draft`)}
						target="_blank"
						rel="noreferrer"
						class="inline-flex items-center rounded-2xl border border-sky-300 bg-sky-50 px-3.5 py-2 text-sm font-medium text-sky-800 shadow-sm transition hover:bg-sky-100 dark:border-sky-900/40 dark:bg-sky-950/30 dark:text-sky-200 dark:hover:bg-sky-950/50"
					>
						<Eye class="mr-1.5 h-4 w-4" />
						Preview borrador
					</a>
					<form
						method="POST"
						action="?/discardDraft"
						onsubmit={(event) => {
							if (
								hasDraftChanges &&
								!window.confirm('Vas a descartar el borrador actual del canvas.')
							) {
								event.preventDefault();
							}
						}}
					>
						<button
							type="submit"
							class="inline-flex items-center rounded-2xl border border-stone-300 bg-white px-3.5 py-2 text-sm font-medium text-stone-700 shadow-sm transition hover:bg-stone-50 disabled:cursor-not-allowed disabled:opacity-50 dark:border-stone-700 dark:bg-stone-900 dark:text-stone-200 dark:hover:bg-stone-800"
							disabled={!hasDraftChanges || hasUnsavedChanges || isSubmitting}
						>
							Descartar
						</button>
					</form>
					<form method="POST" action="?/publishDraft">
						<button
							type="submit"
							class="bg-primary-600 hover:bg-primary-700 inline-flex items-center rounded-2xl px-3.5 py-2 text-sm font-medium text-white shadow-sm transition disabled:cursor-not-allowed disabled:opacity-50"
							disabled={!hasDraftChanges || hasUnsavedChanges || isSubmitting}
						>
							Publicar
						</button>
					</form>
				</div>
			</div>

			<div class="mt-4 grid gap-3 lg:grid-cols-3">
				<div
					class="rounded-2xl border border-stone-200/80 bg-stone-50/80 px-4 py-3 dark:border-stone-800 dark:bg-stone-900/60"
				>
					<p
						class="text-[11px] font-semibold tracking-[0.18em] text-stone-500 uppercase dark:text-stone-400"
					>
						Diff
					</p>
					<p class="mt-2 text-sm font-semibold text-stone-900 dark:text-stone-100">
						{revisionDiff.totalChangedBlocks} bloque{revisionDiff.totalChangedBlocks === 1
							? ''
							: 's'} con cambios
					</p>
					<p class="mt-1 text-xs text-stone-500 dark:text-stone-400">
						+{revisionDiff.addedBlockIds.length} · -{revisionDiff.removedBlockIds.length} ·
						{revisionDiff.changedBlockIds.length} editados
					</p>
				</div>
				<div
					class="rounded-2xl border border-stone-200/80 bg-stone-50/80 px-4 py-3 dark:border-stone-800 dark:bg-stone-900/60"
				>
					<p
						class="text-[11px] font-semibold tracking-[0.18em] text-stone-500 uppercase dark:text-stone-400"
					>
						Intentos activos
					</p>
					<p class="mt-2 text-sm font-semibold text-stone-900 dark:text-stone-100">
						{revisionImpact.activeAttemptsOnCurrentPublishedRevision} en la revisión publicada
					</p>
					<p class="mt-1 text-xs text-stone-500 dark:text-stone-400">
						{revisionImpact.activeAttemptsOnOlderRevisions} ya siguen revisiones antiguas.
					</p>
				</div>
				<div
					class="rounded-2xl border border-stone-200/80 bg-stone-50/80 px-4 py-3 dark:border-stone-800 dark:bg-stone-900/60"
				>
					<p
						class="text-[11px] font-semibold tracking-[0.18em] text-stone-500 uppercase dark:text-stone-400"
					>
						Histórico
					</p>
					<p class="mt-2 text-sm font-semibold text-stone-900 dark:text-stone-100">
						{revisionImpact.completedAttemptsOnHistoricalRevisions} completados en revisiones históricas
					</p>
					<p class="mt-1 text-xs text-stone-500 dark:text-stone-400">
						{revisionImpact.referencedAssetFileIds.length} assets siguen referenciados.
					</p>
				</div>
			</div>
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
		class="studio-topbar shrink-0 border-b border-stone-300/60 bg-[#f7f3ec]/95 px-4 py-2.5 backdrop-blur-xl dark:border-stone-800 dark:bg-[#16181b]/95"
	>
		<div class="flex items-center gap-2">
			<!-- Back + identity -->
			<div class="flex min-w-0 flex-1 items-center gap-2.5">
				<a
					href={resolve(`/course/${cid}/lesson-studio/${ilid}`)}
					class="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-stone-300 bg-white text-stone-600 shadow-sm transition hover:bg-stone-50 active:scale-95 dark:border-stone-700 dark:bg-stone-900 dark:text-stone-200 dark:hover:bg-stone-800"
					aria-label="Volver al editor lesson"
					title="Volver al editor lesson"
				>
					<ArrowLeft class="h-3.5 w-3.5" />
				</a>

				<div class="min-w-0">
					<div class="flex items-center gap-2">
						<div class="rounded-lg bg-amber-500/12 p-1.5 text-amber-700 dark:text-amber-300">
							<LayoutTemplate class="h-3.5 w-3.5" />
						</div>
						<p
							class="text-[10px] font-semibold tracking-[0.22em] text-stone-400 uppercase dark:text-stone-500"
						>
							Lesson Studio
						</p>
					</div>
					<div class="mt-0.5 flex items-center gap-2.5">
						<h1
							class="max-w-[220px] truncate text-sm font-semibold text-stone-900 dark:text-stone-100"
						>
							{data.activity.name}
						</h1>

						<!-- Status dot indicator -->
						{#if actionError}
							<span
								class="flex items-center gap-1.5 rounded-full border border-red-200 bg-red-50 px-2 py-0.5 text-[10px] font-semibold text-red-700 dark:border-red-900/40 dark:bg-red-950/20 dark:text-red-300"
							>
								<span class="h-1.5 w-1.5 rounded-full bg-red-500"></span>
								{actionError}
							</span>
						{:else if actionMessage}
							<span
								class="flex items-center gap-1.5 rounded-full border border-emerald-200 bg-emerald-50 px-2 py-0.5 text-[10px] font-semibold text-emerald-700 dark:border-emerald-900/40 dark:bg-emerald-950/20 dark:text-emerald-300"
							>
								<span class="h-1.5 w-1.5 rounded-full bg-emerald-500"></span>
								{actionMessage}
							</span>
						{:else if hasUnsavedChanges}
							<span
								class="flex items-center gap-1.5 rounded-full border border-amber-200 bg-amber-50 px-2 py-0.5 text-[10px] font-semibold text-amber-700 dark:border-amber-900/40 dark:bg-amber-950/20 dark:text-amber-300"
							>
								<span class="h-1.5 w-1.5 animate-pulse rounded-full bg-amber-500"></span>
								Sin guardar
							</span>
						{:else}
							<span
								class="flex items-center gap-1.5 rounded-full border border-stone-200 bg-white px-2 py-0.5 text-[10px] font-medium text-stone-400 dark:border-stone-700 dark:bg-stone-900 dark:text-stone-500"
							>
								<span class="h-1.5 w-1.5 rounded-full bg-stone-400 dark:bg-stone-500"></span>
								Sincronizado
							</span>
						{/if}
					</div>
				</div>
			</div>

			<!-- Stats (compact, inline) -->
			<div class="mr-1 hidden items-center gap-1 2xl:flex">
				<div
					class="rounded-lg border border-stone-200/80 bg-white/70 px-2.5 py-1.5 text-center dark:border-stone-700 dark:bg-stone-900/60"
				>
					<p class="text-[9px] font-semibold tracking-[0.16em] text-stone-400 uppercase">Bloques</p>
					<p class="mt-0.5 text-sm leading-none font-bold text-stone-800 dark:text-stone-100">
						{draftDefinition.blocks.length}
					</p>
				</div>
				<div
					class="rounded-lg border border-stone-200/80 bg-white/70 px-2.5 py-1.5 text-center dark:border-stone-700 dark:bg-stone-900/60"
				>
					<p class="text-[9px] font-semibold tracking-[0.16em] text-stone-400 uppercase">Rutas</p>
					<p class="mt-0.5 text-sm leading-none font-bold text-stone-800 dark:text-stone-100">
						{flowEdges.length}
					</p>
				</div>
			</div>

			<!-- Separator -->
			<div class="hidden h-7 w-px bg-stone-300/70 2xl:block dark:bg-stone-700/70"></div>

			<!-- Preview group -->
			<div class="flex items-center gap-1">
				<a
					href={resolve(`/lesson/${ilid}?preview=published`)}
					target="_blank"
					rel="noreferrer"
					title="Preview publicado"
					class="inline-flex items-center gap-1.5 rounded-xl border border-emerald-300 bg-emerald-50 px-2.5 py-2 text-[11px] font-semibold text-emerald-800 shadow-sm transition hover:bg-emerald-100 active:scale-95 dark:border-emerald-900/40 dark:bg-emerald-950/30 dark:text-emerald-200 dark:hover:bg-emerald-950/50"
				>
					<Eye class="h-3.5 w-3.5" />
					<span class="hidden sm:inline">Publicado</span>
				</a>
				<a
					href={resolve(`/lesson/${ilid}?preview=draft`)}
					target="_blank"
					rel="noreferrer"
					title="Preview borrador"
					class="inline-flex items-center gap-1.5 rounded-xl border border-sky-300 bg-sky-50 px-2.5 py-2 text-[11px] font-semibold text-sky-800 shadow-sm transition hover:bg-sky-100 active:scale-95 dark:border-sky-900/40 dark:bg-sky-950/30 dark:text-sky-200 dark:hover:bg-sky-950/50"
				>
					<Eye class="h-3.5 w-3.5" />
					<span class="hidden sm:inline">Borrador</span>
				</a>
				<a
					href={resolve(
						`/course/${cid}/lesson-studio/${ilid}/debug?${buildLessonDebuggerQuery({
							blockId: selectedBlock?.id,
							view: 'debug',
							intent: 'inspect'
						})}`
					)}
					title={selectedBlock
						? `Abrir debugger en ${selectedBlock.title}`
						: 'Abrir lesson debugger'}
					class="inline-flex items-center gap-1.5 rounded-xl border border-sky-300 bg-sky-50 px-2.5 py-2 text-[11px] font-semibold text-sky-800 shadow-sm transition hover:bg-sky-100 active:scale-95 dark:border-sky-900/40 dark:bg-sky-950/30 dark:text-sky-200 dark:hover:bg-sky-950/50"
				>
					<Bug class="h-3.5 w-3.5" />
					<span class="hidden sm:inline">Debugger</span>
				</a>
				<a
					href={resolve(`/course/${cid}/admin/interactives/${ilid}`)}
					title="Ficha de actividad"
					class="inline-flex items-center rounded-xl border border-stone-300 bg-white px-2.5 py-2 text-[11px] font-semibold text-stone-600 shadow-sm transition hover:bg-stone-50 active:scale-95 dark:border-stone-700 dark:bg-stone-900 dark:text-stone-300 dark:hover:bg-stone-800"
				>
					Ficha
				</a>
			</div>

			<!-- Separator -->
			<div class="h-7 w-px bg-stone-300/70 dark:bg-stone-700/70"></div>

			<!-- Action group -->
			<div class="flex items-center gap-1">
				<button
					type="button"
					title="Centrar vista (Home)"
					class="inline-flex h-9 w-9 items-center justify-center rounded-xl border border-stone-300 bg-white text-stone-600 shadow-sm transition hover:bg-stone-50 active:scale-95 dark:border-stone-700 dark:bg-stone-900 dark:text-stone-300 dark:hover:bg-stone-800"
					onclick={centerCanvas}
				>
					<MoveRight class="h-3.5 w-3.5" />
				</button>

				<button
					type="button"
					class="inline-flex items-center gap-1.5 rounded-xl bg-stone-800 px-3 py-2 text-[11px] font-semibold text-white shadow-sm transition hover:bg-stone-700 active:scale-95 disabled:opacity-50 dark:bg-stone-100 dark:text-stone-900 dark:hover:bg-white"
					onclick={saveFlow}
					disabled={isSubmitting}
				>
					<Save class="h-3.5 w-3.5" />
					Guardar
				</button>

				<form
					method="POST"
					action="?/discardDraft"
					onsubmit={(event) => {
						if (
							hasDraftChanges &&
							!window.confirm('Vas a descartar el borrador actual del canvas.')
						) {
							event.preventDefault();
						}
					}}
				>
					<button
						type="submit"
						class="inline-flex items-center rounded-xl border border-stone-300 bg-white px-2.5 py-2 text-[11px] font-semibold text-stone-600 shadow-sm transition hover:bg-stone-50 active:scale-95 disabled:cursor-not-allowed disabled:opacity-40 dark:border-stone-700 dark:bg-stone-900 dark:text-stone-300 dark:hover:bg-stone-800"
						disabled={!hasDraftChanges || hasUnsavedChanges || isSubmitting}
					>
						Descartar
					</button>
				</form>
				<form method="POST" action="?/publishDraft">
					<button
						type="submit"
						class="inline-flex items-center rounded-xl bg-amber-500 px-3 py-2 text-[11px] font-semibold text-white shadow-sm transition hover:bg-amber-400 active:scale-95 disabled:cursor-not-allowed disabled:opacity-40"
						disabled={!hasDraftChanges || hasUnsavedChanges || isSubmitting}
					>
						Publicar
					</button>
				</form>
			</div>
		</div>
	</header>

	<div class="flex min-h-0 flex-1 overflow-hidden">
		<!-- Tool Rail — icon-only, 64px -->
		<aside
			class="studio-rail flex w-16 shrink-0 flex-col items-center gap-1.5 border-r border-stone-300/80 bg-[#f5f0e7]/90 px-2 py-3 dark:border-stone-800 dark:bg-[#17191c]"
		>
			<!-- Create buttons (icon-only, colored by type) -->
			{#each createButtons as button (button.kind)}
				{@const railColors = {
					content:
						'bg-amber-100 text-amber-700 hover:bg-amber-200/80 border-amber-200/80 dark:bg-amber-950/30 dark:text-amber-300 dark:border-amber-900/40 dark:hover:bg-amber-950/50',
					choice:
						'bg-teal-100 text-teal-700 hover:bg-teal-200/80 border-teal-200/80 dark:bg-teal-950/30 dark:text-teal-300 dark:border-teal-900/40 dark:hover:bg-teal-950/50',
					check:
						'bg-emerald-100 text-emerald-700 hover:bg-emerald-200/80 border-emerald-200/80 dark:bg-emerald-950/30 dark:text-emerald-300 dark:border-emerald-900/40 dark:hover:bg-emerald-950/50',
					agent:
						'bg-indigo-100 text-indigo-700 hover:bg-indigo-200/80 border-indigo-200/80 dark:bg-indigo-950/30 dark:text-indigo-300 dark:border-indigo-900/40 dark:hover:bg-indigo-950/50',
					youtube:
						'bg-red-100 text-red-700 hover:bg-red-200/80 border-red-200/80 dark:bg-red-950/30 dark:text-red-300 dark:border-red-900/40 dark:hover:bg-red-950/50',
					end: 'bg-rose-100 text-rose-700 hover:bg-rose-200/80 border-rose-200/80 dark:bg-rose-950/30 dark:text-rose-300 dark:border-rose-900/40 dark:hover:bg-rose-950/50'
				}[button.kind]}
				<button
					type="button"
					title={button.label}
					aria-label="Añadir bloque: {button.label}"
					class="flex h-11 w-11 items-center justify-center rounded-xl border shadow-sm transition active:scale-95 disabled:opacity-40 {railColors}"
					onclick={() => createBlock(button.kind)}
					disabled={isSubmitting}
				>
					<button.icon class="h-4.5 w-4.5" />
				</button>
			{/each}

			<!-- Separator -->
			<div class="my-1 h-px w-8 bg-stone-300/70 dark:bg-stone-700/70"></div>

			<!-- Center canvas -->
			<button
				type="button"
				title="Centrar vista (Home)"
				aria-label="Centrar vista del canvas"
				class="flex h-11 w-11 items-center justify-center rounded-xl border border-stone-300/80 bg-white/70 text-stone-500 shadow-sm transition hover:bg-white hover:text-stone-700 active:scale-95 dark:border-stone-700 dark:bg-stone-900/50 dark:text-stone-400 dark:hover:bg-stone-900 dark:hover:text-stone-200"
				onclick={centerCanvas}
			>
				<MoveRight class="h-4 w-4" />
			</button>

			<!-- Legend dots (mt-auto to push to bottom) -->
			<div class="mt-auto flex flex-col items-center gap-1.5 pb-1">
				<div class="mb-1 h-px w-6 bg-stone-300/60 dark:bg-stone-700/60"></div>
				<span class="h-2.5 w-2.5 rounded-full bg-amber-500" title="Contenido"></span>
				<span class="h-2.5 w-2.5 rounded-full bg-teal-500" title="Decisión"></span>
				<span class="h-2.5 w-2.5 rounded-full bg-emerald-500" title="Evaluación"></span>
				<span class="h-2.5 w-2.5 rounded-full bg-indigo-500" title="Tutor IA"></span>
				<span class="h-2.5 w-2.5 rounded-full bg-rose-500" title="Final"></span>
			</div>
		</aside>

		<section class="flex min-h-0 flex-1 flex-col overflow-hidden">
			<div class="flex min-h-0 flex-1 overflow-hidden p-4">
				<div
					bind:this={stageElement}
					class="studio-stage relative min-h-0 flex-1 overflow-hidden rounded-[32px] border border-stone-300/80 bg-[#f8f4ec] shadow-[0_30px_70px_-45px_rgba(24,24,27,0.65)] dark:border-stone-700 dark:bg-[#111315]"
				>
					<div
						class="pointer-events-none absolute inset-x-0 top-0 z-10 h-24 bg-linear-to-b from-[#f8f4ec] via-[#f8f4ec]/65 to-transparent dark:from-[#111315] dark:via-[#111315]/65"
					></div>

					<div class="pointer-events-none absolute top-4 left-4 z-20 flex flex-wrap gap-1.5">
						<div
							class="rounded-full border border-stone-200/70 bg-white/80 px-2.5 py-1 text-[10px] font-medium text-stone-500 shadow-sm backdrop-blur-sm dark:border-white/8 dark:bg-stone-900/80 dark:text-stone-400"
						>
							Panea con arrastre · edita en el inspector · zoom para navegar
						</div>
						<div
							class="rounded-full border border-stone-200/70 bg-white/80 px-2.5 py-1 text-[10px] font-medium text-stone-500 shadow-sm backdrop-blur-sm dark:border-white/8 dark:bg-stone-900/80 dark:text-stone-400"
						>
							<kbd class="font-mono text-[9px]">Shift+A</kbd> añadir ·
							<kbd class="font-mono text-[9px]">F2</kbd>
							renombrar · <kbd class="font-mono text-[9px]">⌘D</kbd> duplicar ·
							<kbd class="font-mono text-[9px]">Home</kbd> centrar
						</div>
					</div>

					<div
						bind:this={canvasElement}
						role="application"
						aria-label="Canvas de edición visual de lesson"
						class="h-full w-full overflow-hidden"
						onpointermove={(event) => {
							rememberCanvasPointer(event);
						}}
					>
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
								onnodecontextmenu={({ node, event }) => handleNodeContextMenu(node.id, event)}
								onedgeclick={({ edge }) => selectEdge(edge.id)}
								onedgecontextmenu={({ edge, event }) => handleEdgeContextMenu(edge.id, event)}
								onpaneclick={() => {
									closeQuickMenu();
									clearSelection();
								}}
								onpanecontextmenu={({ event }) => handlePaneContextMenu(event)}
								onselectionchange={({ nodes, edges }) =>
									handleSelectionChange(nodes as LessonFlowGraphNode[], edges as LessonFlowEdge[])}
								onnodedragstop={() => {
									commitCanvasGraph();
									hasUnsavedChanges = true;
									actionMessage = '';
									actionError = '';
								}}
								onconnectstart={handleConnectStart}
								onconnectend={handleConnectEnd}
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

					<LessonFlowQuickMenu
						open={isQuickMenuOpen}
						x={quickMenuPosition.x}
						y={quickMenuPosition.y}
						title={quickMenuTitle}
						subtitle={quickMenuSubtitle}
						query={quickMenuQuery}
						items={quickMenuItems}
						onquerychange={(value) => {
							quickMenuQuery = value;
						}}
						onclose={closeQuickMenu}
						onselect={(actionId) => {
							void executeQuickMenuAction(actionId);
						}}
					/>
				</div>
			</div>
		</section>

		{#if isInspectorCollapsed}
			<aside
				class="flex w-12 shrink-0 flex-col items-center gap-3 border-l border-stone-300/60 bg-[#f5f0e7]/90 px-2 py-4 dark:border-stone-800 dark:bg-[#17191c]"
			>
				<button
					type="button"
					class="flex h-9 w-9 items-center justify-center rounded-xl border border-stone-300 bg-white text-stone-600 shadow-sm transition hover:bg-stone-50 active:scale-95 dark:border-stone-700 dark:bg-stone-900 dark:text-stone-200 dark:hover:bg-stone-800"
					onclick={() => {
						isInspectorCollapsed = false;
					}}
					aria-label="Abrir inspector"
					title="Abrir inspector"
				>
					<ChevronRight class="h-3.5 w-3.5" />
				</button>
			</aside>
		{:else}
			<aside
				class="flex w-[360px] shrink-0 flex-col overflow-hidden border-l border-stone-300/60 bg-[#f5f0e7]/90 dark:border-stone-800 dark:bg-[#17191c]"
			>
				<div class="shrink-0 border-b border-stone-300/60 px-4 py-3.5 dark:border-stone-800">
					<div class="flex items-start justify-between gap-3">
						<div class="min-w-0 flex-1">
							<p
								class="text-[9px] font-bold tracking-[0.26em] text-stone-400 uppercase dark:text-stone-500"
							>
								Inspector
							</p>
							{#if selectedBlock && isRenamingSelectedBlock}
								<input
									bind:this={renameInputElement}
									value={renameDraft}
									class="mt-1.5 w-full rounded-xl border border-amber-300 bg-white px-3 py-2 text-base font-semibold text-stone-900 outline-hidden focus:border-amber-400 focus:ring-2 focus:ring-amber-200 dark:border-amber-700 dark:bg-stone-950 dark:text-white"
									oninput={(event) => {
										renameDraft = (event.currentTarget as HTMLInputElement).value;
									}}
									onkeydown={(event) => {
										if (event.key === 'Enter') {
											event.preventDefault();
											commitRenameSelectedBlock();
										}

										if (event.key === 'Escape') {
											event.preventDefault();
											cancelRenameSelectedBlock();
										}
									}}
									onblur={commitRenameSelectedBlock}
								/>
							{:else}
								<h2 class="mt-1 truncate text-base font-semibold text-stone-900 dark:text-white">
									{#if selectedBlock}
										{selectedBlock.title}
									{:else if selectedEdge}
										{selectedEdge.label ??
											getLessonFlowEdgeTypeLabel(selectedEdge.data?.edgeType ?? 'next')}
									{:else}
										Sin selección
									{/if}
								</h2>
							{/if}
						</div>
						<button
							type="button"
							class="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-xl border border-stone-300 bg-white text-stone-500 shadow-sm transition hover:bg-stone-50 active:scale-95 dark:border-stone-700 dark:bg-stone-900 dark:text-stone-300 dark:hover:bg-stone-800"
							title="Colapsar inspector"
							onclick={() => {
								isInspectorCollapsed = true;
							}}
						>
							<ChevronRight class="h-3.5 w-3.5" />
						</button>
					</div>
				</div>

				<div class="min-h-0 flex-1 overflow-y-auto px-4 py-4">
					{#if selectedBlock}
						<div class="space-y-4">
							<!-- ID row + entry badge -->
							<div
								class="flex items-center justify-between gap-2 rounded-xl border border-stone-200/80 bg-white/60 px-3 py-2.5 dark:border-stone-800 dark:bg-stone-950/20"
							>
								<div>
									<p
										class="text-[9px] font-bold tracking-[0.18em] text-stone-400 uppercase dark:text-stone-500"
									>
										ID técnico
									</p>
									<p class="mt-0.5 font-mono text-xs text-stone-600 dark:text-stone-300">
										{selectedBlock.id}
									</p>
								</div>
								{#if draftDefinition.entryBlockId === selectedBlock.id}
									<span
										class="shrink-0 rounded-full bg-emerald-100 px-2 py-0.5 text-[10px] font-semibold text-emerald-700 dark:bg-emerald-950/30 dark:text-emerald-300"
									>
										Entrada
									</span>
								{/if}
							</div>

							<label class="block">
								<span class="mb-1.5 block text-xs font-semibold text-stone-600 dark:text-stone-300"
									>Título</span
								>
								<input
									class="w-full rounded-xl border border-stone-200 bg-white px-3 py-2 text-sm text-stone-900 shadow-sm transition placeholder:text-stone-400 focus:border-amber-400 focus:ring-2 focus:ring-amber-200/60 focus:outline-hidden dark:border-stone-700 dark:bg-stone-950 dark:text-white dark:focus:border-amber-600 dark:focus:ring-amber-900/40"
									value={selectedBlock.title}
									oninput={(event) =>
										updateSelectedBlock((block) => {
											block.title = (event.currentTarget as HTMLInputElement).value;
										})}
								/>
							</label>

							<div class="grid grid-cols-2 gap-2">
								<div
									class="rounded-xl border border-stone-200/80 bg-white/60 px-3 py-2 dark:border-stone-800 dark:bg-stone-950/20"
								>
									<p
										class="text-[9px] font-bold tracking-[0.16em] text-stone-400 uppercase dark:text-stone-500"
									>
										Tipo
									</p>
									<p class="mt-0.5 text-xs font-semibold text-stone-800 dark:text-white">
										{selectedBlock.kind === 'content'
											? 'Contenido'
											: selectedBlock.kind === 'choice'
												? 'Decisión'
												: selectedBlock.kind === 'check'
													? 'Evaluación'
													: selectedBlock.kind === 'agent'
														? 'Tutor IA'
														: selectedBlock.kind === 'youtube'
															? 'YouTube'
															: 'Final'}
									</p>
								</div>
								<div
									class="rounded-xl border border-stone-200/80 bg-white/60 px-3 py-2 dark:border-stone-800 dark:bg-stone-950/20"
								>
									<p
										class="text-[9px] font-bold tracking-[0.16em] text-stone-400 uppercase dark:text-stone-500"
									>
										Posición
									</p>
									<p class="mt-0.5 text-xs font-semibold text-stone-800 dark:text-white">
										{Math.round(selectedBlock.graph?.position?.x ?? 0)},
										{Math.round(selectedBlock.graph?.position?.y ?? 0)}
									</p>
								</div>
							</div>

							{#if draftDefinition.entryBlockId !== selectedBlock.id}
								<button
									type="button"
									class="w-full rounded-xl border border-emerald-200 bg-emerald-50/60 px-4 py-2 text-xs font-semibold text-emerald-700 transition hover:bg-emerald-100 active:scale-95 dark:border-emerald-900/40 dark:bg-emerald-950/20 dark:text-emerald-300 dark:hover:bg-emerald-950/40"
									onclick={() => setEntryBlock(selectedBlock.id)}
								>
									<Route class="mr-1 inline h-3.5 w-3.5" />
									Marcar como bloque de entrada
								</button>
							{/if}

							{#if selectedBlock.kind === 'content'}
								<label class="block">
									<span
										class="mb-1.5 block text-xs font-semibold text-stone-600 dark:text-stone-300"
										>Texto del botón</span
									>
									<input
										class="w-full rounded-xl border border-stone-200 bg-white px-3 py-2 text-sm text-stone-900 shadow-sm transition focus:border-amber-400 focus:ring-2 focus:ring-amber-200/60 focus:outline-hidden dark:border-stone-700 dark:bg-stone-950 dark:text-white dark:focus:border-amber-600"
										value={selectedBlock.continueLabel ?? ''}
										oninput={(event) =>
											updateSelectedBlock((block) => {
												if (block.kind !== 'content') return;
												block.continueLabel = (event.currentTarget as HTMLInputElement).value;
											})}
									/>
								</label>

								<label class="block">
									<span
										class="mb-1.5 block text-xs font-semibold text-stone-600 dark:text-stone-300"
										>Siguiente bloque</span
									>
									<select
										class="w-full rounded-xl border border-stone-200 bg-white px-3 py-2 text-sm text-stone-900 shadow-sm transition focus:border-amber-400 focus:ring-2 focus:ring-amber-200/60 focus:outline-hidden dark:border-stone-700 dark:bg-stone-950 dark:text-white dark:focus:border-amber-600"
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
									class="rounded-xl border border-dashed border-stone-300/70 bg-stone-50/40 px-3 py-3 dark:border-stone-700/60 dark:bg-stone-900/20"
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
											class="rounded-xl border border-stone-200 px-3 py-1.5 text-xs font-medium text-stone-600 transition hover:bg-stone-100 active:scale-95 dark:border-stone-700 dark:text-stone-300 dark:hover:bg-stone-800"
											onclick={addBranchToSelectedBlock}
										>
											<GitBranch class="mr-1 inline h-4 w-4" />
											Añadir rama
										</button>
									</div>
								</div>
							{:else if selectedBlock.kind === 'youtube'}
								<label class="block">
									<span
										class="mb-1.5 block text-xs font-semibold text-stone-600 dark:text-stone-300"
										>URL o ID de YouTube</span
									>
									<input
										class="w-full rounded-xl border border-stone-200 bg-white px-3 py-2 text-sm text-stone-900 shadow-sm transition focus:border-amber-400 focus:ring-2 focus:ring-amber-200/60 focus:outline-hidden dark:border-stone-700 dark:bg-stone-950 dark:text-white dark:focus:border-amber-600"
										value={selectedBlock.videoId}
										placeholder="https://youtu.be/M7lc1UVf-VE"
										oninput={(event) =>
											updateSelectedBlock((block) => {
												if (block.kind !== 'youtube') return;
												block.videoId = extractYoutubeVideoId(
													(event.currentTarget as HTMLInputElement).value
												);
											})}
									/>
								</label>

								<label class="block">
									<span
										class="mb-1.5 block text-xs font-semibold text-stone-600 dark:text-stone-300"
										>Texto introductorio</span
									>
									<textarea
										class="min-h-24 w-full rounded-xl border border-stone-200 bg-white px-3 py-2 text-sm text-stone-900 shadow-sm transition focus:border-amber-400 focus:ring-2 focus:ring-amber-200/60 focus:outline-hidden dark:border-stone-700 dark:bg-stone-950 dark:text-white dark:focus:border-amber-600"
										value={selectedBlock.body ?? ''}
										oninput={(event) =>
											updateSelectedBlock((block) => {
												if (block.kind !== 'youtube') return;
												block.body = (event.currentTarget as HTMLTextAreaElement).value;
											})}
									></textarea>
								</label>

								<div class="grid gap-4 md:grid-cols-2">
									<label class="block">
										<span
											class="mb-1.5 block text-xs font-semibold text-stone-600 dark:text-stone-300"
											>Inicio (s)</span
										>
										<input
											type="number"
											min="0"
											class="w-full rounded-xl border border-stone-200 bg-white px-3 py-2 text-sm text-stone-900 shadow-sm transition focus:border-amber-400 focus:ring-2 focus:ring-amber-200/60 focus:outline-hidden dark:border-stone-700 dark:bg-stone-950 dark:text-white dark:focus:border-amber-600"
											value={selectedBlock.startSeconds ?? ''}
											oninput={(event) =>
												updateSelectedBlock((block) => {
													if (block.kind !== 'youtube') return;
													block.startSeconds = parseOptionalSeconds(
														(event.currentTarget as HTMLInputElement).value
													);
												})}
										/>
									</label>

									<label class="block">
										<span
											class="mb-1.5 block text-xs font-semibold text-stone-600 dark:text-stone-300"
											>Fin (s)</span
										>
										<input
											type="number"
											min="0"
											class="w-full rounded-xl border border-stone-200 bg-white px-3 py-2 text-sm text-stone-900 shadow-sm transition focus:border-amber-400 focus:ring-2 focus:ring-amber-200/60 focus:outline-hidden dark:border-stone-700 dark:bg-stone-950 dark:text-white dark:focus:border-amber-600"
											value={selectedBlock.endSeconds ?? ''}
											oninput={(event) =>
												updateSelectedBlock((block) => {
													if (block.kind !== 'youtube') return;
													block.endSeconds = parseOptionalSeconds(
														(event.currentTarget as HTMLInputElement).value
													);
												})}
										/>
									</label>
								</div>

								<div class="grid gap-4 md:grid-cols-2">
									<label class="block">
										<span
											class="mb-1.5 block text-xs font-semibold text-stone-600 dark:text-stone-300"
											>Botón continuar</span
										>
										<input
											class="w-full rounded-xl border border-stone-200 bg-white px-3 py-2 text-sm text-stone-900 shadow-sm transition focus:border-amber-400 focus:ring-2 focus:ring-amber-200/60 focus:outline-hidden dark:border-stone-700 dark:bg-stone-950 dark:text-white dark:focus:border-amber-600"
											value={selectedBlock.continueLabel ?? ''}
											oninput={(event) =>
												updateSelectedBlock((block) => {
													if (block.kind !== 'youtube') return;
													block.continueLabel = (event.currentTarget as HTMLInputElement).value;
												})}
										/>
									</label>

									<label class="block">
										<span
											class="mb-1.5 block text-xs font-semibold text-stone-600 dark:text-stone-300"
											>Siguiente bloque</span
										>
										<select
											class="w-full rounded-xl border border-stone-200 bg-white px-3 py-2 text-sm text-stone-900 shadow-sm transition focus:border-amber-400 focus:ring-2 focus:ring-amber-200/60 focus:outline-hidden dark:border-stone-700 dark:bg-stone-950 dark:text-white dark:focus:border-amber-600"
											value={selectedBlock.next ?? ''}
											onchange={(event) =>
												updateSelectedBlock((block) => {
													if (block.kind !== 'youtube') return;
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
									class="rounded-xl border border-dashed border-stone-300/70 bg-stone-50/40 px-3 py-3 dark:border-stone-700/60 dark:bg-stone-900/20"
								>
									<div class="flex items-center justify-between gap-3">
										<div>
											<p class="text-sm font-medium text-stone-900 dark:text-white">
												Puntos de pausa
											</p>
											<p class="text-xs text-stone-500 dark:text-stone-400">
												{selectedBlock.pausePoints?.length ?? 0} pausa{(selectedBlock.pausePoints
													?.length ?? 0) === 1
													? ''
													: 's'} configurada{(selectedBlock.pausePoints?.length ?? 0) === 1
													? ''
													: 's'}
											</p>
										</div>
										<button
											type="button"
											class="rounded-xl border border-stone-200 px-3 py-1.5 text-xs font-medium text-stone-600 transition hover:bg-stone-100 active:scale-95 dark:border-stone-700 dark:text-stone-300 dark:hover:bg-stone-800"
											onclick={addYoutubePausePointToSelectedBlock}
										>
											<Plus class="mr-1 inline h-4 w-4" />
											Añadir pausa
										</button>
									</div>

									<div class="mt-3 space-y-3">
										{#each selectedBlock.pausePoints ?? [] as pausePoint (pausePoint.id)}
											<div
												class="rounded-xl border border-stone-200 bg-white/70 p-3 dark:border-stone-800 dark:bg-stone-950/40"
											>
												<div class="mb-3 flex items-center justify-between gap-2">
													<p class="font-mono text-xs text-stone-500">{pausePoint.id}</p>
													<button
														type="button"
														class="rounded-lg border border-red-200 px-2 py-1 text-xs text-red-600 hover:bg-red-50 dark:border-red-900/50 dark:text-red-300 dark:hover:bg-red-950/30"
														onclick={() => removeYoutubePausePointFromSelectedBlock(pausePoint.id)}
													>
														Quitar
													</button>
												</div>
												<div class="grid gap-3 md:grid-cols-2">
													<label class="block">
														<span
															class="mb-1 block text-[11px] font-semibold text-stone-600 dark:text-stone-300"
															>Segundo</span
														>
														<input
															type="number"
															min="0"
															class="w-full rounded-lg border border-stone-200 bg-white px-2 py-1.5 text-sm dark:border-stone-700 dark:bg-stone-950 dark:text-white"
															value={pausePoint.seconds}
															oninput={(event) =>
																updateSelectedBlock((block) => {
																	if (block.kind !== 'youtube') return;
																	const target = block.pausePoints?.find(
																		(candidate) => candidate.id === pausePoint.id
																	);
																	if (!target) return;
																	target.seconds =
																		parseOptionalSeconds(
																			(event.currentTarget as HTMLInputElement).value
																		) ?? 0;
																})}
														/>
													</label>
													<label class="block">
														<span
															class="mb-1 block text-[11px] font-semibold text-stone-600 dark:text-stone-300"
															>Título</span
														>
														<input
															class="w-full rounded-lg border border-stone-200 bg-white px-2 py-1.5 text-sm dark:border-stone-700 dark:bg-stone-950 dark:text-white"
															value={pausePoint.title ?? ''}
															oninput={(event) =>
																updateSelectedBlock((block) => {
																	if (block.kind !== 'youtube') return;
																	const target = block.pausePoints?.find(
																		(candidate) => candidate.id === pausePoint.id
																	);
																	if (!target) return;
																	target.title = (event.currentTarget as HTMLInputElement).value;
																})}
														/>
													</label>
												</div>
												<label class="mt-3 block">
													<span
														class="mb-1 block text-[11px] font-semibold text-stone-600 dark:text-stone-300"
														>Prompt</span
													>
													<textarea
														class="min-h-20 w-full rounded-lg border border-stone-200 bg-white px-2 py-1.5 text-sm dark:border-stone-700 dark:bg-stone-950 dark:text-white"
														value={pausePoint.body ?? ''}
														oninput={(event) =>
															updateSelectedBlock((block) => {
																if (block.kind !== 'youtube') return;
																const target = block.pausePoints?.find(
																	(candidate) => candidate.id === pausePoint.id
																);
																if (!target) return;
																target.body = (event.currentTarget as HTMLTextAreaElement).value;
															})}
													></textarea>
												</label>
												<label class="mt-3 block">
													<span
														class="mb-1 block text-[11px] font-semibold text-stone-600 dark:text-stone-300"
														>Botón reanudar</span
													>
													<input
														class="w-full rounded-lg border border-stone-200 bg-white px-2 py-1.5 text-sm dark:border-stone-700 dark:bg-stone-950 dark:text-white"
														value={pausePoint.resumeLabel ?? ''}
														oninput={(event) =>
															updateSelectedBlock((block) => {
																if (block.kind !== 'youtube') return;
																const target = block.pausePoints?.find(
																	(candidate) => candidate.id === pausePoint.id
																);
																if (!target) return;
																target.resumeLabel = (
																	event.currentTarget as HTMLInputElement
																).value;
															})}
													/>
												</label>
											</div>
										{/each}
									</div>
								</div>

								<div
									class="rounded-xl border border-dashed border-stone-300/70 bg-stone-50/40 px-3 py-3 dark:border-stone-700/60 dark:bg-stone-900/20"
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
											class="rounded-xl border border-stone-200 px-3 py-1.5 text-xs font-medium text-stone-600 transition hover:bg-stone-100 active:scale-95 dark:border-stone-700 dark:text-stone-300 dark:hover:bg-stone-800"
											onclick={addBranchToSelectedBlock}
										>
											<GitBranch class="mr-1 inline h-4 w-4" />
											Añadir rama
										</button>
									</div>
								</div>
							{:else if selectedBlock.kind === 'choice'}
								<label class="block">
									<span
										class="mb-1.5 block text-xs font-semibold text-stone-600 dark:text-stone-300"
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
									class="rounded-xl border border-dashed border-stone-300/70 bg-stone-50/40 px-3 py-3 dark:border-stone-700/60 dark:bg-stone-900/20"
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
											class="rounded-xl border border-stone-200 px-3 py-1.5 text-xs font-medium text-stone-600 transition hover:bg-stone-100 active:scale-95 dark:border-stone-700 dark:text-stone-300 dark:hover:bg-stone-800"
											onclick={addChoiceOptionToSelectedBlock}
										>
											<Plus class="mr-1 inline h-4 w-4" />
											Añadir opción
										</button>
									</div>
								</div>
							{:else if selectedBlock.kind === 'check'}
								<div class="block">
									<span
										class="mb-1.5 block text-xs font-semibold text-stone-600 dark:text-stone-300"
										>Modo</span
									>
									<p
										class="rounded-xl border border-stone-200 bg-white/80 px-3 py-2 text-sm font-medium text-stone-800 dark:border-stone-700 dark:bg-stone-950 dark:text-white"
									>
										{getLessonCheckModeLabel(selectedBlock.checkConfig.mode)}
									</p>
								</div>

								<div class="grid gap-4 md:grid-cols-2">
									<label class="block">
										<span
											class="mb-1.5 block text-xs font-semibold text-stone-600 dark:text-stone-300"
											>Botón continuar</span
										>
										<input
											class="w-full rounded-xl border border-stone-200 bg-white px-3 py-2 text-sm text-stone-900 shadow-sm transition focus:border-amber-400 focus:ring-2 focus:ring-amber-200/60 focus:outline-hidden dark:border-stone-700 dark:bg-stone-950 dark:text-white dark:focus:border-amber-600"
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
										<span
											class="mb-1.5 block text-xs font-semibold text-stone-600 dark:text-stone-300"
											>Siguiente bloque</span
										>
										<select
											class="w-full rounded-xl border border-stone-200 bg-white px-3 py-2 text-sm text-stone-900 shadow-sm transition focus:border-amber-400 focus:ring-2 focus:ring-amber-200/60 focus:outline-hidden dark:border-stone-700 dark:bg-stone-950 dark:text-white dark:focus:border-amber-600"
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
									class="rounded-xl border border-dashed border-stone-300/70 bg-stone-50/40 px-3 py-3 dark:border-stone-700/60 dark:bg-stone-900/20"
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
											class="rounded-xl border border-stone-200 px-3 py-1.5 text-xs font-medium text-stone-600 transition hover:bg-stone-100 active:scale-95 dark:border-stone-700 dark:text-stone-300 dark:hover:bg-stone-800"
											onclick={addBranchToSelectedBlock}
										>
											<GitBranch class="mr-1 inline h-4 w-4" />
											Añadir rama
										</button>
									</div>
								</div>
							{:else if selectedBlock.kind === 'agent'}
								<label class="block">
									<span
										class="mb-1.5 block text-xs font-semibold text-stone-600 dark:text-stone-300"
										>Runtime</span
									>
									<select
										class="w-full rounded-xl border border-stone-200 bg-white px-3 py-2 text-sm text-stone-900 shadow-sm transition focus:border-amber-400 focus:ring-2 focus:ring-amber-200/60 focus:outline-hidden dark:border-stone-700 dark:bg-stone-950 dark:text-white dark:focus:border-amber-600"
										value={selectedBlock.agentConfig.runtimeMode}
										onchange={(event) =>
											updateSelectedAgentRuntimeMode(
												(event.currentTarget as HTMLSelectElement).value as LessonAgentRuntimeMode
											)}
									>
										<option value="basic">Básico</option>
										<option value="agent">Agéntico con tools</option>
									</select>
								</label>

								<label class="block">
									<span
										class="mb-1.5 block text-xs font-semibold text-stone-600 dark:text-stone-300"
										>Modelo</span
									>
									<select
										class="w-full rounded-xl border border-stone-200 bg-white px-3 py-2 text-sm text-stone-900 shadow-sm transition focus:border-amber-400 focus:ring-2 focus:ring-amber-200/60 focus:outline-hidden dark:border-stone-700 dark:bg-stone-950 dark:text-white dark:focus:border-amber-600"
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

								{#if selectedBlock.agentConfig.runtimeMode === 'agent'}
									{@const agentToolSummary = getSelectedAgentToolSummary(selectedBlock)}
									<div class="rounded-2xl border border-stone-200 px-4 py-4 dark:border-stone-800">
										<div class="flex flex-wrap items-start justify-between gap-3">
											<div>
												<p class="text-sm font-medium text-stone-900 dark:text-white">
													Tools del bloque
												</p>
												<p class="mt-1 text-xs text-stone-500 dark:text-stone-400">
													La política global se edita en la portada de la lesson. Aquí solo
													mantenemos un resumen del alcance de este bloque.
												</p>
											</div>
											<span
												class="rounded-full bg-stone-100 px-2.5 py-1 text-xs font-medium text-stone-700 dark:bg-stone-800 dark:text-stone-200"
											>
												{agentToolSummary.headline}
											</span>
										</div>

										<p class="mt-4 text-sm text-stone-600 dark:text-stone-300">
											{agentToolSummary.detail}
										</p>
										<p class="mt-2 text-xs text-stone-500 dark:text-stone-400">
											{selectedBlock.agentConfig.enabledToolIds === undefined
												? 'Este bloque hereda todas las tools permitidas por la lesson.'
												: 'Este bloque usa una allowlist propia dentro de la allowlist global.'}
										</p>

										<button
											type="button"
											onclick={openSelectedBlockDetail}
											disabled={isSubmitting}
											class="mt-4 inline-flex items-center rounded-2xl border border-stone-300 px-4 py-2.5 text-sm font-medium text-stone-700 hover:bg-stone-50 dark:border-stone-700 dark:text-stone-200 dark:hover:bg-gray-800"
										>
											<SquarePen class="mr-1 h-4 w-4" />
											Editar tools en bloque
										</button>
									</div>
								{/if}

								<label class="block">
									<span
										class="mb-1.5 block text-xs font-semibold text-stone-600 dark:text-stone-300"
										>Modo de interacción</span
									>
									<select
										class="w-full rounded-xl border border-stone-200 bg-white px-3 py-2 text-sm text-stone-900 shadow-sm transition focus:border-amber-400 focus:ring-2 focus:ring-amber-200/60 focus:outline-hidden dark:border-stone-700 dark:bg-stone-950 dark:text-white dark:focus:border-amber-600"
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
									<span
										class="mb-1.5 block text-xs font-semibold text-stone-600 dark:text-stone-300"
										>Disparo</span
									>
									<select
										class="w-full rounded-xl border border-stone-200 bg-white px-3 py-2 text-sm text-stone-900 shadow-sm transition focus:border-amber-400 focus:ring-2 focus:ring-amber-200/60 focus:outline-hidden dark:border-stone-700 dark:bg-stone-950 dark:text-white dark:focus:border-amber-600"
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
										<span
											class="mb-1.5 block text-xs font-semibold text-stone-600 dark:text-stone-300"
											>Botón continuar</span
										>
										<input
											class="w-full rounded-xl border border-stone-200 bg-white px-3 py-2 text-sm text-stone-900 shadow-sm transition focus:border-amber-400 focus:ring-2 focus:ring-amber-200/60 focus:outline-hidden dark:border-stone-700 dark:bg-stone-950 dark:text-white dark:focus:border-amber-600"
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
									<span
										class="mb-1.5 block text-xs font-semibold text-stone-600 dark:text-stone-300"
										>Siguiente bloque</span
									>
									<select
										class="w-full rounded-xl border border-stone-200 bg-white px-3 py-2 text-sm text-stone-900 shadow-sm transition focus:border-amber-400 focus:ring-2 focus:ring-amber-200/60 focus:outline-hidden dark:border-stone-700 dark:bg-stone-950 dark:text-white dark:focus:border-amber-600"
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
									class="rounded-xl border border-dashed border-stone-300/70 bg-stone-50/40 px-3 py-3 dark:border-stone-700/60 dark:bg-stone-900/20"
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
											class="rounded-xl border border-stone-200 px-3 py-1.5 text-xs font-medium text-stone-600 transition hover:bg-stone-100 active:scale-95 dark:border-stone-700 dark:text-stone-300 dark:hover:bg-stone-800"
											onclick={addBranchToSelectedBlock}
										>
											<GitBranch class="mr-1 inline h-4 w-4" />
											Añadir rama
										</button>
									</div>
								</div>
							{:else if selectedBlock.kind === 'end'}
								<label class="block">
									<span
										class="mb-1.5 block text-xs font-semibold text-stone-600 dark:text-stone-300"
										>Texto CTA</span
									>
									<input
										class="w-full rounded-xl border border-stone-200 bg-white px-3 py-2 text-sm text-stone-900 shadow-sm transition focus:border-amber-400 focus:ring-2 focus:ring-amber-200/60 focus:outline-hidden dark:border-stone-700 dark:bg-stone-950 dark:text-white dark:focus:border-amber-600"
										value={selectedBlock.ctaLabel ?? ''}
										oninput={(event) =>
											updateSelectedBlock((block) => {
												if (block.kind !== 'end') return;
												block.ctaLabel = (event.currentTarget as HTMLInputElement).value;
											})}
									/>
								</label>
							{/if}

							<div class="grid gap-2">
								<button
									type="button"
									onclick={openSelectedBlockDetail}
									disabled={isSubmitting}
									class="inline-flex items-center justify-center gap-2 rounded-xl bg-amber-500 px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-amber-600 active:scale-95 disabled:cursor-not-allowed disabled:opacity-60"
								>
									<SquarePen class="h-4 w-4" />
									{hasUnsavedChanges ? 'Guardar mapa y editar detalle' : 'Editar bloque en detalle'}
								</button>

								<a
									href={resolve(
										`/course/${cid}/lesson-studio/${ilid}/debug?${buildLessonDebuggerQuery(
											{
												blockId: selectedBlock.id,
												view: 'debug',
												intent: 'inspect'
											}
										)}`
									)}
									class="inline-flex items-center justify-center gap-2 rounded-xl border border-sky-300 bg-sky-50 px-4 py-2.5 text-sm font-semibold text-sky-800 shadow-sm transition hover:bg-sky-100 active:scale-95 dark:border-sky-900/40 dark:bg-sky-950/30 dark:text-sky-200 dark:hover:bg-sky-950/50"
								>
									<Bug class="h-4 w-4" />
									Inspeccionar en debugger
								</a>

								<a
									href={resolve(
										`/course/${cid}/lesson-studio/${ilid}/debug?${buildLessonDebuggerQuery(
											{
												blockId: selectedBlock.id,
												view: 'student',
												intent: 'run',
												fresh: true
											}
										)}`
									)}
									class="inline-flex items-center justify-center gap-2 rounded-xl bg-sky-600 px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-sky-700 active:scale-95 dark:bg-sky-500 dark:text-slate-950 dark:hover:bg-sky-400"
								>
									<Eye class="h-4 w-4" />
									Probar desde aquí
								</a>

								<button
									type="button"
									class="inline-flex items-center justify-center gap-2 rounded-xl border border-red-200 px-4 py-2 text-xs font-medium text-red-600 transition hover:bg-red-50 active:scale-95 dark:border-red-900/40 dark:text-red-400 dark:hover:bg-red-950/20"
									onclick={deleteSelectedBlock}
									disabled={isSubmitting}
								>
									<Trash2 class="h-3.5 w-3.5" />
									Eliminar bloque
								</button>
							</div>
						</div>
					{:else if selectedEdge}
						<div class="space-y-5">
							<div
								class="rounded-xl border border-stone-200/80 bg-white/60 px-3 py-3 dark:border-stone-800 dark:bg-stone-950/20"
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
								<span class="mb-1.5 block text-xs font-semibold text-stone-600 dark:text-stone-300"
									>Destino</span
								>
								<select
									class="w-full rounded-xl border border-stone-200 bg-white px-3 py-2 text-sm text-stone-900 shadow-sm transition focus:border-amber-400 focus:ring-2 focus:ring-amber-200/60 focus:outline-hidden dark:border-stone-700 dark:bg-stone-950 dark:text-white dark:focus:border-amber-600"
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
									<span
										class="mb-1.5 block text-xs font-semibold text-stone-600 dark:text-stone-300"
										>Etiqueta</span
									>
									<input
										class="w-full rounded-xl border border-stone-200 bg-white px-3 py-2 text-sm text-stone-900 shadow-sm transition focus:border-amber-400 focus:ring-2 focus:ring-amber-200/60 focus:outline-hidden dark:border-stone-700 dark:bg-stone-950 dark:text-white dark:focus:border-amber-600"
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
														block.kind !== 'agent' &&
														block.kind !== 'youtube')
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
										<span
											class="mb-1.5 block text-xs font-semibold text-stone-600 dark:text-stone-300"
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
															block.kind !== 'agent' &&
															block.kind !== 'youtube')
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
										<span
											class="mb-1.5 block text-xs font-semibold text-stone-600 dark:text-stone-300"
											>Operador</span
										>
										<select
											class="w-full rounded-xl border border-stone-200 bg-white px-3 py-2 text-sm text-stone-900 shadow-sm transition focus:border-amber-400 focus:ring-2 focus:ring-amber-200/60 focus:outline-hidden dark:border-stone-700 dark:bg-stone-950 dark:text-white dark:focus:border-amber-600"
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
															block.kind !== 'agent' &&
															block.kind !== 'youtube')
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
									<span
										class="mb-1.5 block text-xs font-semibold text-stone-600 dark:text-stone-300"
										>Valor esperado</span
									>
									<input
										class="w-full rounded-xl border border-stone-200 bg-white px-3 py-2 text-sm text-stone-900 shadow-sm transition focus:border-amber-400 focus:ring-2 focus:ring-amber-200/60 focus:outline-hidden dark:border-stone-700 dark:bg-stone-950 dark:text-white dark:focus:border-amber-600"
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
														block.kind !== 'agent' &&
														block.kind !== 'youtube')
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
									class="inline-flex items-center justify-center rounded-xl border border-red-200 bg-red-50/40 px-3 py-1.5 text-xs font-medium text-red-600 transition hover:bg-red-100 active:scale-95 dark:border-red-900/40 dark:bg-red-950/10 dark:text-red-400 dark:hover:bg-red-950/30"
									onclick={removeSelectedBranch}
								>
									<Trash2 class="mr-1 h-4 w-4" />
									Eliminar rama
								</button>
							{:else if selectedEdge.data?.edgeType === 'choice-option'}
								<label class="block">
									<span
										class="mb-1.5 block text-xs font-semibold text-stone-600 dark:text-stone-300"
										>Etiqueta visible</span
									>
									<input
										class="w-full rounded-xl border border-stone-200 bg-white px-3 py-2 text-sm text-stone-900 shadow-sm transition focus:border-amber-400 focus:ring-2 focus:ring-amber-200/60 focus:outline-hidden dark:border-stone-700 dark:bg-stone-950 dark:text-white dark:focus:border-amber-600"
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
									<span
										class="mb-1.5 block text-xs font-semibold text-stone-600 dark:text-stone-300"
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
									class="inline-flex items-center justify-center rounded-xl border border-red-200 bg-red-50/40 px-3 py-1.5 text-xs font-medium text-red-600 transition hover:bg-red-100 active:scale-95 dark:border-red-900/40 dark:bg-red-950/10 dark:text-red-400 dark:hover:bg-red-950/30"
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
									class="inline-flex items-center justify-center rounded-xl border border-red-200 bg-red-50/40 px-3 py-1.5 text-xs font-medium text-red-600 transition hover:bg-red-100 active:scale-95 dark:border-red-900/40 dark:bg-red-950/10 dark:text-red-400 dark:hover:bg-red-950/30"
									onclick={clearSelectedNextEdge}
								>
									<Trash2 class="mr-1 h-4 w-4" />
									Quitar siguiente por defecto
								</button>
							{/if}
						</div>
					{:else}
						<div class="flex flex-col items-center justify-center py-12 text-center">
							<div
								class="mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-stone-100/80 text-stone-400 dark:bg-stone-800/60 dark:text-stone-500"
							>
								<LayoutTemplate class="h-6 w-6" />
							</div>
							<p class="text-sm font-semibold text-stone-700 dark:text-stone-200">Sin selección</p>
							<p class="mt-2 max-w-[220px] text-xs leading-5 text-stone-400 dark:text-stone-500">
								Haz clic en un bloque o una conexión para editarla aquí.
							</p>
							<div
								class="mt-5 flex flex-col gap-1.5 text-[10px] text-stone-400 dark:text-stone-500"
							>
								<span class="flex items-center gap-2"
									><kbd
										class="rounded bg-stone-200/80 px-1.5 py-0.5 font-mono text-[9px] dark:bg-stone-800"
										>Shift+A</kbd
									> Añadir bloque</span
								>
								<span class="flex items-center gap-2"
									><kbd
										class="rounded bg-stone-200/80 px-1.5 py-0.5 font-mono text-[9px] dark:bg-stone-800"
										>F2</kbd
									> Renombrar selección</span
								>
								<span class="flex items-center gap-2"
									><kbd
										class="rounded bg-stone-200/80 px-1.5 py-0.5 font-mono text-[9px] dark:bg-stone-800"
										>Home</kbd
									> Centrar vista</span
								>
							</div>
						</div>
					{/if}
				</div>
			</aside>
		{/if}
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

	:global(.lesson-flow-shell .svelte-flow__edge.selected .svelte-flow__edge-path) {
		stroke: rgb(124, 58, 237);
		stroke-width: 3.5;
		filter: drop-shadow(0 4px 10px rgba(124, 58, 237, 0.28));
	}

	:global(.lesson-flow-shell .svelte-flow__edge.selected .svelte-flow__edge-text) {
		fill: rgb(91, 33, 182);
		font-weight: 700;
	}

	:global(.dark .lesson-flow-shell .svelte-flow__edge.selected .svelte-flow__edge-text) {
		fill: rgb(221, 214, 254);
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
