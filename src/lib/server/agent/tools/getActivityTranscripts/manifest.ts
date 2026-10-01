import { BUILTIN_TOOL_USAGE_DOMAIN_INSIGHTS } from '../constants';
import type { ToolManifest } from '../types';

export const getActivityTranscriptsManifest: ToolManifest = {
	name: 'get_activity_transcripts',
	displayName: 'Obtener transcripts de actividad',
	description:
		'Devuelve las sesiones y mensajes normalizados de una actividad, con filtros por estudiante, sesión, fecha, texto y roles.',
	category: 'data',
	parametersSchema: {
		type: 'object',
		properties: {
			activityId: {
				type: 'string',
				description: 'Identificador de la actividad. Si se omite, usa la actividad del contexto.'
			},
			studentIds: {
				type: 'array',
				description: 'IDs concretos de estudiantes a consultar.',
				items: { type: 'string' }
			},
			chatIds: {
				type: 'array',
				description: 'IDs concretos de sesiones o chats.',
				items: { type: 'string' }
			},
			search: {
				type: 'string',
				description: 'Texto libre para filtrar por contenido o identidad del estudiante.'
			},
			dateFrom: {
				type: 'string',
				description: 'Fecha mínima ISO para filtrar sesiones.'
			},
			dateTo: {
				type: 'string',
				description: 'Fecha máxima ISO para filtrar sesiones.'
			},
			includeRoles: {
				type: 'array',
				description: 'Roles de mensaje a incluir en el transcript.',
				items: {
					type: 'string',
					enum: ['user', 'assistant', 'system', 'tool']
				}
			}
		},
		required: []
	},
	responseSchema: {
		type: 'object',
		properties: {
			activityId: { type: 'string' },
			totalSessions: { type: 'integer' },
			sessions: { type: 'array' }
		},
		required: ['activityId', 'totalSessions', 'sessions']
	},
	executorType: 'builtin',
	executorConfig: { handler: 'getActivityTranscripts' },
	requiresConfirmation: false,
	riskLevel: 'low',
	isSystem: true,
	version: '1.0.0',
	usageDomain: BUILTIN_TOOL_USAGE_DOMAIN_INSIGHTS
};
