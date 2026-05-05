import { BUILTIN_TOOL_USAGE_DOMAIN_INSIGHTS } from '../constants';
import type { ToolManifest } from '../types';

export const findStuckSessionsManifest: ToolManifest = {
	name: 'find_stuck_sessions',
	displayName: 'Detectar sesiones atascadas',
	description:
		'Encuentra sesiones con senales de atasco, reintentos, fallos de herramienta o resolucion incompleta.',
	category: 'evaluation',
	parametersSchema: {
		type: 'object',
		properties: {
			activityId: {
				type: 'string',
				description: 'Identificador de la actividad. Si se omite, usa la actividad del contexto.'
			},
			studentIds: {
				type: 'array',
				description: 'Lista opcional de estudiantes concretos a incluir.',
				items: { type: 'string' }
			},
			chatIds: {
				type: 'array',
				description: 'Lista opcional de sesiones concretas a incluir.',
				items: { type: 'string' }
			},
			dateFrom: { type: 'string', description: 'Fecha inicial ISO opcional.' },
			dateTo: { type: 'string', description: 'Fecha final ISO opcional.' },
			search: { type: 'string', description: 'Texto opcional para filtrar transcripts.' },
			maxResults: { type: 'integer', description: 'Numero maximo de sesiones a devolver.' },
			minScore: { type: 'integer', description: 'Puntuacion minima para marcar una sesion.' },
			minLearnerMessages: {
				type: 'integer',
				description: 'Minimo de mensajes del estudiante antes de considerar atasco.'
			}
		},
		required: []
	},
	responseSchema: {
		type: 'object',
		properties: {
			activityId: { type: 'string' },
			activityName: { type: 'string' },
			totalFlaggedSessions: { type: 'integer' },
			sessions: { type: 'array' }
		},
		required: ['activityId', 'activityName', 'totalFlaggedSessions', 'sessions']
	},
	executorType: 'builtin',
	executorConfig: { handler: 'findStuckSessions' },
	requiresConfirmation: false,
	riskLevel: 'low',
	isSystem: true,
	version: '1.0.0',
	usageDomain: BUILTIN_TOOL_USAGE_DOMAIN_INSIGHTS
};
