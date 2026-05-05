import { BUILTIN_TOOL_USAGE_DOMAIN_AGENT_CHAT } from '../constants';
import type { ToolManifest } from '../types';

export const renderWorkingMemoryTestManifest: ToolManifest = {
	name: 'render_working_memory_test',
	displayName: 'Mostrar Test de Memoria de Trabajo',
	description:
		'Genera y muestra una prueba inmersiva de memoria de trabajo. La primera variante disponible es Digit Span.',
	category: 'ui',
	parametersSchema: {
		type: 'object',
		properties: {
			title: { type: 'string', description: 'Titulo del test' },
			testType: {
				type: 'string',
				enum: ['digit_span'],
				description: 'Tipo de test de memoria de trabajo'
			},
			mode: {
				type: 'string',
				enum: ['forward', 'backward', 'both'],
				description: 'Modo del Digit Span'
			},
			difficulty: {
				type: 'string',
				enum: ['easy', 'medium', 'hard'],
				description: 'Nivel de dificultad'
			},
			instructions: { type: 'string', description: 'Instrucciones visibles antes de empezar' },
			startLength: { type: 'number', description: 'Longitud inicial de la secuencia' },
			maxLength: { type: 'number', description: 'Longitud maxima a evaluar' },
			trialsPerLength: {
				type: 'number',
				description: 'Numero de intentos por longitud antes de avanzar o cortar'
			}
		}
	},
	executorType: 'builtin',
	executorConfig: { handler: 'ui_renderer', componentKey: 'WorkingMemoryTest', interactive: true },
	requiresConfirmation: false,
	riskLevel: 'low',
	isSystem: true,
	version: '1.0.0',
	usageDomain: BUILTIN_TOOL_USAGE_DOMAIN_AGENT_CHAT
};
