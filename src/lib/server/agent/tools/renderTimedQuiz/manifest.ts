import {
	BUILTIN_TOOL_USAGE_DOMAIN_AGENT_CHAT
} from '../constants';
import type { ToolManifest } from '../types';

export const renderTimedQuizManifest: ToolManifest = {
	name: 'render_timed_quiz',
	displayName: 'Mostrar Quiz Contrarreloj',
	description:
		'Genera y muestra un quiz secuencial con temporizador por dificultad, estilo minijuego, directamente en el chat.',
	category: 'ui',
	parametersSchema: {
		type: 'object',
		properties: {
			title: { type: 'string', description: 'Título del quiz' },
			difficulty: {
				type: 'string',
				enum: ['easy', 'medium', 'hard'],
				description: 'Nivel de dificultad del quiz'
			},
			timerByDifficultySec: {
				type: 'object',
				description: 'Segundos por pregunta para cada dificultad',
				properties: {
					easy: { type: 'number' },
					medium: { type: 'number' },
					hard: { type: 'number' }
				}
			},
			autoAdvanceDelayMs: {
				type: 'number',
				description: 'Pausa breve antes de pasar a la siguiente pregunta'
			},
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
	executorConfig: { handler: 'ui_renderer', componentKey: 'TimedQuizCard', interactive: true },
	requiresConfirmation: false,
	riskLevel: 'low',
	isSystem: true,
	version: '1.0.0',
	usageDomain: BUILTIN_TOOL_USAGE_DOMAIN_AGENT_CHAT
};

