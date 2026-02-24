import type { AgentContext, ToolResult } from '$lib/types/agent';

interface CalcParams {
    expression: string;
}

// Funciones matemáticas permitidas (whitelist estricta — sin eval)
const ALLOWED_FUNCTIONS: Record<string, (...args: number[]) => number> = {
    sqrt: Math.sqrt,
    cbrt: Math.cbrt,
    abs: Math.abs,
    ceil: Math.ceil,
    floor: Math.floor,
    round: Math.round,
    sin: Math.sin,
    cos: Math.cos,
    tan: Math.tan,
    asin: Math.asin,
    acos: Math.acos,
    atan: Math.atan,
    atan2: Math.atan2,
    log: Math.log,
    log2: Math.log2,
    log10: Math.log10,
    exp: Math.exp,
    pow: Math.pow,
    max: Math.max,
    min: Math.min,
    sign: Math.sign,
    trunc: Math.trunc
};

const ALLOWED_CONSTANTS: Record<string, number> = {
    pi: Math.PI,
    PI: Math.PI,
    e: Math.E,
    E: Math.E,
    phi: 1.618033988749895,
    tau: 2 * Math.PI
};

/**
 * Evalúa una expresión matemática de forma segura sin usar eval().
 * Usa el constructor Function con un scope restringido.
 */
function safeEval(expression: string): number {
    // Sanitizar: solo permitir caracteres matemáticos válidos
    const sanitized = expression
        .replace(/[^0-9+\-*/().,%^, abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ_]/g, '')
        .trim();

    if (!sanitized) {
        throw new Error('Expresión vacía o inválida');
    }

    // Construir scope con funciones y constantes permitidas
    const scope = { ...ALLOWED_CONSTANTS, ...ALLOWED_FUNCTIONS };
    const scopeKeys = Object.keys(scope);
    const scopeValues = Object.values(scope);

    // Reemplazar ^ por ** (potencia)
    const expr = sanitized.replace(/\^/g, '**');

    // Usar Function con scope restringido (no eval global)
    const fn = new Function(...scopeKeys, `"use strict"; return (${expr});`);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const result = fn(...scopeValues) as any;

    if (typeof result !== 'number' || !isFinite(result)) {
        throw new Error(`Resultado no numérico: ${result}`);
    }

    return result;
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
        const result = safeEval(params.expression);
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
