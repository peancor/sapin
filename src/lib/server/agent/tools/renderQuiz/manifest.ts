import {
	BUILTIN_TOOL_USAGE_DOMAIN_AGENT_CHAT
} from '../constants';
import type { ToolManifest } from '../types';

export const renderQuizManifest: ToolManifest = {
	name: 'render_quiz',
	displayName: 'Mostrar Quiz Interactivo',
	description:
		'Genera y muestra un quiz interactivo de opción múltiple directamente en el chat. Úsalo cuando quieras evaluar la comprensión del estudiante con preguntas sobre los temas estudiados.',
	category: 'ui',
	parametersSchema: {
		type: 'object',
		properties: {
			title: { type: 'string', description: 'Título del quiz' },
			questions: {
				type: 'array',
				description: 'Lista de preguntas del quiz',
				items: {
					type: 'object',
					properties: {
						question: { type: 'string', description: 'Texto de la pregunta' },
						options: { type: 'array', description: 'Opciones de respuesta', items: { type: 'string' } },
						correctIndex: {
							type: 'integer',
							description: 'Índice de la respuesta correcta (0-based)'
						},
						explanation: { type: 'string', description: 'Explicación opcional de la respuesta correcta' }
					},
					required: ['question', 'options', 'correctIndex']
				}
			}
		},
		required: ['questions']
	},
	executorType: 'builtin',
	executorConfig: { handler: 'ui_renderer', componentKey: 'QuizCard', interactive: true },
	requiresConfirmation: false,
	riskLevel: 'low',
	isSystem: true,
	version: '1.0.0',
	usageDomain: BUILTIN_TOOL_USAGE_DOMAIN_AGENT_CHAT
};

