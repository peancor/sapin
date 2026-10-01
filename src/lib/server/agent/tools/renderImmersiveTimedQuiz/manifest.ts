import { BUILTIN_TOOL_USAGE_DOMAIN_AGENT_CHAT } from '../constants';
import type { ToolManifest } from '../types';

export const renderImmersiveTimedQuizManifest: ToolManifest = {
	name: 'render_immersive_timed_quiz',
	displayName: 'Mostrar Quiz Contrarreloj Inmersivo',
	description:
		'Genera y muestra un quiz contrarreloj a pantalla completa, con HUD, temporizador y estilo arcade.',
	category: 'ui',
	parametersSchema: {
		type: 'object',
		properties: {
			title: { type: 'string', description: 'Titulo del quiz' },
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
							description: 'Indice de la respuesta correcta (0-based)'
						},
						explanation: { type: 'string', description: 'Explicacion opcional de la respuesta correcta' }
					},
					required: ['question', 'options', 'correctIndex']
				}
			}
		},
		required: ['questions']
	},
	executorType: 'builtin',
	executorConfig: { handler: 'ui_renderer', componentKey: 'ImmersiveTimedQuiz', interactive: true },
	requiresConfirmation: false,
	riskLevel: 'low',
	isSystem: true,
	version: '1.0.0',
	usageDomain: BUILTIN_TOOL_USAGE_DOMAIN_AGENT_CHAT
};
