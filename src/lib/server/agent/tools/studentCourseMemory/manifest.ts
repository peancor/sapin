import { BUILTIN_TOOL_USAGE_DOMAIN_AGENT_CHAT } from '../constants';
import type { ToolManifest } from '../types';

export const studentCourseMemoryManifest: ToolManifest = {
	name: 'student_course_memory',
	displayName: 'Memoria del estudiante del curso',
	description:
		'Herramienta unificada para leer o guardar recuerdos privados del estudiante actual dentro del curso actual. action debe ser "read" o "write". Los recuerdos del curso se comparten entre actividades del mismo curso y no pueden acceder a otros alumnos ni a otros cursos.',
	category: 'data',
	parametersSchema: {
		type: 'object',
		properties: {
			action: {
				type: 'string',
				enum: ['read', 'write'],
				description: 'Operacion a realizar sobre la memoria del estudiante.'
			},
			goal: {
				type: 'string',
				description: 'Objetivo de la consulta actual para priorizar el contexto recuperado.'
			},
			memoryTypes: {
				type: 'array',
				description: 'Tipos de memoria a recuperar cuando action="read".',
				items: {
					type: 'string',
					enum: ['student_preference', 'activity_episode']
				}
			},
			tagsAny: {
				type: 'array',
				description: 'Etiquetas opcionales para filtrar recuerdos cuando action="read".',
				items: { type: 'string' }
			},
			sinceDays: {
				type: 'integer',
				description: 'Solo recuerdos recientes, en dias hacia atras, cuando action="read".'
			},
			limit: {
				type: 'integer',
				description: 'Numero maximo de recuerdos a devolver cuando action="read".',
				default: 5,
				minimum: 1,
				maximum: 10
			},
			minImportance: {
				type: 'integer',
				description: 'Importancia minima requerida cuando action="read".',
				minimum: 1,
				maximum: 5
			},
			memoryType: {
				type: 'string',
				description: 'Tipo de memoria a persistir cuando action="write".',
				enum: ['student_preference', 'activity_episode']
			},
			summary: {
				type: 'string',
				description: 'Resumen breve y accionable del recuerdo cuando action="write".'
			},
			payload: {
				type: 'object',
				description: 'Carga estructurada segun el tipo de memoria cuando action="write".'
			},
			importance: {
				type: 'integer',
				description: 'Importancia de 1 a 5 cuando action="write".',
				minimum: 1,
				maximum: 5
			},
			occurredAt: {
				type: 'string',
				description: 'Fecha ISO opcional del momento observado cuando action="write".'
			},
			dedupeKey: {
				type: 'string',
				description: 'Clave opcional para actualizar recuerdos equivalentes sin duplicarlos.'
			},
			tags: {
				type: 'array',
				description: 'Etiquetas opcionales para recuperacion estructurada cuando action="write".',
				items: { type: 'string' }
			}
		},
		required: ['action']
	},
	responseSchema: {
		type: 'object',
		properties: {
			action: { type: 'string' },
			items: { type: 'array' },
			resultCount: { type: 'integer' },
			stored: { type: 'boolean' },
			status: { type: 'string' },
			reason: { type: 'string' },
			item: { type: 'object' },
			ignoredScopeFields: { type: 'array' },
			ignoredActionFields: { type: 'array' }
		},
		required: ['action', 'ignoredScopeFields', 'ignoredActionFields']
	},
	executorType: 'builtin',
	executorConfig: { handler: 'studentCourseMemory' },
	requiresConfirmation: false,
	riskLevel: 'low',
	isSystem: true,
	version: '1.0.0',
	usageDomain: BUILTIN_TOOL_USAGE_DOMAIN_AGENT_CHAT
};
