import { BUILTIN_TOOL_USAGE_DOMAIN_AGENT_CHAT } from '../constants';
import type { ToolManifest } from '../types';

export const renderSvgDiagramManifest: ToolManifest = {
	name: 'render_svg_diagram',
	displayName: 'Mostrar Diagrama SVG',
	description:
		'Renderiza un diagrama SVG inline dentro del chat. Envía un único bloque <svg>...</svg> autocontenido, con etiquetas legibles y preferiblemente con viewBox. No uses <script>, foreignObject, manejadores on*, ni href/xlink:href.',
	category: 'ui',
	parametersSchema: {
		type: 'object',
		properties: {
			svg: {
				type: 'string',
				minLength: 1,
				maxLength: 50000,
				description:
					'Bloque SVG completo. Debe empezar por <svg> y terminar por </svg>, sin scripts ni referencias externas.'
			},
			title: {
				type: 'string',
				description: 'Título opcional visible sobre el diagrama.'
			},
			caption: {
				type: 'string',
				description: 'Texto breve opcional para contextualizar o explicar el diagrama.'
			},
			ariaLabel: {
				type: 'string',
				description: 'Etiqueta accesible opcional para lectores de pantalla.'
			}
		},
		required: ['svg']
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
	executorConfig: { handler: 'ui_renderer', componentKey: 'SvgDiagramCard', interactive: false },
	requiresConfirmation: false,
	riskLevel: 'low',
	isSystem: true,
	version: '1.0.0',
	usageDomain: BUILTIN_TOOL_USAGE_DOMAIN_AGENT_CHAT
};
