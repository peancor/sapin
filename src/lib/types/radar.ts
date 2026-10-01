export const radarIntents = [
	'concept',
	'procedure',
	'notation',
	'example',
	'prerequisite',
	'reasoning',
	'social',
	'other'
] as const;
export type RadarIntent = (typeof radarIntents)[number];
export const radarIntentLabels: Record<RadarIntent, string> = {
	concept: 'Aclaración conceptual',
	procedure: 'Procedimiento',
	notation: 'Notación',
	example: 'Petición de ejemplo',
	prerequisite: 'Prerrequisito',
	reasoning: 'Validación de razonamiento',
	social: 'Cierre social',
	other: 'Otro'
};
export type RadarRunState = 'active' | 'finalizing' | 'finalized';
export type RadarAnalysisState = 'current' | 'pending' | 'processing' | 'partial' | 'blocked';
export type RadarWindow = 'recent' | 'all';
export interface RadarModel {
	id: string;
	name: string;
	isDefault: boolean;
}
export interface RadarRunView {
	id: string;
	title: string;
	courseId: string;
	activityId: string;
	activityType: 'chat' | 'agent';
	startsAt: string;
	endsAt: string;
	state: RadarRunState;
	analysisState: RadarAnalysisState;
	modelId: string;
	modelName: string;
	context: string | null;
	error: string | null;
	summary: string | null;
	analyzedAt: string | null;
	publishedVersion: number;
}
export interface RadarTopicView {
	id: string;
	title: string;
	description: string;
	suggestion: string | null;
	students: number;
	messages: number;
	firstAt: string;
	lastAt: string;
	intents: Partial<Record<RadarIntent, number>>;
	confusionCount: number;
	trend: { current: number; previous: number; percent: number | null } | null;
}
export interface RadarSnapshot {
	run: RadarRunView;
	window: RadarWindow;
	serverTime: string;
	statistics: {
		students: number;
		recentStudents: number;
		messages: number;
		perMinute: { at: string; messages: number }[];
		distribution: { messages: number; students: number }[];
		coverage: { processed: number; pending: number; notAnalyzable: number; truncated: number };
	};
	topics: RadarTopicView[];
	usage: { tokens: number; estimatedCost: number | null };
}
export interface RadarEvidence {
	id: string;
	studentId: string;
	studentName: string;
	at: string;
	text: string;
	chatUrl: string;
	intent: RadarIntent | null;
	confusion: string | null;
	insufficientContext: boolean;
	truncated: boolean;
	context: { id: string; role: 'user' | 'assistant'; text: string; at: string }[];
}
export interface RadarHistory {
	active: RadarRunView | null;
	runs: RadarRunView[];
	nextOffset: number | null;
}
export interface RadarEvidencePage {
	evidence: RadarEvidence[];
	nextOffset: number | null;
}
