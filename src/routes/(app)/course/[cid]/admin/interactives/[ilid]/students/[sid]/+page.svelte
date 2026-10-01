<script lang="ts">
	import { resolve } from '$app/paths';
	import { page } from '$app/state';
	import type { PageProps } from './$types';
	import { Avatar, Badge } from 'flowbite-svelte';
	import {
		AlertTriangle,
		ArrowLeft,
		CheckCircle2,
		Clock3,
		Eye,
		GitBranch,
		ListChecks,
		Route
	} from 'lucide-svelte';
	import type { LessonReviewAttemptSummary } from '$lib/types/lessonReview';

	let { data }: PageProps = $props();

	type LessonBadgeColor = 'gray' | 'green' | 'red' | 'yellow';

	function formatDate(date: string | number | Date | null | undefined): string {
		if (!date) return 'Sin actividad';
		const dateObj = date instanceof Date ? date : new Date(date);
		return dateObj.toLocaleDateString('es-ES', {
			year: 'numeric',
			month: 'long',
			day: 'numeric',
			hour: '2-digit',
			minute: '2-digit'
		});
	}

	function statusLabel(attempt: LessonReviewAttemptSummary | null): string {
		if (!attempt) return 'Sin intentos';
		if (attempt.reviewStatus === 'completed') return 'Completado';
		if (attempt.reviewStatus === 'attention') return 'Con alertas';
		return 'Activo';
	}

	function statusClasses(attempt: LessonReviewAttemptSummary | null): LessonBadgeColor {
		if (!attempt) return 'gray';
		if (attempt.reviewStatus === 'completed') return 'green';
		if (attempt.reviewStatus === 'attention') return 'red';
		return 'yellow';
	}
</script>

<svelte:head>
	<title>{data.detail.student.username} · Estudiantes lesson · {data.activity.name}</title>
</svelte:head>

