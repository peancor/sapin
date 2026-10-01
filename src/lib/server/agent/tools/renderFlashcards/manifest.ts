import {
	BUILTIN_TOOL_USAGE_DOMAIN_AGENT_CHAT
} from '../constants';
import type { ToolManifest } from '../types';

export const renderFlashcardsManifest: ToolManifest = {
	name: 'render_flashcards',
	displayName: 'Mostrar Flashcards',
	description:
		'Genera y muestra un mazo de flashcards interactivo directamente en el chat. Úsalo para ayudar al estudiante a memorizar conceptos, definiciones o vocabulario.',
	category: 'ui',
	parametersSchema: {
		type: 'object',
		properties: {
			title: { type: 'string', description: 'Título del mazo de flashcards' },
			cards: {
				type: 'array',
				description: 'Lista de tarjetas de estudio',
				items: {
					type: 'object',
					properties: {
						front: {
							type: 'string',
							description: 'Frente de la tarjeta (pregunta o término)'
						},
						back: {
							type: 'string',
							description: 'Reverso de la tarjeta (respuesta o definición)'
						}
					},
					required: ['front', 'back']
				}
			}
		},
		required: ['cards']
	},
	executorType: 'builtin',
	executorConfig: { handler: 'ui_renderer', componentKey: 'FlashcardDeck', interactive: true },
	requiresConfirmation: false,
	riskLevel: 'low',
	isSystem: true,
	version: '1.0.0',
	usageDomain: BUILTIN_TOOL_USAGE_DOMAIN_AGENT_CHAT
};

