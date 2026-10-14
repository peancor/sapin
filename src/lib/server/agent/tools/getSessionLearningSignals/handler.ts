import { db } from '$lib/server/db';
import type { AgentContext, ToolResult } from '$lib/types/agent';
import { readSessionSignals, type SessionSignalsParams } from './signals';

export async function getSessionLearningSignals(
	params: SessionSignalsParams,
	context: AgentContext
): Promise<ToolResult> {
	const start = Date.now();
	try {
		const data = await readSessionSignals(db, context, params);
		return {
			success: true,
			data,
			displayText: `Métricas disponibles en ${data.messagesWithMetrics} de ${data.messageCount} mensajes consultados.`,
			durationMs: Date.now() - start
		};
	} catch {
		return {
			success: false,
			errorMessage: 'No se pueden consultar las métricas de esta sesión.',
			durationMs: Date.now() - start
		};
	}
}
