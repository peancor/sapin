import type {
	LearningEvidenceStudentSummary,
	LearningEvidenceTranscriptMessage,
	LearningEvidenceTranscriptSession
} from '../../types/learningEvidence.ts';

export type OperationalSeverity = 'low' | 'medium' | 'high';

export interface DropoutStageSummary {
	key: 'enrolled' | 'started' | 'active' | 'completed' | 'abandoned';
	label: string;
	count: number;
	rate: number;
}

export interface DropoutTransitionSummary {
	from: string;
	to: string;
	rate: number;
	lostCount: number;
}

export interface ToolFrictionHotspotItem {
	kind: 'tool' | 'ui';
	key: string;
	label: string;
	totalUses: number;
	failedUses: number;
	pendingUses: number;
	affectedStudents: number;
	affectedSessions: number;
	stuckSessions: number;
	failureRate: number;
	pendingRate: number;
	averageDurationMs: number | null;
	frictionScore: number;
	examples: Array<{
		studentId: string;
		chatId: string;
		reasons: string[];
		excerpt: string[];
	}>;
}

export interface ResponseDepthStudentMetrics {
	studentId: string;
	totalLearnerMessages: number;
	averageMessageLength: number;
	elaboratedMessages: number;
	justificationMarkers: number;
	exampleMarkers: number;
	selfCorrectionMarkers: number;
	questioningMarkers: number;
	depthScore: number;
	depthBand: 'shallow' | 'developing' | 'deep';
	representativeExcerpt: string | null;
}

export interface MisconceptionCluster {
	key: string;
	label: string;
	description: string;
	affectedStudents: number;
	evidenceCount: number;
	confidence: OperationalSeverity;
	keywords: string[];
	excerpts: Array<{
		studentId: string;
		chatId: string;
		text: string;
	}>;
}

const STOPWORDS = new Set([
	'about',
	'after',
	'algo',
	'algunas',
	'algunos',
	'ante',
	'antes',
	'aqui',
	'asi',
	'aunque',
	'because',
	'between',
	'como',
	'con',
	'contra',
	'cual',
	'cuales',
	'cuando',
	'desde',
	'donde',
	'ellos',
	'ellas',
	'esta',
	'estan',
	'este',
	'estos',
	'for',
	'from',
	'hacia',
	'hasta',
	'into',
	'para',
	'pero',
	'porque',
	'puede',
	'pueden',
	'sobre',
	'that',
	'tengo',
	'tiene',
	'through',
	'under',
	'very',
	'with'
]);

const JUSTIFICATION_MARKERS = [
	'porque',
	'por que',
	'ya que',
	'debido',
	'por tanto',
	'por lo tanto',
	'entonces',
	'therefore',
	'because',
	'since'
] as const;

const EXAMPLE_MARKERS = [
	'por ejemplo',
	'ejemplo',
	'por ej',
	'for example',
	'for instance'
] as const;

const SELF_CORRECTION_MARKERS = [
	'corrijo',
	'me corrijo',
	'mejor dicho',
	'quiero decir',
	'en realidad',
	'rectifico',
	'i mean'
] as const;

const MISCONCEPTION_HINTS = [
	'no entiendo',
	'no comprendo',
	'creo que',
	'pense que',
	'pensaba que',
	'entonces',
	'pero si',
	'por que',
	'porque',
	'como puede ser',
	'why',
	'how can'
] as const;

function clamp(value: number, min: number, max: number): number {
	return Math.max(min, Math.min(max, value));
}

export function average(values: number[]): number {
	if (values.length === 0) return 0;
	return Math.round(values.reduce((sum, value) => sum + value, 0) / values.length);
}

export function getLatestIso(values: Array<string | null | undefined>): string | null {
	return values.reduce<string | null>((latest, current) => {
		if (!current) return latest;
		if (!latest) return current;
		return new Date(current) > new Date(latest) ? current : latest;
	}, null);
}

export function daysBetween(from: string | null | undefined, to: string | null | undefined): number | null {
	if (!from || !to) return null;
	const diffMs = new Date(to).getTime() - new Date(from).getTime();
	if (Number.isNaN(diffMs)) return null;
	return Math.max(0, Math.round(diffMs / (1000 * 60 * 60 * 24)));
}

