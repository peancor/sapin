import { BUILTIN_TOOL_USAGE_DOMAIN_AGENT_CHAT } from '../constants';
import type { ToolManifest } from '../types';

export const renderAttentionControlTestManifest: ToolManifest = {
	name: 'render_attention_control_test',
	displayName: 'Mostrar Test de Atencion y Control',
	description:
		'Genera y muestra una prueba inmersiva de atencion e inhibicion. La primera entrega incluye Go/No-Go, Stroop y Flanker.',
	category: 'ui',
	parametersSchema: {
		type: 'object',
		properties: {
			title: { type: 'string', description: 'Titulo del test' },
			testType: {
				type: 'string',
				enum: ['go_no_go', 'stroop', 'flanker', 'sdmt'],
				description: 'Tipo de test de atencion y control'
			},
			difficulty: {
				type: 'string',
				enum: ['easy', 'medium', 'hard'],
				description: 'Nivel de dificultad'
			},
			instructions: { type: 'string', description: 'Instrucciones visibles antes de empezar' },
			practiceTrials: { type: 'number', description: 'Numero de ensayos de practica' },
			mainTrials: { type: 'number', description: 'Numero de ensayos principales' },
			goStimulus: { type: 'string', description: 'Estimulo objetivo para Go/No-Go' },
			noGoStimulus: { type: 'string', description: 'Estimulo inhibitorio para Go/No-Go' }
		}
	},
	executorType: 'builtin',
	executorConfig: { handler: 'ui_renderer', componentKey: 'AttentionControlTest', interactive: true },
	requiresConfirmation: false,
	riskLevel: 'low',
	isSystem: true,
	version: '1.0.0',
	usageDomain: BUILTIN_TOOL_USAGE_DOMAIN_AGENT_CHAT
};
