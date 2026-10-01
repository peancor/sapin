import { BUILTIN_TOOL_USAGE_DOMAIN_INSIGHTS } from '../constants.ts';
import type { ToolManifest } from '../types.ts';

export const getRubricCoverageGapsManifest: ToolManifest = {
	name: 'get_rubric_coverage_gaps',
	displayName: 'Obtener gaps de cobertura de rubrica',
	description:
		'Analiza que criterios de una rubrica quedan poco evidenciados en las respuestas del alumnado.',
	category: 'evaluation',
	parametersSchema: {
		type: 'object',
		properties: {
			activityId: {
				type: 'string',
				description: 'Identificador de la actividad. Si se omite, usa la actividad del contexto.'
			},
			studentIds: {
				type: 'array',
				items: { type: 'string' },
				description: 'Lista opcional de estudiantes concretos.'
			},
			rubric: {
				type: 'array',
				description: 'Rubrica a analizar.',
				items: {
					type: 'object',
					properties: {
						id: { type: 'string' },
						title: { type: 'string' },
						description: { type: 'string' },
						maxScore: { type: 'integer' },
						keywords: {
							type: 'array',
							items: { type: 'string' }
						}
					},
					required: ['title']
				}
			},
			includeEvidenceExcerpts: {
				type: 'boolean',
				description: 'Si es true, incluye evidencia textual de ejemplo.'
			}
		},
		required: ['rubric']
	},
	responseSchema: {
		type: 'object',
		properties: {
			activityId: { type: 'string' },
			activityName: { type: 'string' },
			summary: { type: 'object' },
			items: { type: 'array' },
			alerts: { type: 'array' },
			recommendedActions: { type: 'array' },
			limitations: { type: 'array' }
		},
		required: ['activityId', 'activityName', 'summary', 'items', 'alerts', 'recommendedActions', 'limitations']
	},
	executorType: 'builtin',
	executorConfig: { handler: 'getRubricCoverageGaps' },
	requiresConfirmation: false,
	riskLevel: 'medium',
	isSystem: true,
	version: '1.0.0',
	usageDomain: BUILTIN_TOOL_USAGE_DOMAIN_INSIGHTS
};
