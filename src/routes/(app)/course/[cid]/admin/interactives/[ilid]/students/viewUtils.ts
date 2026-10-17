import type { LessonReviewAttemptSummary } from '$lib/types/lessonReview';
import { saveBlobAs, type SaveBlobResult } from '$lib/utils/browserFileSave';

export type StudentsBadgeColor = 'gray' | 'green' | 'red' | 'yellow';
import { buildCsvContent } from '$lib/utils/csv';
import type { CsvCell } from '$lib/utils/csv';
export { buildCsvContent, escapeCsvCell, CSV_BOM } from '$lib/utils/csv';
export type { CsvCell } from '$lib/utils/csv';
export type ActivityStudentsCsvKind = 'chat' | 'agent' | 'lesson';

const csvStudentCollator = new Intl.Collator('es', {
	sensitivity: 'base',
	numeric: true
});
const csvKindFilenameLabels: Record<ActivityStudentsCsvKind, string> = {
	chat: 'chat',
	agent: 'agente',
	lesson: 'lesson'
};

type MessageMetrics = {
	keystrokeCount?: number;
	pasteCount?: number;
	timeSpentSeconds?: number;
};

type StudentChatLike = {
	messages?: Array<{ metadata?: string | null }> | null;
};

export function formatDate(
	date: string | number | Date | undefined | null,
	emptyLabel = 'Nunca'
): string {
	if (!date) return emptyLabel;

	const dateObj = date instanceof Date ? date : new Date(date);
	return dateObj.toLocaleDateString('es-ES', {
		year: 'numeric',
		month: 'long',
		day: 'numeric',
		hour: '2-digit',
		minute: '2-digit'
	});
}

function formatFilenameDate(date: Date): string {
	const year = date.getFullYear();
	const month = String(date.getMonth() + 1).padStart(2, '0');
	const day = String(date.getDate()).padStart(2, '0');

	return `${year}-${month}-${day}`;
}

function slugifyFilenamePart(value: string, fallback: string): string {
	const slug = value
		.normalize('NFD')
		.replace(/[\u0300-\u036f]/g, '')
		.toLowerCase()
		.replace(/[^a-z0-9]+/g, '-')
		.replace(/^-+|-+$/g, '')
		.slice(0, 80)
		.replace(/-+$/g, '');

	return slug || fallback;
}

export function buildActivityStudentsCsvFilename(
	kind: ActivityStudentsCsvKind,
	activityName: string | null | undefined,
	date = new Date()
): string {
	const activitySlug = slugifyFilenamePart(activityName ?? '', 'actividad');

	return `estudiantes-${csvKindFilenameLabels[kind]}-${activitySlug}-${formatFilenameDate(date)}.csv`;
}

export async function downloadCSV(rows: CsvCell[][], filename: string): Promise<SaveBlobResult> {
	const blob = new Blob([buildCsvContent(rows)], { type: 'text/csv;charset=utf-8' });

	return saveBlobAs(blob, filename, {
		description: 'CSV UTF-8',
		accept: { 'text/csv': ['.csv'] },
		excludeAcceptAllOption: false
	});
}

export function sortCsvRowsByStudent<T>(
	rows: T[],
	getDisplayName: (row: T) => string | null | undefined,
	getFallback: (row: T) => string | null | undefined = () => ''
): T[] {
	return [...rows].sort((a, b) => {
		const nameCompare = csvStudentCollator.compare(
			getDisplayName(a)?.trim() ?? '',
			getDisplayName(b)?.trim() ?? ''
		);

		if (nameCompare !== 0) return nameCompare;

		return csvStudentCollator.compare(getFallback(a)?.trim() ?? '', getFallback(b)?.trim() ?? '');
	});
}

export function collectInteractionMetrics(chats: StudentChatLike[]) {
	let totalKeypresses = 0;
	let totalPastes = 0;
	let totalTime = 0;

	chats.forEach((chat) => {
		if (!chat.messages) return;

		chat.messages.forEach((message) => {
			if (!message.metadata) return;

			try {
				const metrics = JSON.parse(message.metadata) as MessageMetrics;
				totalKeypresses += metrics.keystrokeCount || 0;
				totalPastes += metrics.pasteCount || 0;
				totalTime += metrics.timeSpentSeconds || 0;
			} catch {
				// Ignorar metadatos malformados al agregar métricas visibles o exportables.
			}
		});
	});

	return { totalKeypresses, totalPastes, totalTime };
}

export function lessonStatusLabel(attempt: LessonReviewAttemptSummary | null): string {
	if (!attempt) return 'Sin intentos';
	if (attempt.reviewStatus === 'completed') return 'Completado';
	if (attempt.reviewStatus === 'attention') return 'Con alertas';
	return 'Activo';
}

export function lessonStatusColor(attempt: LessonReviewAttemptSummary | null): StudentsBadgeColor {
	if (!attempt) return 'gray';
	if (attempt.reviewStatus === 'completed') return 'green';
	if (attempt.reviewStatus === 'attention') return 'red';
	return 'yellow';
}