<div class="min-h-screen bg-[radial-gradient(circle_at_top_left,_rgba(245,158,11,0.08),_transparent_24%),radial-gradient(circle_at_top_right,_rgba(56,189,248,0.07),_transparent_22%),linear-gradient(180deg,_#fffaf0_0%,_#f8fafc_100%)] dark:bg-[radial-gradient(circle_at_top_left,_rgba(245,158,11,0.08),_transparent_24%),radial-gradient(circle_at_top_right,_rgba(56,189,248,0.06),_transparent_22%),linear-gradient(180deg,_#020617_0%,_#111827_100%)]">
	<div class="sticky top-0 z-20 border-b border-white/70 bg-white/85 backdrop-blur-xl dark:border-slate-800 dark:bg-slate-950/85">
		<div class="mx-auto flex max-w-7xl items-center gap-4 px-4 py-4 sm:px-6">
			<a
				href={resolve(`/course/${page.params.cid}/admin/interactives/${page.params.ilid}/students`)}
				class="inline-flex h-10 w-10 items-center justify-center rounded-2xl border border-slate-200 bg-white text-slate-600 transition-colors hover:border-amber-300 hover:text-amber-700 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300 dark:hover:border-amber-700 dark:hover:text-amber-200"
				aria-label="Volver a estudiantes"
			>
				<ArrowLeft class="h-4 w-4" />
			</a>

			<div class="min-w-0 flex-1">
				<p class="text-[11px] font-semibold uppercase tracking-[0.24em] text-amber-700 dark:text-amber-300">
					Ficha de alumno
				</p>
				<h1 class="truncate text-lg font-semibold text-slate-900 dark:text-white sm:text-xl">
					{data.activity.name}
				</h1>
			</div>
		</div>
	</div>

	<div class="mx-auto max-w-7xl space-y-6 px-4 py-6 sm:px-6">
		<section class="rounded-[30px] border border-slate-200/80 bg-white/92 p-5 shadow-sm dark:border-slate-800 dark:bg-slate-900/88">
			<div class="flex flex-col gap-5 xl:flex-row xl:items-start xl:justify-between">
				<div class="flex min-w-0 flex-1 gap-4">
					<Avatar
						src={data.detail.student.image || '/images/default_avatar.png'}
						class="h-16 w-16 shrink-0"
						alt={data.detail.student.username}
						cornerStyle="rounded"
					/>

					<div class="min-w-0 flex-1">
						<div class="flex flex-wrap items-center gap-2">
							<h2 class="truncate text-2xl font-semibold text-slate-900 dark:text-white">
								{data.detail.student.username}
							</h2>
							<Badge color={statusClasses(data.detail.latestAttempt)}>
								{statusLabel(data.detail.latestAttempt)}
							</Badge>
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
						<p class="mt-3 max-w-3xl text-sm leading-6 text-slate-600 dark:text-slate-300">
							Esta ficha resume todos los intentos del alumno en la lesson. Desde aquí puedes abrir cualquier sesión concreta en la revisión avanzada sin mezclar intentos del staff.
						</p>
					</div>
				</div>

				{#if data.detail.latestAttempt}
					<a
						href={resolve(`/course/${page.params.cid}/admin/interactives/${page.params.ilid}/lesson-review/${data.detail.latestAttempt.sessionId}`)}
						class="inline-flex items-center justify-center gap-2 rounded-2xl bg-slate-900 px-4 py-3 text-sm font-medium text-white transition-colors hover:bg-slate-700 dark:bg-white dark:text-slate-900 dark:hover:bg-slate-200"
					>
						<Eye class="h-4 w-4" />
						Abrir último intento
					</a>
				{/if}
			</div>

			<div class="mt-5 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
				<div class="rounded-2xl bg-slate-100/90 px-4 py-3 dark:bg-slate-800/80">
					<p class="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500 dark:text-slate-400">Intentos</p>
					<p class="mt-1 text-2xl font-semibold text-slate-900 dark:text-white">
						{data.detail.summary.totalAttempts}
					</p>
					<p class="text-sm text-slate-500 dark:text-slate-400">
						{data.detail.summary.completedAttempts} completados
					</p>
				</div>

				<div class="rounded-2xl bg-slate-100/90 px-4 py-3 dark:bg-slate-800/80">
					<p class="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500 dark:text-slate-400">Alertas</p>
					<p class="mt-1 text-2xl font-semibold text-slate-900 dark:text-white">
						{data.detail.summary.attemptsWithAlerts}
					</p>
					<p class="text-sm text-slate-500 dark:text-slate-400">
						{data.detail.summary.totalAlerts} señales totales
					</p>
				</div>

				<div class="rounded-2xl bg-slate-100/90 px-4 py-3 dark:bg-slate-800/80">
					<p class="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500 dark:text-slate-400">Bloques visitados</p>
					<p class="mt-1 text-2xl font-semibold text-slate-900 dark:text-white">
						{data.detail.summary.totalVisitedBlocks}
					</p>
					<p class="text-sm text-slate-500 dark:text-slate-400">
						{data.detail.summary.totalBranches} ramas tomadas
					</p>
				</div>

				<div class="rounded-2xl bg-slate-100/90 px-4 py-3 dark:bg-slate-800/80">
					<p class="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500 dark:text-slate-400">Última actividad</p>
					<p class="mt-1 text-base font-semibold text-slate-900 dark:text-white">
						{formatDate(data.detail.summary.lastActivityAt)}
					</p>
					<p class="text-sm text-slate-500 dark:text-slate-400">
						{data.detail.summary.activeAttempts} intento(s) activo(s)
					</p>
				</div>
			</div>

			<div class="mt-4 grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
				<div class="rounded-2xl border border-slate-200/80 bg-slate-50/80 px-4 py-3 dark:border-slate-800 dark:bg-slate-950/50">
					<div class="flex items-center gap-2 text-slate-600 dark:text-slate-300">
						<ListChecks class="h-4 w-4" />
						<span class="text-sm font-medium">Checks agregados</span>
					</div>
					<p class="mt-2 text-sm text-slate-700 dark:text-slate-200">
						{data.detail.summary.totalChecksPassed} superados · {data.detail.summary.totalChecksPending} pendientes
					</p>
				</div>

				<div class="rounded-2xl border border-slate-200/80 bg-slate-50/80 px-4 py-3 dark:border-slate-800 dark:bg-slate-950/50">
					<div class="flex items-center gap-2 text-slate-600 dark:text-slate-300">
						<Route class="h-4 w-4" />
						<span class="text-sm font-medium">Revisitas</span>
					</div>
					<p class="mt-2 text-sm text-slate-700 dark:text-slate-200">
						{data.detail.summary.totalRevisitedBlocks} bloques revisitados
					</p>
				</div>

				<div class="rounded-2xl border border-slate-200/80 bg-slate-50/80 px-4 py-3 dark:border-slate-800 dark:bg-slate-950/50">
					<div class="flex items-center gap-2 text-slate-600 dark:text-slate-300">
						<AlertTriangle class="h-4 w-4" />
						<span class="text-sm font-medium">Reintentos con fricción</span>
					</div>
					<p class="mt-2 text-sm text-slate-700 dark:text-slate-200">
						{data.detail.summary.totalCheckRetryBlocks} bloques con reintentos
					</p>
				</div>
			</div>
		</section>

		<section class="rounded-[30px] border border-slate-200/80 bg-white/92 p-5 shadow-sm dark:border-slate-800 dark:bg-slate-900/88">
			<div class="flex flex-wrap items-center justify-between gap-3">
				<div>
					<h2 class="text-lg font-semibold text-slate-900 dark:text-white">Historial de intentos</h2>
					<p class="mt-1 text-sm text-slate-500 dark:text-slate-400">
						Ordenado por recencia. Cada tarjeta enlaza al detalle cronológico de la sesión.
					</p>
				</div>
				<a
					href={resolve(`/course/${page.params.cid}/admin/interactives/${page.params.ilid}/lesson-review`)}
					class="inline-flex items-center gap-2 rounded-2xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-medium text-slate-700 transition-colors hover:border-amber-300 hover:text-amber-700 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200 dark:hover:border-amber-700 dark:hover:text-amber-200"
				>
					<Eye class="h-4 w-4" />
					Ir a revisión avanzada
				</a>
			</div>

			<div class="mt-5 space-y-4">
				{#each data.detail.attempts as attempt (attempt.sessionId)}
					<article class="rounded-[26px] border border-slate-200/80 bg-slate-50/80 p-4 dark:border-slate-800 dark:bg-slate-950/50">
						<div class="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
							<div class="min-w-0 flex-1">
								<div class="flex flex-wrap items-center gap-2">
									<Badge color={statusClasses(attempt)}>{statusLabel(attempt)}</Badge>
									<span class="text-sm font-semibold text-slate-900 dark:text-white">
										Intento #{attempt.attemptNumber}
									</span>
									<span class="text-sm text-slate-500 dark:text-slate-400">
										{formatDate(attempt.lastActiveAt)}
									</span>
								</div>

								<div class="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
									<div class="rounded-2xl bg-white/90 px-4 py-3 dark:bg-slate-900/70">
										<p class="text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-500 dark:text-slate-400">Recorrido</p>
										<p class="mt-1 text-sm font-medium text-slate-900 dark:text-slate-100">
											{attempt.visitedBlocksCount}/{attempt.totalBlocks} bloques
										</p>
									</div>
									<div class="rounded-2xl bg-white/90 px-4 py-3 dark:bg-slate-900/70">
										<p class="text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-500 dark:text-slate-400">Checks</p>
										<p class="mt-1 text-sm font-medium text-slate-900 dark:text-slate-100">
											{attempt.checksPassed} superados · {attempt.checksPending} pendientes
										</p>
									</div>
									<div class="rounded-2xl bg-white/90 px-4 py-3 dark:bg-slate-900/70">
										<p class="text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-500 dark:text-slate-400">Fricción</p>
										<p class="mt-1 text-sm font-medium text-slate-900 dark:text-slate-100">
											{attempt.checkRetryBlocks} reintentos · {attempt.revisitedBlocks} revisitas
										</p>
									</div>
									<div class="rounded-2xl bg-white/90 px-4 py-3 dark:bg-slate-900/70">
										<p class="text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-500 dark:text-slate-400">Ramas</p>
										<p class="mt-1 text-sm font-medium text-slate-900 dark:text-slate-100">
											{attempt.branchCount}
										</p>
									</div>
								</div>

								<div class="mt-4 flex flex-wrap gap-2 text-sm text-slate-500 dark:text-slate-400">
									<span class="inline-flex items-center gap-1">
										<Clock3 class="h-4 w-4" />
										Inicio: {formatDate(attempt.startedAt)}
									</span>
									<span class="inline-flex items-center gap-1">
										<CheckCircle2 class="h-4 w-4" />
										Cierre: {attempt.completedAt ? formatDate(attempt.completedAt) : 'Todavía abierto'}
									</span>
									<span class="inline-flex items-center gap-1">
										<Route class="h-4 w-4" />
										Bloque actual: {attempt.currentBlockTitle}
									</span>
								</div>

								{#if attempt.alerts.length > 0}
									<div class="mt-4 flex flex-wrap gap-2">
										{#each attempt.alerts as alert (alert.kind)}
											<span class="inline-flex items-center gap-1 rounded-full border border-rose-200 bg-rose-50 px-3 py-1.5 text-xs font-medium text-rose-700 dark:border-rose-900/60 dark:bg-rose-950/25 dark:text-rose-300">
												<AlertTriangle class="h-3.5 w-3.5" />
												{alert.label}
											</span>
										{/each}
									</div>
								{/if}
							</div>

							<div class="flex flex-col gap-3 xl:items-end">
								<a
									href={resolve(`/course/${page.params.cid}/admin/interactives/${page.params.ilid}/lesson-review/${attempt.sessionId}`)}
									class="inline-flex items-center justify-center gap-2 rounded-2xl bg-slate-900 px-4 py-2.5 text-sm font-medium text-white transition-colors hover:bg-slate-700 dark:bg-white dark:text-slate-900 dark:hover:bg-slate-200"
								>
									<Eye class="h-4 w-4" />
									Ver sesión
								</a>
								<div class="inline-flex items-center gap-2 rounded-2xl border border-slate-200 bg-white px-4 py-2.5 text-sm text-slate-600 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300">
									<GitBranch class="h-4 w-4" />
									{attempt.branchCount} ramas
								</div>
							</div>
						</div>
					</article>
				{:else}
					<div class="rounded-[26px] border border-dashed border-slate-300 bg-slate-50/80 px-6 py-10 text-center dark:border-slate-700 dark:bg-slate-950/40">
						<p class="text-base font-medium text-slate-900 dark:text-white">
							Este alumno aún no ha iniciado intentos de la lesson.
						</p>
						<p class="mt-2 text-sm text-slate-500 dark:text-slate-400">
							Cuando empiece la actividad, aquí aparecerá el historial completo con acceso a cada sesión.
						</p>
					</div>
				{/each}
			</div>
		</section>
	</div>
</div>
