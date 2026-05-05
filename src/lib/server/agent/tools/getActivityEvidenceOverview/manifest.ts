import { BUILTIN_TOOL_USAGE_DOMAIN_INSIGHTS } from '../constants';
import type { ToolManifest } from '../types';

export const getActivityEvidenceOverviewManifest: ToolManifest = {
	name: 'get_activity_evidence_overview',
	displayName: 'Obtener resumen de evidencia de actividad',
	description:
		'Devuelve contexto, participación y resúmenes por estudiante para una actividad educativa.',
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
				description: 'Lista opcional de estudiantes concretos a incluir.',
				items: { type: 'string' }
			}
		},
		required: []
	},
	responseSchema: {
		type: 'object',
		properties: {
			activity: { type: 'object' },
			totalEnrolledStudents: { type: 'integer' },
			studentsWithEvidenceCount: { type: 'integer' },
			totalSessions: { type: 'integer' },
			totalMessages: { type: 'integer' },
			lastActivityAt: { type: 'string' },
			studentSummaries: { type: 'array' }
		},
		required: [
			'activity',
			'totalEnrolledStudents',
			'studentsWithEvidenceCount',
			'totalSessions',
			'totalMessages',
			'studentSummaries'
		]
	},
	executorType: 'builtin',
	executorConfig: { handler: 'getActivityEvidenceOverview' },
	requiresConfirmation: false,
	riskLevel: 'low',
	isSystem: true,
	version: '1.0.0',
	usageDomain: BUILTIN_TOOL_USAGE_DOMAIN_INSIGHTS
};
