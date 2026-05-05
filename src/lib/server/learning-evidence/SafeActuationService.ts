import { PedagogicalSupportService } from '$lib/server/learning-evidence/PedagogicalSupportService';
import type { LearningEvidenceAccessContext } from '$lib/types/learningEvidence';

function getDisplayName(student: {
	username: string;
	email: string;
	alias?: string;
}): string {
	return student.alias?.trim() || student.username || student.email;
}

export class SafeActuationService {
	static async draftOutreachMessage(
		access: LearningEvidenceAccessContext,
		params: {
			activityId: string;
			studentId: string;
			channel?: 'email' | 'in_app';
			tone?: 'supportive' | 'direct' | 'celebratory';
			objective?: string;
		}
	) {
		const summary = await PedagogicalSupportService.summarizeEvidenceForStudent(access, {
			activityId: params.activityId,
			studentId: params.studentId,
			includeTranscriptExcerpts: false
		});
		const feedback = await PedagogicalSupportService.draftTeacherFeedback(access, {
			activityId: params.activityId,
			studentId: params.studentId,
			tone: params.tone ?? 'supportive'
		});
		const remediation = await PedagogicalSupportService.draftRemediationPlan(access, {
			activityId: params.activityId,
			studentId: params.studentId
		});
		const nextActivity = await PedagogicalSupportService.recommendNextActivity(access, {
			activityId: params.activityId,
			studentId: params.studentId
		});

		const channel = params.channel ?? 'email';
		const displayName = getDisplayName(summary.student);
		const objective =
			params.objective?.trim() ||
			(summary.riskLevel === 'high'
				? 'reactivar la participacion y desbloquear el avance'
				: 'mantener el avance y cerrar el siguiente paso');

		const nextStepText = nextActivity.recommendedActivity
			? `La siguiente actividad sugerida es "${nextActivity.recommendedActivity.name}".`
			: 'Conviene cerrar primero la actividad actual antes de abrir una siguiente tarea.';

		const bodyParagraphs = [
			channel === 'email'
				? `Te escribo porque he revisado tu progreso en "${summary.activityName}" y quiero ayudarte a ${objective}.`
				: `He revisado tu progreso en "${summary.activityName}" y quiero ayudarte a ${objective}.`,
			feedback.draft.bodyParagraphs[1] ??
				'Hay un punto concreto de la actividad que conviene reforzar.',
			`Propuesta de siguiente paso: ${remediation.studentActions[0]?.title ?? 'Retomar la actividad actual con apoyo guiado'}. ${nextStepText}`,
			feedback.draft.closing
		];

		return {
			activityId: params.activityId,
			activityName: summary.activityName,
			student: summary.student,
			channel,
			tone: params.tone ?? 'supportive',
			objective,
			rationale: {
				riskLevel: summary.riskLevel,
				observations: summary.observations.slice(0, 4),
				supportNeeds: summary.supportNeeds.slice(0, 4)
			},
			draft: {
				subject:
					channel === 'email'
						? `Seguimiento sobre ${summary.activityName}`
						: `Seguimiento de ${summary.activityName}`,
				greeting: channel === 'email' ? `Hola ${displayName},` : '',
				bodyParagraphs,
				callToAction:
					remediation.studentActions[0]?.title ??
					'Revisa el punto donde te bloqueaste y vuelve a intentar la actividad.',
				fullText: [
					channel === 'email' ? `Hola ${displayName},` : null,
					...bodyParagraphs
				]
					.filter((value): value is string => Boolean(value))
					.join('\n\n')
			},
			safetyNotes: [
				'Es un borrador y debe revisarse antes de enviarlo.',
				'Evita lenguaje diagnostico o determinista sobre el estudiante.',
				'Conviene personalizar el canal y el grado de urgencia antes de usarlo.'
			]
		};
	}

	static async draftStudentNotification(
		access: LearningEvidenceAccessContext,
		params: {
			activityId: string;
			studentId: string;
			priority?: 'low' | 'normal' | 'high';
			purpose?: 'reminder' | 'encouragement' | 'follow_up';
			customFocus?: string;
		}
	) {
		const summary = await PedagogicalSupportService.summarizeEvidenceForStudent(access, {
			activityId: params.activityId,
			studentId: params.studentId,
			includeTranscriptExcerpts: false
		});
		const nextActivity = await PedagogicalSupportService.recommendNextActivity(access, {
			activityId: params.activityId,
			studentId: params.studentId
		});

		const priority = params.priority ?? (summary.riskLevel === 'high' ? 'high' : 'normal');
		const purpose =
			params.purpose ?? (summary.riskLevel === 'high' ? 'follow_up' : 'reminder');
		const focus =
			params.customFocus?.trim() ||
			summary.supportNeeds[0] ||
			(nextActivity.recommendedActivity
				? `preparar la siguiente actividad: ${nextActivity.recommendedActivity.name}`
				: 'retomar la actividad actual');

		const titleByPurpose = {
			reminder: 'Recordatorio de actividad',
			encouragement: 'Buen avance, sigue asi',
			follow_up: 'Seguimiento de tu actividad'
		} as const;

		const messageByPurpose = {
			reminder: `Recuerda revisar "${summary.activityName}". Punto sugerido: ${focus}.`,
			encouragement: `Vas avanzando en "${summary.activityName}". Siguiente foco: ${focus}.`,
			follow_up: `He revisado tu progreso en "${summary.activityName}". Conviene atender este punto: ${focus}.`
		} as const;

		return {
			activityId: params.activityId,
			activityName: summary.activityName,
			student: summary.student,
			priority,
			purpose,
			focus,
			draft: {
				title: titleByPurpose[purpose],
				message: messageByPurpose[purpose]
			},
			rationale: {
				riskLevel: summary.riskLevel,
				observations: summary.observations.slice(0, 3),
				nextRecommendedActivity: nextActivity.recommendedActivity
			},
			safetyNotes: [
				'Borrador sin envio automatico.',
				'Conviene ajustar tono y prioridad antes de enviarlo al estudiante.'
			]
		};
	}
}
