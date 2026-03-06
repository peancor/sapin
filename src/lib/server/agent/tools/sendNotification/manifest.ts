import {
	BUILTIN_TOOL_USAGE_DOMAIN_AGENT_CHAT
} from '../constants';
import type { ToolManifest } from '../types';

export const sendNotificationManifest: ToolManifest = {
	name: 'send_notification',
	displayName: 'Enviar notificación',
	description:
		'Envía una notificación in-app al estudiante. Úsala para felicitar logros, recordar tareas pendientes o enviar mensajes importantes. REQUIERE CONFIRMACIÓN antes de enviar.',
	category: 'communication',
	parametersSchema: {
		type: 'object',
		properties: {
			title: {
				type: 'string',
				description: 'Título breve de la notificación'
			},
			message: {
				type: 'string',
				description: 'Cuerpo del mensaje de la notificación'
			},
			priority: {
				type: 'string',
				description: 'Prioridad: low, normal o high',
				enum: ['low', 'normal', 'high'],
				default: 'normal'
			}
		},
		required: ['title', 'message']
	},
	responseSchema: {
		type: 'object',
		properties: {
			title: { type: 'string' },
			message: { type: 'string' },
			notificationId: { type: 'string' }
		},
		required: ['title', 'message', 'notificationId']
	},
	executorType: 'builtin',
	executorConfig: { handler: 'sendNotification' },
	requiresConfirmation: true,
	riskLevel: 'low',
	isSystem: true,
	version: '1.0.0',
	usageDomain: BUILTIN_TOOL_USAGE_DOMAIN_AGENT_CHAT
};

