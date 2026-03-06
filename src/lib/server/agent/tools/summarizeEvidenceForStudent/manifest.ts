import { BUILTIN_TOOL_USAGE_DOMAIN_INSIGHTS } from '../constants';
import type { ToolManifest } from '../types';

export const summarizeEvidenceForStudentManifest: ToolManifest = {
	name: 'summarize_evidence_for_student',
	displayName: 'Resumir evidencia de un estudiante',
	description:
		'Genera un dossier estructurado con la evidencia educativa de un estudiante en la actividad actual.',
	category: 'data',
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
			dateFrom: { type: 'string', description: 'Fecha inicial ISO opcional.' },
			dateTo: { type: 'string', description: 'Fecha final ISO opcional.' },
			search: { type: 'string', description: 'Texto opcional para filtrar transcripts.' },
			includeTranscriptExcerpts: {
				type: 'boolean',
				description: 'Si es true, incluye extractos recientes de transcript.'
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
			riskLevel: { type: 'string' },
			summary: { type: 'object' },
			observations: { type: 'array' },
			strengths: { type: 'array' },
			supportNeeds: { type: 'array' },
			courseProgress: { type: 'object' },
			toolSignals: { type: 'object' },
			stuckSessions: { type: 'array' },
			transcriptExcerpts: { type: 'array' }
		},
		required: [
			'activityId',
			'activityName',
			'student',
			'riskLevel',
			'summary',
			'observations',
			'strengths',
			'supportNeeds',
			'courseProgress',
			'toolSignals',
			'stuckSessions',
			'transcriptExcerpts'
		]
	},
	executorType: 'builtin',
	executorConfig: { handler: 'summarizeEvidenceForStudent' },
	requiresConfirmation: false,
	riskLevel: 'low',
	isSystem: true,
	version: '1.0.0',
	usageDomain: BUILTIN_TOOL_USAGE_DOMAIN_INSIGHTS
};