export function daysSince(value: string | null | undefined): number | null {
	if (!value) return null;
	const diffMs = Date.now() - new Date(value).getTime();
	if (Number.isNaN(diffMs)) return null;
	return Math.max(0, Math.round(diffMs / (1000 * 60 * 60 * 24)));
}

export function normalizeComparableText(value: string): string {
	return value
		.normalize('NFKD')
		.replace(/\p{Mark}+/gu, '')
		.toLowerCase()
		.replace(/[^\p{L}\p{N}\s]+/gu, ' ')
		.replace(/\s+/g, ' ')
		.trim();
}

export function truncateText(value: string, maxLength = 180): string {
	if (value.length <= maxLength) return value;
	return `${value.slice(0, maxLength - 1)}…`;
}

export function buildSessionExcerpt(session: LearningEvidenceTranscriptSession): string[] {
	return session.messages
		.slice(-4)
		.map((message) => `${message.role}: ${truncateText(message.displayText, 140)}`);
}

export function extractRepeatedLearnerTurns(messages: LearningEvidenceTranscriptMessage[]): number {
	const seen = new Map<string, number>();
	let repeated = 0;

	for (const message of messages) {
		if (message.role !== 'user') continue;
		const normalized = normalizeComparableText(message.displayText);
		if (normalized.length < 12) continue;
		const count = seen.get(normalized) ?? 0;
		if (count >= 1) repeated++;
		seen.set(normalized, count + 1);
	}

	return repeated;
}

function countMarkers(text: string, markers: readonly string[]): number {
	const normalized = normalizeComparableText(text);
	return markers.reduce(
		(count, marker) => (normalized.includes(normalizeComparableText(marker)) ? count + 1 : count),
		0
	);
}

function getUserMessages(session: LearningEvidenceTranscriptSession): LearningEvidenceTranscriptMessage[] {
	return session.messages.filter((message) => message.role === 'user');
}

function computeSessionFrictionSignals(session: LearningEvidenceTranscriptSession) {
	const repeatedLearnerTurns = extractRepeatedLearnerTurns(session.messages);
	let toolFailureCount = 0;
	let unresolvedTurns = 0;

	for (const message of session.messages) {
		if (message.role === 'user') unresolvedTurns++;
		if (message.role === 'assistant') unresolvedTurns = 0;

		for (const part of message.parts) {
			if (part.kind === 'tool-result' && (part.status === 'failed' || Boolean(part.errorMessage))) {
				toolFailureCount++;
			}
		}
	}

	const endedWithoutAssistant = (session.messages.at(-1)?.role ?? 'assistant') !== 'assistant';
	const stuckLike =
		toolFailureCount > 0 ||
		repeatedLearnerTurns > 0 ||
		session.toolCallCount >= 3 ||
		unresolvedTurns >= 2 ||
		endedWithoutAssistant;

	return {
		repeatedLearnerTurns,
		toolFailureCount,
		unresolvedTurns,
		endedWithoutAssistant,
		stuckLike
	};
}

