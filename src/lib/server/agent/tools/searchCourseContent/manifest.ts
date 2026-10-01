import {
	BUILTIN_TOOL_USAGE_DOMAIN_AGENT_CHAT
} from '../constants';
import type { ToolManifest } from '../types';

export const searchCourseContentManifest: ToolManifest = {
	name: 'search_course_content',
	displayName: 'Buscar contenido del curso',
	description:
		'Busca contenido relevante en los documentos y materiales del curso actual. Úsala cuando el estudiante pregunte algo que pueda estar en el material de estudio.',
	category: 'knowledge',
	parametersSchema: {
		type: 'object',
		properties: {
			query: {
				type: 'string',
				description: 'Términos de búsqueda para encontrar el contenido relevante'
			},
			topK: {
				type: 'integer',
				description: 'Número máximo de resultados a retornar',
				default: 5
			}
		},
		required: ['query']
	},
	responseSchema: {
		type: 'object',
		properties: {
			documents: {
				type: 'array',
				items: {
					type: 'object',
					properties: {
						content: { type: 'string' },
						source: { type: 'string' },
						score: { type: 'number' }
					}
				}
			},
			totalFound: { type: 'integer' },
			rawContext: { type: 'string' }
		},
		required: ['documents', 'totalFound']
	},
	executorType: 'builtin',
	executorConfig: { handler: 'searchCourseContent' },
	requiresConfirmation: false,
	riskLevel: 'low',
	isSystem: true,
	version: '1.0.0',
	usageDomain: BUILTIN_TOOL_USAGE_DOMAIN_AGENT_CHAT
};

