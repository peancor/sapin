import test from 'node:test';
import assert from 'node:assert/strict';

import type { ActivityContext, ProcessedChatData, ReportOptions } from '../../types/insights.ts';
import { InsightsUtils } from './InsightsUtils.ts';

const activityContext: ActivityContext = {
	name: 'Actividad de prueba',
	description: 'Descripcion',
	systemPrompt: 'Sistema',
	llmRole: 'Tutor',
	llmInstructions: 'Instrucciones',
	llmContext: 'Contexto'
};

const chats: ProcessedChatData[] = [
	{
		studentUsername: 'student1',
		studentId: 'student-1',
		createdAt: '2026-04-01T08:00:00.000Z',
		messages: [
			{
				type: 'USER',
				content: 'Respuesta muy extensa pegada de golpe',
				createdAt: '2026-04-01T08:01:00.000Z',
				inputMetrics: {
					keystrokeCount: 3,
					pasteCount: 1,
					charCount: 360,
					wordCount: 65,
					timeSpentSeconds: 4,
					editCount: 0,
					deleteCount: 0,
					deviceInfo: {
						isMobile: false,
						userAgent: 'test-agent',
						screenSize: '1440x900'
					}
				}
			}
		]
	}
];

function makeOptions(overrides: Partial<ReportOptions> = {}): ReportOptions {
	return {
		analysisDepth: 'standard',
		focusAreas: ['performance'],
		includeExamples: true,
		model: 'test-model',
		customPrompt: '',
		detectAIUsage: false,
		temporalAnalysis: false,
		sentimentAnalysis: false,
		plagiarismDetection: false,
		skillsMapping: false,
		conceptMisconceptions: false,
		terminologyAnalysis: false,
		competencyLevels: false,
		teacherRecommendations: false,
		responseTimeAnalysis: false,
		analysisMode: 'individual',
		studentIds: ['student-1'],
		includeComparison: false,
		generateCharts: false,
		includeEarlyWarning: false,
		...overrides
	};
}

test('generateChatAnalysisPrompt includes input metrics and guidance when AI detection is enabled', () => {
	const prompt = InsightsUtils.generateChatAnalysisPrompt(activityContext, chats, {
		...makeOptions(),
		detectAIUsage: true
	});

	assert.match(prompt, /m[eé]tricas de escritura/i);
	assert.match(prompt, /pulsaciones/i);
	assert.match(prompt, /No tratar estas m[eé]tricas como prueba concluyente/i);
	assert.match(prompt, /inputMetrics/);
	assert.match(prompt, /"pasteCount": 1/);
});

test('generateChatAnalysisPrompt strips input metrics when AI detection is disabled', () => {
	const prompt = InsightsUtils.generateChatAnalysisPrompt(activityContext, chats, makeOptions());

	assert.doesNotMatch(prompt, /Detecci[oó]n de Uso de IA/);
	assert.doesNotMatch(prompt, /m[eé]tricas de escritura/i);
	assert.doesNotMatch(prompt, /inputMetrics/);
	assert.doesNotMatch(prompt, /"pasteCount": 1/);
});
