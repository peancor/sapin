import {
	BUILTIN_TOOL_USAGE_DOMAIN_AGENT_CHAT
} from '../constants';
import type { ToolManifest } from '../types';

export const calculateExpressionManifest: ToolManifest = {
	name: 'calculate_expression',
	displayName: 'Calcular expresión matemática',
	description:
		'Evalúa una expresión matemática de forma segura. Útil para verificar cálculos del estudiante o demostrar operaciones matemáticas.',
	category: 'data',
	parametersSchema: {
		type: 'object',
		properties: {
			expression: {
				type: 'string',
				description: 'Expresión matemática a evaluar. Ej: "2 * (3 + 4)", "sqrt(16)", "sin(pi/2)"'
			}
		},
		required: ['expression']
	},
	responseSchema: {
		type: 'object',
		properties: {
			result: { type: 'number' },
			expression: { type: 'string' },
			formatted: { type: 'string' }
		},
		required: ['result', 'expression', 'formatted']
	},
	executorType: 'builtin',
	executorConfig: { handler: 'calculateExpression' },
	requiresConfirmation: false,
	riskLevel: 'low',
	isSystem: true,
	version: '1.0.0',
	usageDomain: BUILTIN_TOOL_USAGE_DOMAIN_AGENT_CHAT
};

