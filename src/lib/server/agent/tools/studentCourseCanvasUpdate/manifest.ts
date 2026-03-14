import { BUILTIN_TOOL_USAGE_DOMAIN_AGENT_CHAT } from '../constants';
import type { ToolManifest } from '../types';

export const studentCourseCanvasUpdateManifest: ToolManifest = {
	name: 'student_course_canvas_update',
	displayName: 'Actualizar canvas del curso',
	description:
		'Reescribe el canvas privado de memoria del estudiante actual en este curso usando el historial real de la sesión y el canvas vigente. Llámala antes de finalizar cuando haya información nueva o confirmes que no hay cambios.',
	category: 'data',
	parametersSchema: {
		type: 'object',
		properties: {
			focus: {
				type: 'string',
				description: 'Foco opcional para guiar la consolidación de memoria.'
			},
			reason: {
				type: 'string',
				description: 'Motivo opcional de la sincronización.'
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
			status: { type: 'string' },
			stored: { type: 'boolean' },
			changed: { type: 'boolean' },
			changeSummary: { type: ['string', 'null'] },
			revision: { type: ['integer', 'null'] },
			updatedAt: { type: ['string', 'null'] }
		},
		required: [
			'scopeType',
			'scopeKey',
			'visibility',
			'scopeBindings',
			'status',
			'stored',
			'changed',
			'changeSummary',
			'revision',
			'updatedAt'
		]
	},
	executorType: 'builtin',
	executorConfig: { handler: 'studentCourseCanvasUpdate' },
	requiresConfirmation: false,
	riskLevel: 'low',
	isSystem: true,
	version: '2.0.0',
	usageDomain: BUILTIN_TOOL_USAGE_DOMAIN_AGENT_CHAT
};
