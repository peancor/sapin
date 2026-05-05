import type { LessonReviewAttemptSummary } from '$lib/types/lessonReview';

export type StudentsBadgeColor = 'gray' | 'green' | 'red' | 'yellow';

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

export function downloadCSV(content: string, filename: string): void {
	const blob = new Blob([content], { type: 'text/csv;charset=utf-8;' });
	const url = URL.createObjectURL(blob);
	const link = document.createElement('a');

	link.setAttribute('href', url);
	link.setAttribute('download', filename);
	document.body.appendChild(link);
	link.click();
	document.body.removeChild(link);
	URL.revokeObjectURL(url);
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

export function lessonStatusColor(
	attempt: LessonReviewAttemptSummary | null
): StudentsBadgeColor {
	if (!attempt) return 'gray';
	if (attempt.reviewStatus === 'completed') return 'green';
	if (attempt.reviewStatus === 'attention') return 'red';
	return 'yellow';
}
