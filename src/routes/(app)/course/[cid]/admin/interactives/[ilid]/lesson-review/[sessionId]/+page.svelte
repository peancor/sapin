<script lang="ts">
	import { resolve } from '$app/paths';
	import { page } from '$app/state';
	import {
		AlertTriangle,
		ArrowLeft,
		Bot,
		CheckCircle2,
		GitBranch,
		ListChecks,
		Route
	} from 'lucide-svelte';
	import { formatDate } from '$lib/helpers/dateUtils';
	import { renderMarkdownMath } from '$lib/utils';
	import type { PageProps } from './$types';
	import type {
		LessonReviewAttemptSummary,
		LessonReviewVisitAgentMessage,
		LessonReviewVisitDetail
	} from '$lib/types/lessonReview';

	let { data }: PageProps = $props();

	function statusLabel(attempt: LessonReviewAttemptSummary): string {
		if (attempt.reviewStatus === 'completed') return 'Completado';
		if (attempt.reviewStatus === 'attention') return 'Con alertas';
		return 'Activo';
	}

	function statusClasses(attempt: LessonReviewAttemptSummary): string {
		if (attempt.reviewStatus === 'completed') {
			return 'border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-900/60 dark:bg-emerald-950/25 dark:text-emerald-300';
		}

		if (attempt.reviewStatus === 'attention') {
			return 'border-rose-200 bg-rose-50 text-rose-700 dark:border-rose-900/60 dark:bg-rose-950/25 dark:text-rose-300';
		}

		return 'border-amber-200 bg-amber-50 text-amber-700 dark:border-amber-900/60 dark:bg-amber-950/25 dark:text-amber-300';
	}

	function visitStatusLabel(visit: LessonReviewVisitDetail): string {
		if (visit.status === 'completed') return 'Completado';
		if (visit.status === 'abandoned') return 'Abandonado';
		if (visit.status === 'skipped') return 'Saltado';
		return 'Activo';
	}

	function visitStatusClasses(visit: LessonReviewVisitDetail): string {
		if (visit.status === 'completed') {
			return 'border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-900/60 dark:bg-emerald-950/25 dark:text-emerald-300';
		}
		if (visit.status === 'abandoned') {
			return 'border-rose-200 bg-rose-50 text-rose-700 dark:border-rose-900/60 dark:bg-rose-950/25 dark:text-rose-300';
		}
		if (visit.status === 'skipped') {
			return 'border-sky-200 bg-sky-50 text-sky-700 dark:border-sky-900/60 dark:bg-sky-950/25 dark:text-sky-300';
		}
		return 'border-amber-200 bg-amber-50 text-amber-700 dark:border-amber-900/60 dark:bg-amber-950/25 dark:text-amber-300';
	}

	function renderRichText(content: string | null | undefined): string {
		if (!content) return '';
		return renderMarkdownMath(content, { stripAgentMarkers: true });
	}

	function formatScore(score: number | null): string {
		if (score === null) return 'Sin score';
		if (score >= 0 && score <= 1) return `${Math.round(score * 100)}%`;
		return score.toFixed(2);
	}

	function messageRoleLabel(message: LessonReviewVisitAgentMessage): string {
		return message.role === 'USER' ? 'Alumno' : 'IA';
	}

	function audienceBadgeClasses(): string {
		if (data.detail.student.audience === 'student') {
			return 'border-slate-200 bg-slate-50 text-slate-600 dark:border-slate-700 dark:bg-slate-800/80 dark:text-slate-300';
		}

		return 'border-sky-200 bg-sky-50 text-sky-700 dark:border-sky-900/60 dark:bg-sky-950/25 dark:text-sky-300';
	}

	function audienceLabel(): string {
		return data.detail.student.audience === 'student'
			? 'Alumno'
			: `Staff · ${data.detail.student.courseRole}`;
	}
</script>

