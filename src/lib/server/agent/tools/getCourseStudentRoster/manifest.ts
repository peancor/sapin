import { BUILTIN_TOOL_USAGE_DOMAIN_INSIGHTS } from '../constants';
import type { ToolManifest } from '../types';

export const getCourseStudentRosterManifest: ToolManifest = {
	name: 'get_course_student_roster',
	displayName: 'Obtener lista de estudiantes del curso',
	description:
		'Devuelve la lista de estudiantes matriculados en un curso, con filtros opcionales por estudiante.',
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
				description: 'IDs concretos de estudiantes para filtrar la lista.',
				items: { type: 'string' }
			}
		},
		required: []
	},
	responseSchema: {
		type: 'object',
		properties: {
			courseId: { type: 'string' },
			totalStudents: { type: 'integer' },
			students: { type: 'array' }
		},
		required: ['courseId', 'totalStudents', 'students']
	},
	executorType: 'builtin',
	executorConfig: { handler: 'getCourseStudentRoster' },
	requiresConfirmation: false,
	riskLevel: 'low',
	isSystem: true,
	version: '1.0.0',
	usageDomain: BUILTIN_TOOL_USAGE_DOMAIN_INSIGHTS
};
