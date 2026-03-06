import { BUILTIN_TOOL_USAGE_DOMAIN_INSIGHTS } from '../constants';
import type { ToolManifest } from '../types';

export const draftOutreachMessageManifest: ToolManifest = {
	name: 'draft_outreach_message',
	displayName: 'Preparar borrador de outreach',
	description:
		'Prepara un mensaje de seguimiento para un estudiante, basado en evidencia y sin enviarlo automaticamente.',
	category: 'communication',
	parametersSchema: {
		type: 'object',
		properties: {
			activityId: {
				type: 'string',
				description: 'Actividad de referencia. Si se omite, usa la del contexto.'
			},
			studentId: { type: 'string', description: 'Estudiante destinatario.' },
			channel: {
				type: 'string',
				enum: ['email', 'in_app'],
				description: 'Canal previsto para el borrador.'
			},
			tone: {
				type: 'string',
				enum: ['supportive', 'direct', 'celebratory'],
				description: 'Tono del mensaje.'
			},
			objective: { type: 'string', description: 'Objetivo pedagogico principal del contacto.' }
		},
		required: ['studentId']
	},
	responseSchema: {
		type: 'object',
		properties: {
			activityId: { type: 'string' },
			activityName: { type: 'string' },
			student: { type: 'object' },
			channel: { type: 'string' },
			tone: { type: 'string' },
			objective: { type: 'string' },
			rationale: { type: 'object' },
			draft: { type: 'object' },
			safetyNotes: { type: 'array' }
		},
		required: [
			'activityId',
			'activityName',
			'student',
			'channel',
			'tone',
			'objective',
			'rationale',
			'draft',
			'safetyNotes'
		]
	},
	executorType: 'builtin',
	executorConfig: { handler: 'draftOutreachMessage' },
	requiresConfirmation: false,
	riskLevel: 'low',
	isSystem: true,
	version: '1.0.0',
	usageDomain: BUILTIN_TOOL_USAGE_DOMAIN_INSIGHTS
};
