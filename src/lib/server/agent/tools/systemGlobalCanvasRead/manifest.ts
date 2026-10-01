import { BUILTIN_TOOL_USAGE_DOMAIN_INTERNAL } from '../constants';
import type { ToolManifest } from '../types';

export const systemGlobalCanvasReadManifest: ToolManifest = {
	name: 'system_global_canvas_read',
	displayName: 'Leer canvas global del sistema',
	description:
		'Lee el canvas global del sistema. Devuelve el documento completo actual, sin filtros ni búsqueda semántica.',
	category: 'data',
	parametersSchema: {
		type: 'object',
		properties: {
			reason: {
				type: 'string',
				description: 'Motivo opcional por el que necesitas inspeccionar el canvas.'
			}
		}
	},
	responseSchema: {
		type: 'object',
		properties: {
			scopeType: { type: 'string' },
			scopeKey: { type: 'string' },
			visibility: { type: 'string' },
			scopeBindings: { type: 'object' },
			exists: { type: 'boolean' },
			content: { type: ['string', 'null'] },
			revision: { type: ['integer', 'null'] },
			updatedAt: { type: ['string', 'null'] }
		},
		required: [
			'scopeType',
			'scopeKey',
			'visibility',
			'scopeBindings',
			'exists',
			'content',
			'revision',
			'updatedAt'
		]
	},
	executorType: 'builtin',
	executorConfig: { handler: 'systemGlobalCanvasRead' },
	requiresConfirmation: false,
	riskLevel: 'low',
	isSystem: true,
	version: '2.0.0',
	usageDomain: BUILTIN_TOOL_USAGE_DOMAIN_INTERNAL
};
