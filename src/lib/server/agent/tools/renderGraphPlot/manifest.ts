import {
	BUILTIN_TOOL_USAGE_DOMAIN_AGENT_CHAT
} from '../constants';
import type { ToolManifest } from '../types';

export const renderGraphPlotManifest: ToolManifest = {
	name: 'render_graph_plot',
	displayName: 'Mostrar Gráfico Educativo',
	description:
		'Genera y muestra un gráfico educativo en el chat. Usa mode="formula" para y=f(x) o mode="data" para series de puntos [x,y].',
	category: 'ui',
	parametersSchema: {
		type: 'object',
		properties: {
			mode: { type: 'string', enum: ['formula', 'data'] },
			title: { type: 'string', description: 'Título opcional del gráfico' },
			formula: {
				type: 'object',
				properties: {
					expression: { type: 'string', description: 'Fórmula de la forma y=f(x)' },
					domainMin: { type: 'number' },
					domainMax: { type: 'number' },
					samples: { type: 'integer' },
					color: { type: 'string' },
					strokeWidth: { type: 'number' }
				},
				required: ['expression']
			},
			data: {
				type: 'object',
				properties: {
					points: {
						type: 'array',
						items: {
							type: 'object',
							properties: {
								x: { type: 'number' },
								y: { type: 'number' }
							},
							required: ['x', 'y']
						}
					},
					style: { type: 'string', enum: ['line', 'scatter'] },
					color: { type: 'string' }
				},
				required: ['points']
			},
			axes: {
				type: 'object',
				properties: {
					xLabel: { type: 'string' },
					yLabel: { type: 'string' },
					grid: { type: 'boolean' }
				}
			},
			viewport: {
				type: 'object',
				properties: {
					autoFit: { type: 'boolean' },
					xMin: { type: 'number' },
					xMax: { type: 'number' },
					yMin: { type: 'number' },
					yMax: { type: 'number' }
				}
			}
		},
		required: ['mode']
	},
	responseSchema: {
		type: 'object',
		properties: {
			rendered: { type: 'boolean' },
			componentKey: { type: 'string' }
		},
		required: ['rendered', 'componentKey']
	},
	executorType: 'builtin',
	executorConfig: { handler: 'ui_renderer', componentKey: 'GraphPlotCard', interactive: false },
	requiresConfirmation: false,
	riskLevel: 'low',
	isSystem: true,
	version: '1.1.0',
	usageDomain: BUILTIN_TOOL_USAGE_DOMAIN_AGENT_CHAT
};

