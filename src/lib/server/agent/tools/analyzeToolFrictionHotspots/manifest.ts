import { BUILTIN_TOOL_USAGE_DOMAIN_INSIGHTS } from '../constants.ts';
import type { ToolManifest } from '../types.ts';

export const analyzeToolFrictionHotspotsManifest: ToolManifest = {
	name: 'analyze_tool_friction_hotspots',
	displayName: 'Analizar hotspots de friccion',
	description:
		'Detecta herramientas y componentes UI que concentran friccion, fallos o sesiones atascadas.',
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
			dateFrom: { type: 'string', description: 'Fecha inicial ISO opcional.' },
			dateTo: { type: 'string', description: 'Fecha final ISO opcional.' },
			toolNames: {
				type: 'array',
				items: { type: 'string' },
				description: 'Filtra por nombres de herramienta o claves de componente.'
			},
			maxResults: {
				type: 'integer',
				description: 'Numero maximo de hotspots a devolver.',
				minimum: 1,
				maximum: 25
			},
			includeEvidenceExcerpts: {
				type: 'boolean',
				description: 'Si es true, incluye extractos de evidencia.'
			}
		},
		required: []
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
	executorConfig: { handler: 'analyzeToolFrictionHotspots' },
	requiresConfirmation: false,
	riskLevel: 'low',
	isSystem: true,
	version: '1.0.0',
	usageDomain: BUILTIN_TOOL_USAGE_DOMAIN_INSIGHTS
};
