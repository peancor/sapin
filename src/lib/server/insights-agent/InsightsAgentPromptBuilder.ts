import type { ToolDefinitionResolved } from '$lib/types/agent';
import type { InsightsAgentRunScope } from '$lib/types/insightsAgent';
import type { LearningEvidenceOverview } from '$lib/types/learningEvidence';

function formatScope(scope: InsightsAgentRunScope): string {
	const parts: string[] = [`Modo: ${scope.mode}`];

	if (scope.studentIds.length > 0) {
		parts.push(`Estudiantes filtrados: ${scope.studentIds.join(', ')}`);
	}
	if (scope.chatIds.length > 0) {
		parts.push(`Sesiones filtradas: ${scope.chatIds.join(', ')}`);
	}
	if (scope.dateFrom) {
		parts.push(`Desde: ${scope.dateFrom}`);
	}
	if (scope.dateTo) {
		parts.push(`Hasta: ${scope.dateTo}`);
	}
	if (scope.search) {
		parts.push(`Busqueda textual: ${scope.search}`);
	}

	return parts.join('\n');
}

function formatOverview(overview: LearningEvidenceOverview): string {
	return [
		`Actividad: ${overview.activity.name}`,
		`Tipo de actividad: ${overview.activity.activityType}`,
		`Estudiantes matriculados: ${overview.totalEnrolledStudents}`,
		`Estudiantes con evidencia: ${overview.studentsWithEvidenceCount}`,
		`Sesiones totales: ${overview.totalSessions}`,
		`Mensajes totales: ${overview.totalMessages}`,
		overview.lastActivityAt ? `Ultima actividad: ${overview.lastActivityAt}` : null
	]
		.filter((value): value is string => Boolean(value))
		.join('\n');
}

export class InsightsAgentPromptBuilder {
	static build(params: {
		role?: string | null;
		instructions?: string | null;
		context?: string | null;
		systemPrompt?: string | null;
		overview: LearningEvidenceOverview;
		scope: InsightsAgentRunScope;
		tools: ToolDefinitionResolved[];
	}): string {
		const toolSection =
			params.tools.length > 0
				? params.tools
						.map(
							(tool) =>
								`### ${tool.displayName} (\`${tool.name}\`)\n${tool.description}${
									tool.requiresConfirmation
										? '\nEsta herramienta requiere confirmacion humana antes de ejecutarse.'
										: ''
								}`
						)
						.join('\n\n')
				: 'No hay herramientas habilitadas.';

		const template =
			params.systemPrompt ??
			`Eres {role}.

{instructions}

{context}

## Contexto base de la actividad
{overview}

## Alcance actual del analisis
{scope}

## Herramientas disponibles
{tools}

## Politica de analisis
- Basa todas tus conclusiones en evidencia recuperada por herramientas o en el contexto base anterior.
- Distingue siempre entre observaciones, interpretaciones e incertidumbres.
- No diagnostiques ni atribuyas intenciones, emociones o fraude sin evidencia suficiente.
- Cuando falten datos, dilo explicitamente y propone la siguiente consulta o herramienta a usar.
- Prioriza hallazgos utiles para docencia, seguimiento, alertas tempranas y mejora de actividad.
- Si produces recomendaciones, conectalas con evidencia concreta.
- Responde en espanol.
`;

		return template
			.replaceAll('{role}', params.role?.trim() || 'analista experto en learning analytics')
			.replaceAll(
				'{instructions}',
				params.instructions?.trim() ||
					'Tu objetivo es ayudar al profesorado a entender mejor el aprendizaje y la participacion.'
			)
			.replaceAll(
				'{context}',
				params.context?.trim() ||
					'Usa el minimo numero de herramientas necesario, pero no inventes datos.'
			)
			.replaceAll('{overview}', formatOverview(params.overview))
			.replaceAll('{scope}', formatScope(params.scope))
			.replaceAll('{tools}', toolSection);
	}
}