<div class="min-h-screen bg-[radial-gradient(circle_at_top_left,_rgba(245,158,11,0.08),_transparent_22%),radial-gradient(circle_at_top_right,_rgba(56,189,248,0.08),_transparent_22%),linear-gradient(180deg,_#fffaf0_0%,_#f8fafc_100%)] dark:bg-[radial-gradient(circle_at_top_left,_rgba(245,158,11,0.08),_transparent_24%),radial-gradient(circle_at_top_right,_rgba(56,189,248,0.06),_transparent_22%),linear-gradient(180deg,_#020617_0%,_#111827_100%)]">
	<div class="sticky top-0 z-20 border-b border-white/70 bg-white/85 backdrop-blur-xl dark:border-slate-800 dark:bg-slate-950/85">
		<div class="mx-auto flex max-w-7xl items-center gap-4 px-4 py-4 sm:px-6">
			<a
				href={resolve(`/course/${page.params.cid}/admin/interactives/${page.params.ilid}/lesson-review`)}
				class="inline-flex h-10 w-10 items-center justify-center rounded-2xl border border-slate-200 bg-white text-slate-600 transition-colors hover:border-amber-300 hover:text-amber-700 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300 dark:hover:border-amber-700 dark:hover:text-amber-200"
				aria-label="Volver a la revisión"
			>
				<ArrowLeft class="h-4 w-4" />
			</a>

			<div class="min-w-0 flex-1">
				<p class="text-[11px] font-semibold uppercase tracking-[0.24em] text-amber-700 dark:text-amber-300">
					Detalle de intento
				</p>
				<h1 class="truncate text-lg font-semibold text-slate-900 dark:text-white sm:text-xl">
					{data.activity.name} · intento #{data.detail.attempt.attemptNumber}
				</h1>
			</div>
		</div>
	</div>

	<div class="mx-auto max-w-7xl space-y-6 px-4 py-6 sm:px-6">
		<section class="grid gap-4 xl:grid-cols-[minmax(0,1.6fr)_360px]">
			<div class="rounded-[30px] border border-slate-200/80 bg-white/92 p-5 shadow-sm dark:border-slate-800 dark:bg-slate-900/88">
				<div class="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
					<div class="min-w-0 flex-1">
						<div class="flex flex-wrap items-center gap-2">
							<h2 class="text-xl font-semibold text-slate-900 dark:text-white">
								{data.detail.student.username}
							</h2>
							<span class={`rounded-full border px-2.5 py-1 text-[11px] font-semibold uppercase tracking-[0.16em] ${statusClasses(data.detail.attempt)}`}>
								{statusLabel(data.detail.attempt)}
							</span>
							<span class={`rounded-full border px-2.5 py-1 text-[11px] font-semibold uppercase tracking-[0.16em] ${audienceBadgeClasses()}`}>
								{audienceLabel()}
							</span>
						</div>
						{#if data.detail.student.alias}
							<p class="mt-1 text-sm italic text-slate-500 dark:text-slate-400">
								{data.detail.student.alias}
							</p>
						{/if}
						{#if data.detail.student.email}
							<p class="mt-2 text-sm text-slate-600 dark:text-slate-300">
								{data.detail.student.email}
							</p>
						{/if}
						{#if data.detail.student.audience === 'staff'}
							<p class="mt-3 rounded-2xl border border-sky-200 bg-sky-50 px-4 py-3 text-sm text-sky-800 dark:border-sky-900/60 dark:bg-sky-950/25 dark:text-sky-200">
								Intento de depuración del staff. Se muestra para validar la lectura de revisión, pero no cuenta dentro de la interpretación pedagógica del alumnado.
							</p>
						{/if}
						<div class="mt-4 flex flex-wrap gap-2">
							{#if data.detail.attempt.definitionRevisionNumber !== null}
								<span class="inline-flex items-center gap-1 rounded-full border border-slate-200 bg-slate-50 px-3 py-1.5 text-xs font-medium text-slate-700 dark:border-slate-700 dark:bg-slate-800/70 dark:text-slate-200">
									Revision #{data.detail.attempt.definitionRevisionNumber}
								</span>
							{/if}
							{#if data.detail.attempt.isHistoricalApproximation}
								<span class="inline-flex items-center gap-1 rounded-full border border-amber-200 bg-amber-50 px-3 py-1.5 text-xs font-medium text-amber-800 dark:border-amber-900/60 dark:bg-amber-950/25 dark:text-amber-200">
									Histórico aproximado
								</span>
							{/if}
							{#each data.detail.attempt.alerts as alert (alert.kind)}
								<span class="inline-flex items-center gap-1 rounded-full border border-rose-200 bg-rose-50 px-3 py-1.5 text-xs font-medium text-rose-700 dark:border-rose-900/60 dark:bg-rose-950/25 dark:text-rose-300">
									<AlertTriangle class="h-3.5 w-3.5" />
									{alert.label}
								</span>
							{/each}
						</div>
						{#if data.detail.attempt.isHistoricalApproximation}
							<p class="mt-3 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800 dark:border-amber-900/60 dark:bg-amber-950/25 dark:text-amber-200">
								Este intento fue ligado retroactivamente a la revisión publicada actual cuando se activó el versionado. La versión histórica exacta previa no estaba almacenada.
							</p>
						{/if}
					</div>
				</div>

				<div class="mt-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
					<div class="rounded-2xl bg-slate-100/90 px-4 py-3 dark:bg-slate-800/80">
						<p class="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500 dark:text-slate-400">Recorrido</p>
						<p class="mt-1 text-base font-semibold text-slate-900 dark:text-white">
							{data.detail.attempt.visitedBlocksCount}/{data.detail.attempt.totalBlocks} bloques
						</p>
					</div>
					<div class="rounded-2xl bg-slate-100/90 px-4 py-3 dark:bg-slate-800/80">
						<p class="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500 dark:text-slate-400">Checks</p>
						<p class="mt-1 text-base font-semibold text-slate-900 dark:text-white">
							{data.detail.attempt.checksPassed} superados · {data.detail.attempt.checksPending} pendientes
						</p>
					</div>
					<div class="rounded-2xl bg-slate-100/90 px-4 py-3 dark:bg-slate-800/80">
						<p class="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500 dark:text-slate-400">Fricción</p>
						<p class="mt-1 text-base font-semibold text-slate-900 dark:text-white">
							{data.detail.attempt.checkRetryBlocks} reintentos · {data.detail.attempt.revisitedBlocks} revisitas
						</p>
					</div>
					<div class="rounded-2xl bg-slate-100/90 px-4 py-3 dark:bg-slate-800/80">
						<p class="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500 dark:text-slate-400">Ramas</p>
						<p class="mt-1 text-base font-semibold text-slate-900 dark:text-white">
							{data.detail.attempt.branchCount}
						</p>
					</div>
				</div>

				<div class="mt-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
					<div class="rounded-2xl border border-slate-200/80 bg-slate-50/80 px-4 py-3 dark:border-slate-800 dark:bg-slate-950/50">
						<p class="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500 dark:text-slate-400">Inicio</p>
						<p class="mt-1 text-sm text-slate-700 dark:text-slate-200">{formatDate(data.detail.attempt.startedAt)}</p>
					</div>
					<div class="rounded-2xl border border-slate-200/80 bg-slate-50/80 px-4 py-3 dark:border-slate-800 dark:bg-slate-950/50">
						<p class="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500 dark:text-slate-400">Última actividad</p>
						<p class="mt-1 text-sm text-slate-700 dark:text-slate-200">{formatDate(data.detail.attempt.lastActiveAt)}</p>
					</div>
					<div class="rounded-2xl border border-slate-200/80 bg-slate-50/80 px-4 py-3 dark:border-slate-800 dark:bg-slate-950/50">
						<p class="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500 dark:text-slate-400">Bloque actual</p>
						<p class="mt-1 text-sm text-slate-700 dark:text-slate-200">{data.detail.attempt.currentBlockTitle}</p>
					</div>
					<div class="rounded-2xl border border-slate-200/80 bg-slate-50/80 px-4 py-3 dark:border-slate-800 dark:bg-slate-950/50">
						<p class="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500 dark:text-slate-400">Cierre</p>
						<p class="mt-1 text-sm text-slate-700 dark:text-slate-200">
							{data.detail.attempt.completedAt ? formatDate(data.detail.attempt.completedAt) : 'Todavía abierto'}
						</p>
					</div>
				</div>
			</div>

			<aside class="rounded-[30px] border border-slate-200/80 bg-white/92 p-5 shadow-sm dark:border-slate-800 dark:bg-slate-900/88">
				<div class="flex flex-wrap items-center gap-2">
					<h2 class="text-lg font-semibold text-slate-900 dark:text-white">Historial del participante</h2>
					<span class={`rounded-full border px-2.5 py-1 text-[11px] font-semibold uppercase tracking-[0.16em] ${audienceBadgeClasses()}`}>
						{audienceLabel()}
					</span>
				</div>
				<p class="mt-2 text-sm text-slate-600 dark:text-slate-300">
					Acceso rápido a otros intentos de esta misma lesson.
				</p>

				<div class="mt-5 space-y-3">
					{#each data.detail.history as historyAttempt (historyAttempt.sessionId)}
						<a
							href={resolve(`/course/${page.params.cid}/admin/interactives/${page.params.ilid}/lesson-review/${historyAttempt.sessionId}`)}
							class={`block rounded-[24px] border px-4 py-4 transition-colors ${
								historyAttempt.sessionId === data.detail.attempt.sessionId
									? 'border-amber-300 bg-amber-50 dark:border-amber-700 dark:bg-amber-950/25'
									: 'border-slate-200 bg-slate-50/80 hover:border-amber-300 dark:border-slate-800 dark:bg-slate-950/50 dark:hover:border-amber-700'
							}`}
						>
							<div class="flex flex-wrap items-center gap-2">
								<span class={`rounded-full border px-2.5 py-1 text-[11px] font-semibold uppercase tracking-[0.16em] ${statusClasses(historyAttempt)}`}>
									{statusLabel(historyAttempt)}
								</span>
								<span class="text-sm font-medium text-slate-900 dark:text-white">
									Intento #{historyAttempt.attemptNumber}
								</span>
							</div>
							<p class="mt-2 text-sm text-slate-600 dark:text-slate-300">
								{formatDate(historyAttempt.lastActiveAt)}
							</p>
						</a>
					{/each}
				</div>
			</aside>
		</section>

		<section class="space-y-4">
			{#each data.detail.timeline as visit (visit.visitId)}
				<article class="rounded-[32px] border border-slate-200/80 bg-white/95 p-5 shadow-sm dark:border-slate-800 dark:bg-slate-900/90">
					<div class="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
						<div class="min-w-0 flex-1">
							<div class="flex flex-wrap items-center gap-2">
								<span class="rounded-full bg-slate-100 px-2.5 py-1 text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-600 dark:bg-slate-800 dark:text-slate-300">
									Visita {visit.visitNumber}
								</span>
								<span class={`rounded-full border px-2.5 py-1 text-[11px] font-semibold uppercase tracking-[0.16em] ${visitStatusClasses(visit)}`}>
									{visitStatusLabel(visit)}
								</span>
								<span class="rounded-full border border-slate-200 bg-slate-50 px-2.5 py-1 text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-700 dark:border-slate-700 dark:bg-slate-800/70 dark:text-slate-200">
									{visit.blockKind}
								</span>
							</div>

							<h2 class="mt-3 text-lg font-semibold text-slate-900 dark:text-white">
								{visit.blockTitle}
							</h2>

							<div class="mt-3 flex flex-wrap gap-2 text-sm text-slate-500 dark:text-slate-400">
								<span>Entrada: {formatDate(visit.enteredAt)}</span>
								<span>·</span>
								<span>
									Salida: {visit.completedAt ? formatDate(visit.completedAt) : 'Sigue abierto'}
								</span>
							</div>
						</div>

						{#if visit.branchTargetBlockId}
							<div class="rounded-2xl border border-sky-200 bg-sky-50 px-4 py-3 text-sm text-sky-700 dark:border-sky-900/60 dark:bg-sky-950/25 dark:text-sky-300">
								<p class="font-medium">Transición</p>
								<p class="mt-1">{visit.branchLabel || 'Salida registrada'} → {visit.branchTargetBlockId}</p>
							</div>
						{/if}
					</div>

					<div class="mt-5 grid gap-4 xl:grid-cols-[minmax(0,1.3fr)_minmax(280px,0.9fr)]">
						<div class="rounded-[26px] border border-slate-200/80 bg-slate-50/80 px-4 py-4 dark:border-slate-800 dark:bg-slate-950/50">
							{#if visit.contentSummary}
								<p class="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500 dark:text-slate-400">
									Contexto del bloque
								</p>
								<div class="prose prose-sm mt-2 max-w-none text-slate-700 dark:prose-invert dark:text-slate-200">
									{@html renderRichText(visit.contentSummary)}
								</div>
							{/if}

							{#if visit.choice}
								<div class={visit.contentSummary ? 'mt-4 border-t border-slate-200/80 pt-4 dark:border-slate-800' : ''}>
									<p class="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500 dark:text-slate-400">
										Decisión registrada
									</p>
									<p class="mt-2 text-sm text-slate-700 dark:text-slate-200">
										<strong>Opción:</strong> {visit.choice.selectedLabel || 'Sin etiqueta'}
									</p>
									{#if visit.choice.selectedValue}
										<p class="mt-1 text-sm text-slate-600 dark:text-slate-300">
											<strong>Valor:</strong> {visit.choice.selectedValue}
										</p>
									{/if}
								</div>
							{/if}

							{#if visit.check}
								<div class={visit.contentSummary || visit.choice ? 'mt-4 border-t border-slate-200/80 pt-4 dark:border-slate-800' : ''}>
									<p class="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500 dark:text-slate-400">
										Resultado del checkpoint
									</p>
									<div class="mt-3 grid gap-3 sm:grid-cols-2">
										<div class="rounded-2xl bg-white/80 px-4 py-3 dark:bg-slate-900/70">
											<p class="text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-500 dark:text-slate-400">Score</p>
											<p class="mt-1 text-sm font-medium text-slate-900 dark:text-slate-100">
												{formatScore(visit.check.score)}
											</p>
										</div>
										<div class="rounded-2xl bg-white/80 px-4 py-3 dark:bg-slate-900/70">
											<p class="text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-500 dark:text-slate-400">Estado</p>
											<p class="mt-1 text-sm font-medium text-slate-900 dark:text-slate-100">
												{visit.check.passed ? 'Superado' : 'No superado'}
											</p>
										</div>
										<div class="rounded-2xl bg-white/80 px-4 py-3 dark:bg-slate-900/70">
											<p class="text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-500 dark:text-slate-400">Intentos usados</p>
											<p class="mt-1 text-sm font-medium text-slate-900 dark:text-slate-100">
												{visit.check.attemptCount}
											</p>
										</div>
										<div class="rounded-2xl bg-white/80 px-4 py-3 dark:bg-slate-900/70">
											<p class="text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-500 dark:text-slate-400">Restantes</p>
											<p class="mt-1 text-sm font-medium text-slate-900 dark:text-slate-100">
												{visit.check.attemptsRemaining ?? 'No aplica'}
											</p>
										</div>
									</div>

									{#if visit.check.feedback}
										<div class="prose prose-sm mt-3 max-w-none text-slate-700 dark:prose-invert dark:text-slate-200">
											{@html renderRichText(visit.check.feedback)}
										</div>
									{/if}
								</div>
							{/if}

							{#if visit.agent}
								<div class={visit.contentSummary || visit.choice || visit.check ? 'mt-4 border-t border-slate-200/80 pt-4 dark:border-slate-800' : ''}>
									<p class="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500 dark:text-slate-400">
										Interacción con IA
									</p>

									{#if visit.agent.summary}
										<p class="mt-2 text-sm text-slate-700 dark:text-slate-200">
											{visit.agent.summary}
										</p>
									{/if}

									{#if visit.agent.transcript.length > 0}
										<div class="mt-4 space-y-3">
											{#each visit.agent.transcript as transcriptMessage (transcriptMessage.id)}
												<div class={`rounded-2xl border px-4 py-3 ${
													transcriptMessage.role === 'USER'
														? 'border-sky-200 bg-sky-50 dark:border-sky-900/60 dark:bg-sky-950/25'
														: 'border-emerald-200 bg-emerald-50 dark:border-emerald-900/60 dark:bg-emerald-950/25'
												}`}>
													<p class="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500 dark:text-slate-400">
														{messageRoleLabel(transcriptMessage)} · {formatDate(transcriptMessage.createdAt)}
													</p>
													<div class="prose prose-sm mt-2 max-w-none text-slate-700 dark:prose-invert dark:text-slate-200">
														{@html renderRichText(transcriptMessage.content)}
													</div>
												</div>
											{/each}
										</div>
									{/if}
								</div>
							{/if}
						</div>

						<div class="space-y-3">
							<div class="rounded-[26px] bg-slate-100/90 px-4 py-4 dark:bg-slate-800/80">
								<p class="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500 dark:text-slate-400">
									<Route class="h-4 w-4" />
									Recorrido
								</p>
								<p class="mt-2 text-sm text-slate-700 dark:text-slate-200">
									Bloque <strong>{visit.blockId}</strong> dentro del intento #{data.detail.attempt.attemptNumber}.
								</p>
							</div>

							{#if visit.branchTargetBlockId}
								<div class="rounded-[26px] bg-sky-50 px-4 py-4 dark:bg-sky-950/20">
									<p class="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.18em] text-sky-700 dark:text-sky-300">
										<GitBranch class="h-4 w-4" />
										Rama tomada
									</p>
									<p class="mt-2 text-sm text-sky-800 dark:text-sky-200">
										{visit.branchLabel || 'Transición registrada'} hacia <strong>{visit.branchTargetBlockId}</strong>.
									</p>
								</div>
							{/if}

							{#if visit.blockKind === 'check'}
								<div class="rounded-[26px] bg-amber-50 px-4 py-4 dark:bg-amber-950/20">
									<p class="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.18em] text-amber-700 dark:text-amber-300">
										<ListChecks class="h-4 w-4" />
										Lectura pedagógica
									</p>
									<p class="mt-2 text-sm text-amber-800 dark:text-amber-200">
										{visit.check?.passed
											? 'El checkpoint quedó superado en esta visita.'
											: 'El checkpoint no quedó resuelto en esta visita.'}
									</p>
								</div>
							{/if}

							{#if visit.blockKind === 'end'}
								<div class="rounded-[26px] bg-emerald-50 px-4 py-4 dark:bg-emerald-950/20">
									<p class="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.18em] text-emerald-700 dark:text-emerald-300">
										<CheckCircle2 class="h-4 w-4" />
										Cierre
									</p>
									<p class="mt-2 text-sm text-emerald-800 dark:text-emerald-200">
										Esta visita cerró el intento y marcó la lesson como completada.
									</p>
								</div>
							{/if}

							{#if visit.blockKind === 'agent'}
								<div class="rounded-[26px] bg-sky-50 px-4 py-4 dark:bg-sky-950/20">
									<p class="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.18em] text-sky-700 dark:text-sky-300">
										<Bot class="h-4 w-4" />
										Evidencia IA
									</p>
									<p class="mt-2 text-sm text-sky-800 dark:text-sky-200">
										{visit.agent?.transcript.length
											? `${visit.agent.transcript.length} mensajes visibles registrados en esta visita.`
											: 'No quedó transcript visible; se muestra el resumen disponible.'}
									</p>
								</div>
							{/if}
						</div>
					</div>
				</article>
			{/each}
		</section>
	</div>
</div>
