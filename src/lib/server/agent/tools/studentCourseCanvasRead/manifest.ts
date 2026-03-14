import { BUILTIN_TOOL_USAGE_DOMAIN_AGENT_CHAT } from '../constants';
import type { ToolManifest } from '../types';

export const studentCourseCanvasReadManifest: ToolManifest = {
	name: 'student_course_canvas_read',
	displayName: 'Leer canvas del curso',
	description:
		'Lee el canvas privado de memoria del estudiante actual en este curso. Devuelve el documento completo actual, sin filtros ni búsqueda semántica.',
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
			exists: { type: 'boolean' },
			content: { type: ['string', 'null'] },
			revision: { type: ['integer', 'null'] },
			updatedAt: { type: ['string', 'null'] }
		},
		required: ['scopeType', 'scopeKey', 'exists', 'content', 'revision', 'updatedAt']
	},
	executorType: 'builtin',
	executorConfig: { handler: 'studentCourseCanvasRead' },
	requiresConfirmation: false,
	riskLevel: 'low',
	isSystem: true,
	version: '2.0.0',
	usageDomain: BUILTIN_TOOL_USAGE_DOMAIN_AGENT_CHAT
};
