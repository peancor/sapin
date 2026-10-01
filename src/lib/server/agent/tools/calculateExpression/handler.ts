import type { AgentContext, ToolResult } from '$lib/types/agent';
import { evaluateScopedExpression, EDUCATIONAL_EXPRESSION_SCOPE } from '$lib/math/expressionScope';

interface CalcParams {
	expression: string;
}

function formatResult(value: number): string {
	if (Number.isInteger(value)) {
		return value.toString();
	}
	// Mostrar hasta 10 decimales significativos
	return parseFloat(value.toPrecision(10)).toString();
}

export async function calculateExpression(
	params: CalcParams,
	_context: AgentContext
): Promise<ToolResult> {
	const start = Date.now();

	try {
		const result = evaluateScopedExpression(params.expression, EDUCATIONAL_EXPRESSION_SCOPE);
		const formatted = formatResult(result);

		return {
			success: true,
			data: {
				result,
				expression: params.expression,
				formatted
			},
			displayText: `${params.expression} = ${formatted}`,
			durationMs: Date.now() - start
		};
	} catch (error) {
		return {
			success: false,
			errorMessage:
				error instanceof Error
					? `Error al calcular "${params.expression}": ${error.message}`
					: 'Error de cálculo desconocido',
			durationMs: Date.now() - start
		};
	}
}
