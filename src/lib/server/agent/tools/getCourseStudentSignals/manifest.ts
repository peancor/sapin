import { BUILTIN_TOOL_USAGE_DOMAIN_STAFF_AGENT } from '../constants';
import type { ToolManifest } from '../types';

export const getCourseStudentSignalsManifest: ToolManifest = {
	name: 'get_course_student_signals',
	displayName: 'Obtener senales del alumnado del curso',
	description:
		'Devuelve un ranking explicable por rendimiento, participacion, riesgo y friccion del alumnado del curso.',
	category: 'data',
	parametersSchema: {
		type: 'object',
		properties: {
			courseId: {
				type: 'string',
				description: 'Identificador del curso. Si se omite, usa el curso del contexto.'
			},
			studentIds: {
				type: 'array',
				description: 'Lista opcional de estudiantes concretos.',
				items: { type: 'string' }
			},
			limit: {
				type: 'integer',
				description: 'Numero maximo de estudiantes a destacar en los rankings.',
				minimum: 1,
				maximum: 50
			}
		},
		required: []
	},
	responseSchema: {
		type: 'object',
		properties: {
			totalStudents: { type: 'integer' },
			students: { type: 'array' },
			topStudents: { type: 'array' },
			attentionStudents: { type: 'array' }
		},
		required: ['totalStudents', 'students', 'topStudents', 'attentionStudents']
	},
	executorType: 'builtin',
	executorConfig: { handler: 'getCourseStudentSignals' },
	requiresConfirmation: false,
	riskLevel: 'low',
	isSystem: true,
	version: '1.0.0',
	usageDomain: BUILTIN_TOOL_USAGE_DOMAIN_STAFF_AGENT
};
