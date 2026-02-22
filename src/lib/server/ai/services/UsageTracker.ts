import { AIModelService } from '../AIModelService';
import { ModelResolver } from './ModelResolver';

export class UsageTracker {
	public static async checkQuota(
		modelName: string,
		userId?: string,
		courseId?: string,
		interactiveLearningId?: string
	) {
		const modelId = await ModelResolver.getModelIdByName(modelName);
		if (!modelId) return { allowed: true };

		return AIModelService.checkQuota(modelId, userId, courseId, interactiveLearningId);
	}

	public static async logUsage(params: {
		modelName: string;
		userId?: string;
		courseId?: string;
		interactiveLearningId?: string;
		chatId?: string;
		operation: 'chat' | 'completion' | 'image' | 'embedding';
		inputTokens: number;
		outputTokens: number;
		durationMs?: number;
		success?: boolean;
		errorMessage?: string;
		metadata?: Record<string, unknown>;
	}) {
		const modelId = await ModelResolver.getModelIdByName(params.modelName);
		if (!modelId) return null;

		return AIModelService.logUsage({
			modelId,
			userId: params.userId,
			courseId: params.courseId,
			interactiveLearningId: params.interactiveLearningId,
			chatId: params.chatId,
			operation: params.operation,
			inputTokens: params.inputTokens,
			outputTokens: params.outputTokens,
			durationMs: params.durationMs,
			success: params.success,
			errorMessage: params.errorMessage,
			metadata: params.metadata
		});
	}
}
