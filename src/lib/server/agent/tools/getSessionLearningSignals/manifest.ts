import { BUILTIN_TOOL_USAGE_DOMAIN_AGENT_CHAT } from '../constants';
import type { ToolManifest } from '../types';

export const getSessionLearningSignalsManifest: ToolManifest = {
	name: 'get_session_learning_signals',
	displayName: 'Consultar métricas de la sesión',
	description:
		'Consulta métricas observadas de los mensajes enviados por el alumno en esta conversación: pegados, pulsaciones, revisiones, borrados, longitud y tiempo transcurrido. Incluye cobertura y valores desconocidos. No mide el contenido ni el origen del portapapeles, ni demuestra autoría o comprensión. Cuándo consultar y cómo actuar depende de las instrucciones de la actividad.',
	category: 'data',
	parametersSchema: {
		type: 'object',
		properties: {
			scope: {
				type: 'string',
				enum: ['latest', 'recent', 'session'],
				description:
					'latest: último mensaje; recent: últimos mensajes; session: acumulado completo sin detalle por mensaje. Por defecto latest.'
			},
			limit: {
				type: 'integer',
				minimum: 1,
				maximum: 50,
				description:
					'Número de mensajes para recent (por defecto 5). Ignorado en los otros ámbitos.'
			}
		},
		required: []
	},
	responseSchema: {
		type: 'object',
		properties: {
			scope: { type: 'string' },
			messageCount: { type: 'integer' },
			messagesWithMetrics: { type: 'integer' },
			metrics: { type: 'object' },
			messages: { type: 'array' },
			limitations: { type: 'array' }
		},
		required: ['scope', 'messageCount', 'messagesWithMetrics', 'metrics', 'messages', 'limitations']
	},
	executorType: 'builtin',
	executorConfig: { handler: 'getSessionLearningSignals' },
	requiresConfirmation: false,
	riskLevel: 'low',
	isSystem: true,
	version: '1.0.0',
	usageDomain: BUILTIN_TOOL_USAGE_DOMAIN_AGENT_CHAT
};