export function buildDropoutFunnel(
	studentSummaries: LearningEvidenceStudentSummary[],
	publishedAt?: string | null
) {
	const enrolled = studentSummaries.length;
	const startedStudents = studentSummaries.filter(
		(student) =>
			student.progressStatus !== 'not_started' || student.sessionCount > 0 || student.startedAt !== null
	);
	const activeStudents = studentSummaries.filter((student) => {
		if (student.progressStatus === 'completed') return true;
		if (student.progressStatus === 'in_progress') return true;
		const inactivityDays = daysSince(student.lastActivityAt);
		return student.sessionCount > 0 && inactivityDays !== null && inactivityDays <= 14;
	});
	const completedStudents = studentSummaries.filter((student) => student.progressStatus === 'completed');
	const abandonedStudents = studentSummaries.filter((student) => student.progressStatus === 'abandoned');

	const stages: DropoutStageSummary[] = [
		{ key: 'enrolled', label: 'Matriculados', count: enrolled, rate: enrolled > 0 ? 100 : 0 },
		{
			key: 'started',
			label: 'Arrancan',
			count: startedStudents.length,
			rate: enrolled > 0 ? Math.round((startedStudents.length / enrolled) * 100) : 0
		},
		{
			key: 'active',
			label: 'Activos',
			count: activeStudents.length,
			rate: enrolled > 0 ? Math.round((activeStudents.length / enrolled) * 100) : 0
		},
		{
			key: 'completed',
			label: 'Completan',
			count: completedStudents.length,
			rate: enrolled > 0 ? Math.round((completedStudents.length / enrolled) * 100) : 0
		},
		{
			key: 'abandoned',
			label: 'Abandonan',
			count: abandonedStudents.length,
			rate: enrolled > 0 ? Math.round((abandonedStudents.length / enrolled) * 100) : 0
		}
	];

	const transitions: DropoutTransitionSummary[] = [
		{
			from: 'enrolled',
			to: 'started',
			rate: enrolled > 0 ? Math.round((startedStudents.length / enrolled) * 100) : 0,
			lostCount: Math.max(enrolled - startedStudents.length, 0)
		},
		{
			from: 'started',
			to: 'active',
			rate: startedStudents.length > 0 ? Math.round((activeStudents.length / startedStudents.length) * 100) : 0,
			lostCount: Math.max(startedStudents.length - activeStudents.length, 0)
		},
		{
			from: 'active',
			to: 'completed',
			rate:
				activeStudents.length > 0
					? Math.round((completedStudents.length / activeStudents.length) * 100)
					: 0,
			lostCount: Math.max(activeStudents.length - completedStudents.length, 0)
		},
		{
			from: 'started',
			to: 'abandoned',
			rate:
				startedStudents.length > 0
					? Math.round((abandonedStudents.length / startedStudents.length) * 100)
					: 0,
			lostCount: abandonedStudents.length
		}
	];

	return {
		stages,
		transitions,
		averages: {
			daysToStart: average(
				startedStudents
					.map((student) => daysBetween(publishedAt ?? null, student.firstActivityAt))
					.filter((value): value is number => value !== null)
			),
			daysToAbandon: average(
				abandonedStudents
					.map((student) => daysBetween(student.firstActivityAt, student.lastActivityAt))
					.filter((value): value is number => value !== null)
			)
		}
	};
}

