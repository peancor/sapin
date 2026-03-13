import { BUILTIN_TOOL_USAGE_DOMAIN_AGENT_CHAT } from '../constants';
import type { ToolManifest } from '../types';

export const getStudentActivityMemoryContextManifest: ToolManifest = {
	name: 'get_student_activity_memory_context',
	displayName: 'Recuperar recuerdos del estudiante',
	description:
		'Recupera recuerdos privados del estudiante actual dentro de la actividad actual. No puede consultar otros alumnos ni otros cursos.',
	category: 'data',
	parametersSchema: {
		type: 'object',
		properties: {
			goal: {
				type: 'string',
				description: 'Objetivo de la consulta actual para priorizar el contexto recuperado.'
			},
			memoryTypes: {
				type: 'array',
				description: 'Tipos de memoria a recuperar.',
				items: {
					type: 'string',
					enum: ['student_preference', 'activity_episode']
				}
			},
			tagsAny: {
				type: 'array',
				description: 'Etiquetas opcionales para filtrar recuerdos.',
				items: { type: 'string' }
			},
			sinceDays: {
				type: 'integer',
				description: 'Solo recuerdos recientes, en días hacia atrás.'
			},
			limit: {
				type: 'integer',
				description: 'Número máximo de recuerdos a devolver.',
				default: 5,
				minimum: 1,
				maximum: 10
			},
			minImportance: {
				type: 'integer',
				description: 'Importancia mínima requerida.',
				minimum: 1,
				maximum: 5
			}
		},
		required: []
	},
	responseSchema: {
		type: 'object',
		properties: {
			items: { type: 'array' },
			ignoredScopeFields: { type: 'array' },
			resultCount: { type: 'integer' }
		},
		required: ['items', 'ignoredScopeFields', 'resultCount']
	},
	executorType: 'builtin',
	executorConfig: { handler: 'getStudentActivityMemoryContext' },
	requiresConfirmation: false,
	riskLevel: 'low',
	isSystem: true,
	version: '1.0.0',
	usageDomain: BUILTIN_TOOL_USAGE_DOMAIN_AGENT_CHAT
};
