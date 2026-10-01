import {
	BUILTIN_TOOL_USAGE_DOMAIN_AGENT_CHAT
} from '../constants';
import type { ToolManifest } from '../types';

export const renderSharedImageManifest: ToolManifest = {
	name: 'render_shared_image',
	displayName: 'Mostrar Imagen Compartida',
	description:
		'Muestra en el chat una imagen subida como recurso compartido de la actividad actual.',
	category: 'ui',
	parametersSchema: {
		type: 'object',
		properties: {
			resourceName: {
				type: 'string',
				description:
					'Nombre del recurso de imagen compartido en la actividad (ej: "diagrama-celula.png")'
			},
			title: {
				type: 'string',
				description: 'Título opcional para mostrar sobre la imagen'
			},
			caption: {
				type: 'string',
				description: 'Pie opcional para la imagen'
			}
		},
		required: ['resourceName']
	},
	executorType: 'builtin',
	executorConfig: { handler: 'ui_renderer', componentKey: 'SharedImageCard', interactive: false },
	requiresConfirmation: false,
	riskLevel: 'low',
	isSystem: true,
	version: '2.0.0',
	usageDomain: BUILTIN_TOOL_USAGE_DOMAIN_AGENT_CHAT
};

