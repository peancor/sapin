import { BUILTIN_TOOL_USAGE_DOMAIN_INSIGHTS } from '../constants';
import type { ToolManifest } from '../types';

export const draftTeacherFeedbackManifest: ToolManifest = {
	name: 'draft_teacher_feedback',
	displayName: 'Redactar feedback docente',
	description:
		'Prepara un borrador de feedback individual para un estudiante, fundamentado en evidencia de la actividad.',
	category: 'evaluation',
	parametersSchema: {
		type: 'object',
		properties: {
			activityId: {
				type: 'string',
				description: 'Identificador de la actividad. Si se omite, usa la actividad del contexto.'
			},
			studentId: {
				type: 'string',
				description: 'Identificador del estudiante a analizar.'
			},
			tone: {
				type: 'string',
				enum: ['supportive', 'direct', 'celebratory'],
				description: 'Tono del borrador.'
			},
			dateFrom: { type: 'string', description: 'Fecha inicial ISO opcional.' },
			dateTo: { type: 'string', description: 'Fecha final ISO opcional.' },
			search: { type: 'string', description: 'Texto opcional para filtrar transcripts.' }
		},
		required: ['studentId']
	},
	responseSchema: {
		type: 'object',
		properties: {
			activityId: { type: 'string' },
			activityName: { type: 'string' },
			student: { type: 'object' },
			tone: { type: 'string' },
			evidence: { type: 'object' },
			strengths: { type: 'array' },
			supportNeeds: { type: 'array' },
			nextSteps: { type: 'array' },
			draft: { type: 'object' }
		},
		required: [
			'activityId',
			'activityName',
			'student',
			'tone',
			'evidence',
			'strengths',
			'supportNeeds',
			'nextSteps',
			'draft'
		]
	},
	executorType: 'builtin',
	executorConfig: { handler: 'draftTeacherFeedback' },
	requiresConfirmation: false,
	riskLevel: 'low',
	isSystem: true,
	version: '1.0.0',
	usageDomain: BUILTIN_TOOL_USAGE_DOMAIN_INSIGHTS
};
