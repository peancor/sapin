import { BUILTIN_TOOL_USAGE_DOMAIN_INSIGHTS } from '../constants';
import type { ToolManifest } from '../types';

export const draftStudentNotificationManifest: ToolManifest = {
	name: 'draft_student_notification',
	displayName: 'Preparar borrador de notificacion',
	description:
		'Genera un borrador breve de notificacion in-app para un estudiante, sin enviarlo automaticamente.',
	category: 'communication',
	parametersSchema: {
		type: 'object',
		properties: {
			activityId: {
				type: 'string',
				description: 'Actividad de referencia. Si se omite, usa la del contexto.'
			},
			studentId: { type: 'string', description: 'Estudiante destinatario.' },
			priority: {
				type: 'string',
				enum: ['low', 'normal', 'high'],
				description: 'Prioridad sugerida del borrador.'
			},
			purpose: {
				type: 'string',
				enum: ['reminder', 'encouragement', 'follow_up'],
				description: 'Intencion principal de la notificacion.'
			},
			customFocus: {
				type: 'string',
				description: 'Enfoque concreto del aviso si se quiere forzar.'
			}
		},
		required: ['studentId']
	},
	responseSchema: {
		type: 'object',
		properties: {
			activityId: { type: 'string' },
			activityName: { type: 'string' },
			student: { type: 'object' },
			priority: { type: 'string' },
			purpose: { type: 'string' },
			focus: { type: 'string' },
			draft: { type: 'object' },
			rationale: { type: 'object' },
			safetyNotes: { type: 'array' }
		},
		required: [
			'activityId',
			'activityName',
			'student',
			'priority',
			'purpose',
			'focus',
			'draft',
			'rationale',
			'safetyNotes'
		]
	},
	executorType: 'builtin',
	executorConfig: { handler: 'draftStudentNotification' },
	requiresConfirmation: false,
	riskLevel: 'low',
	isSystem: true,
	version: '1.0.0',
	usageDomain: BUILTIN_TOOL_USAGE_DOMAIN_INSIGHTS
};
