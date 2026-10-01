import type { ToolDefinitionResolved } from '$lib/types/agent';
import type { StaffAgentWorkspaceKind } from '$lib/types/staffAgent';

function formatTools(tools: ToolDefinitionResolved[]): string {
	if (tools.length === 0) return 'No hay herramientas habilitadas.';

	return tools
		.map(
			(tool) =>
				`### ${tool.displayName} (\`${tool.name}\`)\n${tool.description}${
					tool.requiresConfirmation ? '\nRequiere confirmacion humana antes de ejecutarse.' : ''
				}`
		)
		.join('\n\n');
}

function formatContext(kind: StaffAgentWorkspaceKind, value: Record<string, unknown>): string {
	const entries = Object.entries(value)
		.filter(([, current]) => current !== null && current !== undefined && current !== '')
		.map(([key, current]) => {
			if (Array.isArray(current)) {
				return `${key}: ${JSON.stringify(current)}`;
			}
			if (typeof current === 'object') {
				return `${key}: ${JSON.stringify(current)}`;
			}
			return `${key}: ${String(current)}`;
		});

	const header =
		kind === 'course_staff' ? '## Contexto del curso' : '## Contexto de la actividad';

	return `${header}\n${entries.join('\n')}`;
}

export class StaffAgentPromptBuilder {
	static build(params: {
		kind: StaffAgentWorkspaceKind;
		role?: string | null;
		instructions?: string | null;
		context?: string | null;
		systemPrompt?: string | null;
		runtimeContext: Record<string, unknown>;
		tools: ToolDefinitionResolved[];
	}): string {
		const template =
			params.systemPrompt ??
			`Eres {role}.

{instructions}

{context}

{runtimeContext}

## Herramientas disponibles
{tools}

## Politica de respuesta
- Trabajas para personal docente y de coordinacion.
- Responde siempre en espanol.
- Basa tus conclusiones en evidencia recuperada por herramientas o en el contexto base del workspace.
- Distingue con claridad entre observaciones, inferencias y limitaciones.
- Si faltan datos, dilo y propone la siguiente consulta mas util.
- No ejecutes acciones reales fuera de la consulta y el analisis. En esta version solo puedes leer y analizar.
- Cuando hables de alumnos destacados o problematicos, explica por que con senales observables y evita diagnosticos o juicios absolutos.
`;

		const defaultRole =
			params.kind === 'course_staff'
				? 'asistente docente de curso'
				: 'asistente docente de actividad';
		const defaultInstructions =
			params.kind === 'course_staff'
				? 'Ayuda al staff a responder preguntas sobre progreso, participacion, riesgo y alumnos destacados del curso.'
				: 'Ayuda al staff a responder preguntas sobre participacion, evidencia y rendimiento en la actividad actual.';
		const defaultContext =
			params.kind === 'course_staff'
				? 'Prioriza comparativas entre alumnos, deteccion de senales tempranas y explicaciones accionables para el profesorado.'
				: 'Prioriza la actividad actual, pero usa el contexto del curso si ayuda a interpretar la evidencia.';

		return template
			.replaceAll('{role}', params.role?.trim() || defaultRole)
			.replaceAll('{instructions}', params.instructions?.trim() || defaultInstructions)
			.replaceAll('{context}', params.context?.trim() || defaultContext)
			.replaceAll('{runtimeContext}', formatContext(params.kind, params.runtimeContext))
			.replaceAll('{tools}', formatTools(params.tools));
	}
}

export default StaffAgentPromptBuilder;