export function analyzeToolFrictionHotspotsFromTranscripts(
	transcripts: LearningEvidenceTranscriptSession[],
	options?: {
		toolNames?: string[];
		maxResults?: number;
		includeEvidenceExcerpts?: boolean;
	}
) {
	const toolFilter = new Set(
		(options?.toolNames ?? [])
			.map((value) => normalizeComparableText(value))
			.filter((value) => value.length > 0)
	);
	const maxResults = options?.maxResults ?? 10;
	const includeEvidenceExcerpts = options?.includeEvidenceExcerpts ?? true;
	const sessionSignals = new Map(
		transcripts.map((session) => [session.chatId, computeSessionFrictionSignals(session)])
	);

	const toolCalls = new Map<
		string,
		{
			toolCallId: string;
			toolName: string;
			label: string;
			chatId: string;
			studentId: string;
			status: string | null;
			failed: boolean;
			durationMs: number | null;
			reasons: string[];
			excerpt: string[];
		}
	>();
	const hotspots = new Map<
		string,
		{
			kind: 'tool' | 'ui';
			key: string;
			label: string;
			totalUses: number;
			failedUses: number;
			pendingUses: number;
			totalDurationMs: number;
			durationSamples: number;
			studentIds: Set<string>;
			chatIds: Set<string>;
			stuckChatIds: Set<string>;
			examples: Array<{
				studentId: string;
				chatId: string;
				reasons: string[];
				excerpt: string[];
			}>;
		}
	>();

	const ensureHotspot = (kind: 'tool' | 'ui', key: string, label: string) => {
		const current = hotspots.get(`${kind}:${key}`);
		if (current) return current;
		const created = {
			kind,
			key,
			label,
			totalUses: 0,
			failedUses: 0,
			pendingUses: 0,
			totalDurationMs: 0,
			durationSamples: 0,
			studentIds: new Set<string>(),
			chatIds: new Set<string>(),
			stuckChatIds: new Set<string>(),
			examples: [] as Array<{
				studentId: string;
				chatId: string;
				reasons: string[];
				excerpt: string[];
			}>
		};
		hotspots.set(`${kind}:${key}`, created);
		return created;
	};

	for (const session of transcripts) {
		const signals = sessionSignals.get(session.chatId);
		for (const message of session.messages) {
			for (const part of message.parts) {
				if (part.kind === 'tool-call') {
					toolCalls.set(part.toolCallId, {
						toolCallId: part.toolCallId,
						toolName: part.toolName,
						label: part.toolDisplayName,
						chatId: session.chatId,
						studentId: session.student.userId,
						status: part.status,
						failed: part.status === 'failed',
						durationMs: null,
						reasons: [],
						excerpt: buildSessionExcerpt(session)
					});
				}

				if (part.kind === 'tool-result' && part.toolCallId) {
					const current = toolCalls.get(part.toolCallId);
					const failed = part.status === 'failed' || Boolean(part.errorMessage);
					toolCalls.set(part.toolCallId, {
						toolCallId: part.toolCallId,
						toolName: current?.toolName ?? part.toolName,
						label: current?.label ?? part.toolDisplayName,
						chatId: current?.chatId ?? session.chatId,
						studentId: current?.studentId ?? session.student.userId,
						status: part.status ?? current?.status ?? null,
						failed: (current?.failed ?? false) || failed,
						durationMs: part.durationMs ?? current?.durationMs ?? null,
						reasons: current?.reasons ?? [],
						excerpt: current?.excerpt ?? buildSessionExcerpt(session)
					});
				}

				if (part.kind === 'ui-component' || part.kind === 'ui-response') {
					const key = part.componentKey;
					if (
						toolFilter.size > 0 &&
						!toolFilter.has(normalizeComparableText(key)) &&
						!toolFilter.has(normalizeComparableText(part.componentKey))
					) {
						continue;
					}

					const hotspot = ensureHotspot('ui', key, key);
					hotspot.studentIds.add(session.student.userId);
					hotspot.chatIds.add(session.chatId);
					if (signals?.stuckLike) hotspot.stuckChatIds.add(session.chatId);
					if (part.kind === 'ui-component') {
						hotspot.totalUses++;
						hotspot.pendingUses++;
					} else {
						hotspot.totalUses++;
						hotspot.pendingUses = Math.max(hotspot.pendingUses - 1, 0);
						if (typeof part.score === 'number' && part.score <= 50) {
							hotspot.failedUses++;
						}
						if (
							includeEvidenceExcerpts &&
							(hotspot.examples.length < 2 || (signals?.stuckLike ?? false))
						) {
							hotspot.examples.push({
								studentId: session.student.userId,
								chatId: session.chatId,
								reasons: [
									...(signals?.stuckLike ? ['Sesion con senales de friccion o atasco.'] : []),
									...(typeof part.score === 'number' && part.score <= 50
										? [`Respuesta UI con score bajo (${part.score}).`]
										: [])
								],
								excerpt: buildSessionExcerpt(session)
							});
						}
					}
				}
			}
		}
	}

	for (const call of toolCalls.values()) {
		if (
			toolFilter.size > 0 &&
			!toolFilter.has(normalizeComparableText(call.toolName)) &&
			!toolFilter.has(normalizeComparableText(call.label))
		) {
			continue;
		}

		const signals = sessionSignals.get(call.chatId);
		const hotspot = ensureHotspot('tool', call.toolName, call.label);
		hotspot.totalUses++;
		hotspot.studentIds.add(call.studentId);
		hotspot.chatIds.add(call.chatId);
		if (call.failed) hotspot.failedUses++;
		if (!call.failed && call.status !== 'completed') hotspot.pendingUses++;
		if (typeof call.durationMs === 'number') {
			hotspot.totalDurationMs += call.durationMs;
			hotspot.durationSamples++;
		}
		if (signals?.stuckLike) hotspot.stuckChatIds.add(call.chatId);
		if (
			includeEvidenceExcerpts &&
			(call.failed || signals?.stuckLike) &&
			hotspot.examples.length < 3
		) {
			hotspot.examples.push({
				studentId: call.studentId,
				chatId: call.chatId,
				reasons: [
					...(call.failed ? ['La herramienta fallo en esta sesion.'] : []),
					...(signals?.repeatedLearnerTurns
						? [`Se detectaron ${signals.repeatedLearnerTurns} reformulaciones del estudiante.`]
						: []),
					...(signals?.endedWithoutAssistant ? ['La sesion termina sin cierre claro del asistente.'] : [])
				],
				excerpt: call.excerpt
			});
		}
	}

	const items = [...hotspots.values()]
		.map<ToolFrictionHotspotItem>((hotspot) => {
			const failureRate = hotspot.totalUses > 0 ? Math.round((hotspot.failedUses / hotspot.totalUses) * 100) : 0;
			const pendingRate = hotspot.totalUses > 0 ? Math.round((hotspot.pendingUses / hotspot.totalUses) * 100) : 0;
			const frictionScore = clamp(
				Math.round(
					failureRate * 0.5 +
						pendingRate * 0.2 +
						hotspot.stuckChatIds.size * 8 +
						hotspot.studentIds.size * 2 +
						(hotspot.kind === 'ui' ? hotspot.pendingUses * 4 : 0)
				),
				0,
				100
			);
			return {
				kind: hotspot.kind,
				key: hotspot.key,
				label: hotspot.label,
				totalUses: hotspot.totalUses,
				failedUses: hotspot.failedUses,
				pendingUses: hotspot.pendingUses,
				affectedStudents: hotspot.studentIds.size,
				affectedSessions: hotspot.chatIds.size,
				stuckSessions: hotspot.stuckChatIds.size,
				failureRate,
				pendingRate,
				averageDurationMs:
					hotspot.durationSamples > 0
						? Math.round(hotspot.totalDurationMs / hotspot.durationSamples)
						: null,
				frictionScore,
				examples: hotspot.examples.slice(0, 3)
			};
		})
		.sort((a, b) => b.frictionScore - a.frictionScore || b.totalUses - a.totalUses || a.label.localeCompare(b.label))
		.slice(0, maxResults);

	return {
		summary: {
			totalSessions: transcripts.length,
			totalHotspots: items.length,
			toolHotspots: items.filter((item) => item.kind === 'tool').length,
			uiHotspots: items.filter((item) => item.kind === 'ui').length
		},
		items
	};
}

