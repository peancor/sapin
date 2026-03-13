import { BUILTIN_TOOL_USAGE_DOMAIN_AGENT_CHAT } from '../constants';
import type { ToolManifest } from '../types';

export const storeStudentCourseMemoryManifest: ToolManifest = {
	name: 'store_student_course_memory',
	displayName: 'Guardar recuerdo del estudiante del curso',
	description:
		'Guarda un recuerdo privado del estudiante actual en el curso actual, reutilizable entre actividades del mismo curso. memoryType debe ser "student_preference" o "activity_episode". Si usas "student_preference", el payload debe incluir preferenceKind, value, confidence y evidence. Si usas "activity_episode", el payload debe incluir episodeKind, summary, confidence y evidence. El backend normaliza variantes razonables de preferenceKind y episodeKind al conjunto canónico. evidence debe ser preferiblemente un array, aunque el backend puede normalizar un valor único.',
	category: 'data',
	parametersSchema: {
		type: 'object',
		properties: {
			memoryType: {
				type: 'string',
				description: 'Tipo de memoria a persistir.',
				enum: ['student_preference', 'activity_episode']
			},
			summary: {
				type: 'string',
				description: 'Resumen breve y accionable del recuerdo.'
			},
			payload: {
				type: 'object',
				description: 'Carga estructurada según el tipo de memoria.'
			},
			importance: {
				type: 'integer',
				description: 'Importancia de 1 a 5.',
				minimum: 1,
				maximum: 5
			},
			occurredAt: {
				type: 'string',
				description: 'Fecha ISO opcional del momento observado.'
			},
			dedupeKey: {
				type: 'string',
				description: 'Clave opcional para actualizar recuerdos equivalentes sin duplicarlos.'
			},
			tags: {
				type: 'array',
				description: 'Etiquetas opcionales para recuperación estructurada.',
				items: { type: 'string' }
			}
		},
		required: ['memoryType', 'summary', 'payload']
	},
	responseSchema: {
		type: 'object',
		properties: {
			stored: { type: 'boolean' },
			status: { type: 'string' },
			reason: { type: 'string' },
			item: { type: 'object' }
		},
		required: ['stored', 'status']
	},
	executorType: 'builtin',
	executorConfig: { handler: 'storeStudentCourseMemory' },
	requiresConfirmation: false,
	riskLevel: 'low',
	isSystem: true,
	version: '1.0.0',
	usageDomain: BUILTIN_TOOL_USAGE_DOMAIN_AGENT_CHAT
};
