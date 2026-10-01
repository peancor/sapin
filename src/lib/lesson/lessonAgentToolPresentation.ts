export interface LessonAgentToolPresentationItem {
	id: string;
	name: string;
	displayName: string;
	description: string;
	category: string;
	requiresConfirmation: boolean;
	isInteractiveUi: boolean;
	isPersistent: boolean;
}

export type LessonAgentToolGroupId =
	| 'evaluation_interaction'
	| 'search_consult'
	| 'sensitive_actions'
	| 'utilities';

export interface LessonAgentToolGroup {
	id: LessonAgentToolGroupId;
	title: string;
	description: string;
	tools: LessonAgentToolPresentationItem[];
}

export interface LessonAgentToolMetrics {
	total: number;
	interactive: number;
	hitl: number;
	persistent: number;
}

const GROUP_META: Record<
	LessonAgentToolGroupId,
	{ title: string; description: string }
> = {
	evaluation_interaction: {
		title: 'Evaluacion e interaccion',
		description: 'Quizzes, flashcards, tests y otras herramientas que convierten la IA en experiencia pedagogica visible.'
	},
	search_consult: {
		title: 'Busqueda y consulta',
		description: 'Herramientas para leer contexto, consultar progreso o recuperar informacion util antes de responder.'
	},
	sensitive_actions: {
		title: 'Comunicacion y acciones sensibles',
		description: 'Operaciones con impacto externo o persistente que conviene revisar con mas cuidado.'
	},
	utilities: {
		title: 'Utilidades',
		description: 'Capacidades de apoyo que no encajan en los grupos anteriores pero siguen siendo lesson-safe.'
	}
};

function sortTools(tools: LessonAgentToolPresentationItem[]): LessonAgentToolPresentationItem[] {
	return [...tools].sort(
		(left, right) => left.displayName.localeCompare(right.displayName, 'es')
	);
}

function resolveGroupId(tool: LessonAgentToolPresentationItem): LessonAgentToolGroupId {
	if (
		tool.isInteractiveUi ||
		tool.name.startsWith('render_') ||
		tool.category === 'evaluation'
	) {
		return 'evaluation_interaction';
	}

	if (
		tool.isPersistent ||
		tool.requiresConfirmation ||
		tool.category === 'communication' ||
		tool.category === 'notification'
	) {
		return 'sensitive_actions';
	}

	if (
		tool.name.startsWith('search_') ||
		tool.name.startsWith('get_') ||
		tool.category === 'search' ||
		tool.category === 'retrieval'
	) {
		return 'search_consult';
	}

	return 'utilities';
}

export function getLessonAgentToolGroups(
	tools: LessonAgentToolPresentationItem[]
): LessonAgentToolGroup[] {
	const grouped = new Map<LessonAgentToolGroupId, LessonAgentToolPresentationItem[]>();

	for (const tool of tools) {
		const groupId = resolveGroupId(tool);
		const current = grouped.get(groupId) ?? [];
		current.push(tool);
		grouped.set(groupId, current);
	}

	return (Object.keys(GROUP_META) as LessonAgentToolGroupId[])
		.map((groupId) => {
			const items = grouped.get(groupId) ?? [];
			return {
				id: groupId,
				title: GROUP_META[groupId].title,
				description: GROUP_META[groupId].description,
				tools: sortTools(items)
			} satisfies LessonAgentToolGroup;
		})
		.filter((group) => group.tools.length > 0);
}

export function getLessonAgentToolMetrics(
	tools: LessonAgentToolPresentationItem[],
	selectedToolIds: string[]
): LessonAgentToolMetrics {
	const selectedIds = new Set(selectedToolIds);
	const selectedTools = tools.filter((tool) => selectedIds.has(tool.id));

	return {
		total: selectedTools.length,
		interactive: selectedTools.filter((tool) => tool.isInteractiveUi).length,
		hitl: selectedTools.filter((tool) => tool.requiresConfirmation).length,
		persistent: selectedTools.filter((tool) => tool.isPersistent).length
	};
}
