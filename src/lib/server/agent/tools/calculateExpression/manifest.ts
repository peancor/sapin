import {
	BUILTIN_TOOL_USAGE_DOMAIN_AGENT_CHAT
} from '../constants';
import type { ToolManifest } from '../types';

export const calculateExpressionManifest: ToolManifest = {
	name: 'calculate_expression',
	displayName: 'Calcular expresión matemática',
	description:
		'Evalúa expresiones matemáticas de forma segura, incluyendo aleatoriedad entera y helpers educativos como randInt, gcd, lcm, factorial, avg o deg2rad. Útil para verificar cálculos del estudiante, generar variaciones de ejercicios o demostrar operaciones paso a paso.',
	category: 'data',
	parametersSchema: {
		type: 'object',
		properties: {
			expression: {
				type: 'string',
				description:
					'Expresión matemática a evaluar. Ej: "2 * (3 + 4)", "sqrt(16)", "randInt(1, 6)", "gcd(12, 18)", "avg(4, 7, 9)", "deg2rad(180)"'
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
	version: '1.1.0',
	usageDomain: BUILTIN_TOOL_USAGE_DOMAIN_AGENT_CHAT
};