export function measureResponseDepthFromTranscripts(
	transcripts: LearningEvidenceTranscriptSession[]
): ResponseDepthStudentMetrics[] {
	const byStudent = new Map<
		string,
		{
			messageCount: number;
			totalLength: number;
			elaboratedMessages: number;
			justificationMarkers: number;
			exampleMarkers: number;
			selfCorrectionMarkers: number;
			questioningMarkers: number;
			excerpts: string[];
		}
	>();

	for (const session of transcripts) {
		const bucket = byStudent.get(session.student.userId) ?? {
			messageCount: 0,
			totalLength: 0,
			elaboratedMessages: 0,
			justificationMarkers: 0,
			exampleMarkers: 0,
			selfCorrectionMarkers: 0,
			questioningMarkers: 0,
			excerpts: [] as string[]
		};

		for (const message of getUserMessages(session)) {
			const text = message.displayText.trim();
			if (!text) continue;
			bucket.messageCount++;
			bucket.totalLength += text.length;
			if (text.length >= 120) bucket.elaboratedMessages++;
			bucket.justificationMarkers += countMarkers(text, JUSTIFICATION_MARKERS);
			bucket.exampleMarkers += countMarkers(text, EXAMPLE_MARKERS);
			bucket.selfCorrectionMarkers += countMarkers(text, SELF_CORRECTION_MARKERS);
			if (text.includes('?')) bucket.questioningMarkers++;
			if (bucket.excerpts.length < 3 && text.length >= 40) {
				bucket.excerpts.push(truncateText(text, 180));
			}
		}

		byStudent.set(session.student.userId, bucket);
	}

	return [...byStudent.entries()]
		.map(([studentId, metrics]) => {
			const averageMessageLength =
				metrics.messageCount > 0 ? Math.round(metrics.totalLength / metrics.messageCount) : 0;
			const depthScore = clamp(
				Math.round(
					Math.min(metrics.messageCount * 8, 24) +
						Math.min(averageMessageLength / 4, 26) +
						Math.min(metrics.elaboratedMessages * 12, 18) +
						Math.min(metrics.justificationMarkers * 8, 16) +
						Math.min(metrics.exampleMarkers * 7, 10) +
						Math.min(metrics.selfCorrectionMarkers * 10, 12) +
						Math.min(metrics.questioningMarkers * 3, 6)
				),
				0,
				100
			);

			return {
				studentId,
				totalLearnerMessages: metrics.messageCount,
				averageMessageLength,
				elaboratedMessages: metrics.elaboratedMessages,
				justificationMarkers: metrics.justificationMarkers,
				exampleMarkers: metrics.exampleMarkers,
				selfCorrectionMarkers: metrics.selfCorrectionMarkers,
				questioningMarkers: metrics.questioningMarkers,
				depthScore,
				depthBand:
					depthScore >= 70
						? 'deep'
						: depthScore >= 40
							? 'developing'
							: 'shallow' as 'shallow' | 'developing' | 'deep',
				representativeExcerpt: metrics.excerpts[0] ?? null
			};
		})
		.sort((a, b) => a.depthScore - b.depthScore || a.studentId.localeCompare(b.studentId));
}

