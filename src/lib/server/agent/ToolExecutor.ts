import type { AgentContext, ToolDefinitionResolved, ToolResult } from '$lib/types/agent';
import { searchCourseContent } from './builtins/searchCourseContent';
import { getStudentProgress } from './builtins/getStudentProgress';
import { calculateExpression } from './builtins/calculateExpression';

type BuiltinHandler = (args: unknown, context: AgentContext) => Promise<ToolResult>;

/**
 * Registro de handlers builtin. Cada entrada mapea el nombre del handler
 * (definido en executorConfig.handler) a su implementación.
 */
const BUILTIN_HANDLERS: Record<string, BuiltinHandler> = {
    searchCourseContent: searchCourseContent as unknown as BuiltinHandler,
    getStudentProgress: getStudentProgress as unknown as BuiltinHandler,
    calculateExpression: calculateExpression as unknown as BuiltinHandler
};

export interface ToolExecutionResult {
    data: unknown;
    displayText?: string;
    success: boolean;
    errorMessage?: string;
    durationMs: number;
}

/**
 * ToolExecutor: responsable de ejecutar herramientas de forma segura.
 * El contexto del agente (userId, courseId) se propaga a cada handler,
 * lo que garantiza que los resultados estén filtrados por permisos.
 */
export class ToolExecutor {
    /**
     * Busca la definición de herramienta por nombre en la lista habilitada.
     */
    static findTool(
        toolName: string,
        enabledTools: ToolDefinitionResolved[]
    ): ToolDefinitionResolved | null {
        return enabledTools.find((t) => t.name === toolName) ?? null;
    }

    /**
     * Verifica si una herramienta requiere confirmación del usuario (HITL).
     */
    static requiresConfirmation(
        toolName: string,
        enabledTools: ToolDefinitionResolved[]
    ): boolean {
        const tool = this.findTool(toolName, enabledTools);
        return tool?.requiresConfirmation ?? false;
    }

    /**
     * Ejecuta una herramienta y devuelve el resultado.
     * Todos los errores son capturados para no romper el stream.
     */
    static async execute(
        toolName: string,
        args: Record<string, unknown>,
        context: AgentContext
    ): Promise<ToolExecutionResult> {
        const start = Date.now();
        const tool = this.findTool(toolName, context.enabledTools);

        if (!tool) {
            return {
                data: null,
                success: false,
                errorMessage: `Herramienta "${toolName}" no está disponible en esta actividad.`,
                durationMs: Date.now() - start
            };
        }

        try {
            if (tool.executorType === 'builtin') {
                return await this.executeBuiltin(tool, args, context);
            } else if (tool.executorType === 'http') {
                return await this.executeHttp(tool, args, context);
            }

            return {
                data: null,
                success: false,
                errorMessage: `Tipo de executor "${tool.executorType}" no soportado.`,
                durationMs: Date.now() - start
            };
        } catch (error) {
            return {
                data: null,
                success: false,
                errorMessage: error instanceof Error ? error.message : 'Error desconocido al ejecutar la herramienta',
                durationMs: Date.now() - start
            };
        }
    }

    private static async executeBuiltin(
        tool: ToolDefinitionResolved,
        args: Record<string, unknown>,
        context: AgentContext
    ): Promise<ToolExecutionResult> {
        const handler = tool.executorConfig.handler as string;

        if (!handler) {
            return {
                data: null,
                success: false,
                errorMessage: 'La herramienta builtin no tiene un handler configurado.',
                durationMs: 0
            };
        }

        const fn = BUILTIN_HANDLERS[handler];
        if (!fn) {
            return {
                data: null,
                success: false,
                errorMessage: `Handler builtin "${handler}" no está registrado.`,
                durationMs: 0
            };
        }

        const result = await fn(args, context);

        return {
            data: result.data,
            displayText: result.displayText,
            success: result.success,
            errorMessage: result.errorMessage,
            durationMs: result.durationMs
        };
    }

    private static async executeHttp(
        tool: ToolDefinitionResolved,
        args: Record<string, unknown>,
        context: AgentContext
    ): Promise<ToolExecutionResult> {
        const start = Date.now();
        const url = tool.executorConfig.url as string;
        const timeout = (tool.executorConfig.timeout as number) ?? 10000;

        if (!url) {
            return {
                data: null,
                success: false,
                errorMessage: 'La herramienta HTTP no tiene URL configurada.',
                durationMs: Date.now() - start
            };
        }

        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), timeout);

        try {
            const response = await fetch(url, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    toolName: tool.name,
                    args,
                    context: {
                        userId: context.userId,
                        courseId: context.courseId,
                        activityId: context.activityId
                    }
                }),
                signal: controller.signal
            });

            if (!response.ok) {
                return {
                    data: null,
                    success: false,
                    errorMessage: `HTTP ${response.status}: ${response.statusText}`,
                    durationMs: Date.now() - start
                };
            }

            const data = await response.json() as unknown;
            return {
                data,
                success: true,
                durationMs: Date.now() - start
            };
        } catch (error) {
            return {
                data: null,
                success: false,
                errorMessage:
                    error instanceof Error
                        ? error.name === 'AbortError'
                            ? `Timeout al ejecutar la herramienta (>${timeout}ms)`
                            : error.message
                        : 'Error de red',
                durationMs: Date.now() - start
            };
        } finally {
            clearTimeout(timer);
        }
    }
}
