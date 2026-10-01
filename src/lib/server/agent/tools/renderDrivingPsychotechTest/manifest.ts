import { BUILTIN_TOOL_USAGE_DOMAIN_AGENT_CHAT } from '../constants';
import type { ToolManifest } from '../types';

export const renderDrivingPsychotechTestManifest: ToolManifest = {
	name: 'render_driving_psychotech_test',
	displayName: 'Mostrar Psicotecnico de Conduccion',
	description:
		'Genera y muestra una prueba inmersiva de psicotecnico de conduccion. La primera entrega incluye coordinacion bimanual, anticipacion temporal y reaccion/frenado.',
	category: 'ui',
	parametersSchema: {
		type: 'object',
		properties: {
			title: { type: 'string', description: 'Titulo del test' },
			testType: {
				type: 'string',
				enum: ['bimanual_coordination', 'time_to_contact', 'multiple_reaction_braking'],
				description: 'Tipo de psicotecnico de conduccion'
			},
			difficulty: {
				type: 'string',
				enum: ['easy', 'medium', 'hard'],
				description: 'Nivel de dificultad'
			},
			instructions: { type: 'string', description: 'Instrucciones visibles antes de empezar' },
			practiceDurationSec: {
				type: 'number',
				description: 'Duracion de practica para coordinacion bimanual'
			},
			durationSec: {
				type: 'number',
				description: 'Duracion principal para coordinacion bimanual'
			},
			practiceTrials: { type: 'number', description: 'Numero de ensayos de practica' },
			mainTrials: { type: 'number', description: 'Numero de ensayos principales' },
			responseMode: {
				type: 'string',
				enum: ['brake_only', 'selective'],
				description: 'Modo de respuesta para reaccion y frenado'
			}
		}
	},
	executorType: 'builtin',
	executorConfig: { handler: 'ui_renderer', componentKey: 'DrivingPsychotechTest', interactive: true },
	requiresConfirmation: false,
	riskLevel: 'low',
	isSystem: true,
	version: '1.0.0',
	usageDomain: BUILTIN_TOOL_USAGE_DOMAIN_AGENT_CHAT
};
