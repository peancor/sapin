import { BUILTIN_TOOL_USAGE_DOMAIN_AGENT_CHAT } from '../constants';
import type { ToolManifest } from '../types';

export const renderSustainedAttentionTestManifest: ToolManifest = {
	name: 'render_sustained_attention_test',
	displayName: 'Mostrar Test de Atencion Sostenida',
	description:
		'Genera y muestra un test inmersivo de atencion sostenida. La primera variante disponible es Go/No-Go.',
	category: 'ui',
	parametersSchema: {
		type: 'object',
		properties: {
			title: { type: 'string', description: 'Titulo del test' },
			testType: {
				type: 'string',
				enum: ['go_no_go'],
				description: 'Tipo de test de atencion sostenida'
			},
			difficulty: {
				type: 'string',
				enum: ['easy', 'medium', 'hard'],
				description: 'Nivel de dificultad del test'
			},
			instructions: {
				type: 'string',
				description: 'Instrucciones que se mostraran antes de empezar'
			},
			practiceTrials: {
				type: 'number',
				description: 'Numero de ensayos de practica'
			},
			mainTrials: {
				type: 'number',
				description: 'Numero de ensayos principales'
			},
			goStimulus: {
				type: 'string',
				description: 'Estimulo objetivo al que hay que responder'
			},
			noGoStimulus: {
				type: 'string',
				description: 'Estimulo al que no se debe responder'
			}
		}
	},
	executorType: 'builtin',
	executorConfig: { handler: 'ui_renderer', componentKey: 'SustainedAttentionTest', interactive: true },
	requiresConfirmation: false,
	riskLevel: 'low',
	isSystem: true,
	version: '1.0.0',
	usageDomain: BUILTIN_TOOL_USAGE_DOMAIN_AGENT_CHAT
};
