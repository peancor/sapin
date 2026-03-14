import { BUILTIN_TOOL_USAGE_DOMAIN_AGENT_CHAT } from '../constants';
import type { ToolManifest } from '../types';

export const studentActivityMemoryManifest: ToolManifest = {
	name: 'student_activity_memory',
	displayName: 'Memoria del estudiante de la actividad',
	description:
		'Herramienta unificada para leer o guardar recuerdos privados del estudiante actual solo dentro de esta actividad concreta. Usa action="read" o action="write". Para guardar basta con summary; tambien puedes enviar memoryType opcional, details, evidence, confidence, tags o payload parcial, y el backend lo normaliza o lo guarda como observacion general si no encaja en un tipo canonico. Esta memoria no se comparte con otras actividades.',
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
					type: 'string'
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
				description: 'Tipo sugerido de memoria cuando action="write". Es opcional y el backend puede inferirlo o hacer fallback.'
			},
			summary: {
				type: 'string',
				description: 'Resumen breve del recuerdo. Es el unico campo realmente necesario para action="write".'
			},
			details: {
				type: 'string',
				description: 'Detalles opcionales del recuerdo cuando action="write".'
			},
			evidence: {
				description: 'Evidencia opcional. Puede ser string, objeto o array; el backend la normaliza.',
				type: ['string', 'object', 'array']
			},
			confidence: {
				type: 'number',
				description: 'Confianza opcional entre 0 y 1. Si falta, el backend no rechaza por ello.',
				minimum: 0,
				maximum: 1
			},
			payload: {
				type: 'object',
				description: 'Carga estructurada opcional. Puede ir incompleta; el backend la fusiona con summary/details.'
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
	executorConfig: { handler: 'studentActivityMemory' },
	requiresConfirmation: false,
	riskLevel: 'low',
	isSystem: true,
	version: '1.0.0',
	usageDomain: BUILTIN_TOOL_USAGE_DOMAIN_AGENT_CHAT
};
