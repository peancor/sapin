import { BUILTIN_TOOL_USAGE_DOMAIN_INSIGHTS } from '../constants';
import type { ToolManifest } from '../types';

export const getActivityToolUsageSummaryManifest: ToolManifest = {
	name: 'get_activity_tool_usage_summary',
	displayName: 'Resumir uso de herramientas de actividad',
	description:
		'Resume llamadas a herramientas, componentes UI y respuestas de estudiantes dentro de una actividad.',
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
			},
			chatIds: {
				type: 'array',
				description: 'Lista opcional de sesiones concretas a incluir.',
				items: { type: 'string' }
			},
			dateFrom: { type: 'string', description: 'Fecha inicial ISO opcional.' },
			dateTo: { type: 'string', description: 'Fecha final ISO opcional.' },
			search: { type: 'string', description: 'Texto opcional para filtrar transcripts.' },
			limit: { type: 'integer', description: 'Numero maximo de filas por ranking.' }
		},
		required: []
	},
	responseSchema: {
		type: 'object',
		properties: {
			activityId: { type: 'string' },
			activityName: { type: 'string' },
			totalToolCalls: { type: 'integer' },
			totalToolFailures: { type: 'integer' },
			totalUIComponentsRendered: { type: 'integer' },
			totalUIResponses: { type: 'integer' },
			tools: { type: 'array' },
			components: { type: 'array' },
			students: { type: 'array' }
		},
		required: [
			'activityId',
			'activityName',
			'totalToolCalls',
			'totalToolFailures',
			'totalUIComponentsRendered',
			'totalUIResponses',
			'tools',
			'components',
			'students'
		]
	},
	executorType: 'builtin',
	executorConfig: { handler: 'getActivityToolUsageSummary' },
	requiresConfirmation: false,
	riskLevel: 'low',
	isSystem: true,
	version: '1.0.0',
	usageDomain: BUILTIN_TOOL_USAGE_DOMAIN_INSIGHTS
};
