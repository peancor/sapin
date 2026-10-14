import type { RadarIntent } from './radar';

export type RadarActionWindow = 'all' | 'recent' | 'compare';
export type RadarActionPresentation = 'auto' | 'text' | 'statistics' | 'table' | 'bar' | 'line';
export interface RadarActionInput {
	name: string;
	prompt: string;
	scope: 'activity' | 'course';
	window: RadarActionWindow;
	minutes: number;
	presentation: RadarActionPresentation;
}
export interface RadarAction extends RadarActionInput {
	id: string;
	revision: number;
}
export interface RadarActionRow {
	key: string;
	label: string;
	value: number | null;
	previous: number | null;
	evidenceIds: string[];
}
export interface RadarActionDataset {
	id: string;
	title: string;
	unit: string;
	definition: string;
	rows: RadarActionRow[];
}
export interface RadarActionResult {
	text: string;
	evidenceIds: string[];
	datasets: RadarActionDataset[];
	blocks: { datasetId: string; kind: 'statistics' | 'table' | 'bar' | 'line' }[];
	limitations: string[];
}
export interface RadarActionSnapshotInfo {
	at: string;
	from: string;
	to: string;
	previousFrom: string | null;
	messages: number;
	students: number;
	processed: number;
	pending: number;
	notAnalyzable: number;
	truncated: number;
	publishedVersion: number;
}
export interface RadarActionExecution {
	id: string;
	runId: string;
	actionId: string | null;
	action: RadarActionInput & { revision: number };
	state: 'queued' | 'processing' | 'completed' | 'failed' | 'invalidated';
	createdAt: string;
	finishedAt: string | null;
	snapshot: RadarActionSnapshotInfo | null;
	result: RadarActionResult | null;
	error: string | null;
	usage: { tokens: number; estimatedCost: number | null };
}
/** Server-only data stored with the execution; no copied message text or learner identities. */
export interface RadarActionSnapshot extends RadarActionSnapshotInfo {
	evidenceVersion: number;
	context: string | null;
	topics: { id: string; title: string; description: string }[];
	observations: {
		id: string;
		student: string;
		at: string;
		status: string;
		intent: RadarIntent | null;
		confusion: boolean;
		topicIds: string[];
	}[];
}