function extractMisconceptionKeywords(text: string): string[] {
	return normalizeComparableText(text)
		.split(' ')
		.filter((token) => token.length >= 4 && !STOPWORDS.has(token))
		.slice(0, 5);
}

export function detectMisconceptionClustersFromTranscripts(
	transcripts: LearningEvidenceTranscriptSession[],
	maxClusters = 6
): MisconceptionCluster[] {
	const candidates = new Map<
		string,
		{
			keywords: Set<string>;
			excerpts: Array<{ studentId: string; chatId: string; text: string }>;
			studentIds: Set<string>;
		}
	>();

	for (const session of transcripts) {
		const signals = computeSessionFrictionSignals(session);
		for (const message of getUserMessages(session)) {
			const text = message.displayText.trim();
			if (text.length < 30) continue;
			const normalized = normalizeComparableText(text);
			const isCandidate =
				signals.stuckLike || MISCONCEPTION_HINTS.some((marker) => normalized.includes(marker));
			if (!isCandidate) continue;

			const keywords = extractMisconceptionKeywords(text);
			if (keywords.length < 2) continue;
			const key = keywords.slice(0, 3).sort().join('|');
			const bucket = candidates.get(key) ?? {
				keywords: new Set<string>(),
				excerpts: [] as Array<{ studentId: string; chatId: string; text: string }>,
				studentIds: new Set<string>()
			};
			keywords.forEach((keyword) => bucket.keywords.add(keyword));
			bucket.studentIds.add(session.student.userId);
			if (bucket.excerpts.length < 4) {
				bucket.excerpts.push({
					studentId: session.student.userId,
					chatId: session.chatId,
					text: truncateText(text, 220)
				});
			}
			candidates.set(key, bucket);
		}
	}

	return [...candidates.entries()]
		.filter(([, bucket]) => bucket.studentIds.size >= 2 || bucket.excerpts.length >= 3)
		.map<MisconceptionCluster>(([key, bucket]) => {
			const confidence: OperationalSeverity =
				bucket.studentIds.size >= 4 || bucket.excerpts.length >= 5
					? 'high'
					: bucket.studentIds.size >= 3
						? 'medium'
						: 'low';
			const keywords = [...bucket.keywords].slice(0, 5);
			return {
				key,
				label: keywords.slice(0, 3).join(', '),
				description: `Posible confusion recurrente alrededor de ${keywords.slice(0, 3).join(', ')}.`,
				affectedStudents: bucket.studentIds.size,
				evidenceCount: bucket.excerpts.length,
				confidence,
				keywords,
				excerpts: bucket.excerpts
			};
		})
		.sort((a, b) => b.affectedStudents - a.affectedStudents || b.evidenceCount - a.evidenceCount)
		.slice(0, maxClusters);
}
