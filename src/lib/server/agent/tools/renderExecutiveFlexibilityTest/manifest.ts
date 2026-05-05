import { BUILTIN_TOOL_USAGE_DOMAIN_AGENT_CHAT } from '../constants';
import type { ToolManifest } from '../types';

export const renderExecutiveFlexibilityTestManifest: ToolManifest = {
	name: 'render_executive_flexibility_test',
	displayName: 'Mostrar Test de Flexibilidad Ejecutiva',
	description:
		'Abre la familia inmersiva para pruebas de funcion ejecutiva y flexibilidad cognitiva. Esta entrega deja lista la estructura para TMT y WCST.',
	category: 'ui',
	parametersSchema: {
		type: 'object',
		properties: {
			title: { type: 'string', description: 'Titulo de la experiencia' },
			testType: {
				type: 'string',
				enum: ['trail_making', 'wcst'],
				description: 'Tipo de test ejecutivo previsto'
			},
			instructions: { type: 'string', description: 'Texto introductorio opcional' }
		}
	},
	executorType: 'builtin',
	executorConfig: {
		handler: 'ui_renderer',
		componentKey: 'ExecutiveFlexibilityTest',
		interactive: false
	},
	requiresConfirmation: false,
	riskLevel: 'low',
	isSystem: true,
	version: '1.0.0',
	usageDomain: BUILTIN_TOOL_USAGE_DOMAIN_AGENT_CHAT
};
