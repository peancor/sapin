<script lang="ts">
	import { goto } from '$app/navigation';
	import { resolve } from '$app/paths';
	import { page } from '$app/state';
	import {
		AlertTriangle,
		ArrowLeft,
		Bot,
		CheckCircle2,
		ChevronDown,
		ChevronUp,
		Clock3,
		GitBranch,
		ListFilter,
		Search,
		Shield,
		Users
	} from 'lucide-svelte';
	import type { PageProps } from './$types';
	import type {
		LessonReviewAlertKind,
		LessonReviewAttemptSummary,
		LessonReviewStudentRow
	} from '$lib/types/lessonReview';
	import { formatDate } from '$lib/helpers/dateUtils';

	let { data }: PageProps = $props();

	const alertOptions: { value: LessonReviewAlertKind; label: string }[] = [
		{ value: 'checkpoint_blocked', label: 'Checkpoint bloqueado' },
		{ value: 'repeated_retry', label: 'Reintentos repetidos' },
		{ value: 'looping_path', label: 'Recorrido en bucle' },
		{ value: 'abandoned_attempt', label: 'Intento abandonado' },
		{ value: 'branch_complexity', label: 'Recorrido complejo' }
	];

	let searchTerm = $state(page.url.searchParams.get('search') ?? '');
	let statusFilter = $state(page.url.searchParams.get('status') ?? 'all');
	let alertFilter = $state(page.url.searchParams.get('alert') ?? 'all');
	let showStaffAttempts = $state(page.url.searchParams.get('staff') === '1');
	let expandedStudents = $state<Record<string, boolean>>({});

	const staffRows = $derived(data.students.filter((row) => row.student.audience === 'staff'));

	const filteredStudents = $derived.by(() => {
		const query = searchTerm.trim().toLowerCase();

		return data.students.filter((row) => {
			const matchesAudience =
				row.student.audience === 'student' || (showStaffAttempts && row.hasAnyActivity);

			const matchesSearch =
				query.length === 0 ||
				row.student.username.toLowerCase().includes(query) ||
				row.student.alias?.toLowerCase().includes(query) ||
				row.student.email?.toLowerCase().includes(query);

			const matchesStatus =
				statusFilter === 'all' ||
				row.latestAttempt?.reviewStatus === statusFilter;

			const matchesAlert =
				alertFilter === 'all' ||
				Boolean(row.latestAttempt?.alerts.some((alert) => alert.kind === alertFilter));

			return matchesAudience && matchesSearch && matchesStatus && matchesAlert;
		});
	});

	function roleBadgeClasses(row: LessonReviewStudentRow): string {
		if (row.student.audience === 'student') {
			return 'border-slate-200 bg-slate-50 text-slate-600 dark:border-slate-700 dark:bg-slate-800/80 dark:text-slate-300';
		}

		return 'border-sky-200 bg-sky-50 text-sky-700 dark:border-sky-900/60 dark:bg-sky-950/25 dark:text-sky-300';
	}

	function audienceLabel(row: LessonReviewStudentRow): string {
		return row.student.audience === 'student' ? 'Alumno' : `Staff · ${row.student.courseRole}`;
	}

	function syncFilters() {
		const params = new URLSearchParams(page.url.search);

		if (searchTerm.trim()) {
			params.set('search', searchTerm.trim());
		} else {
			params.delete('search');
		}

		if (statusFilter !== 'all') {
			params.set('status', statusFilter);
		} else {
			params.delete('status');
		}

		if (alertFilter !== 'all') {
			params.set('alert', alertFilter);
		} else {
			params.delete('alert');
		}

		if (showStaffAttempts) {
			params.set('staff', '1');
		} else {
			params.delete('staff');
		}

		const query = params.toString();
		goto(query ? `${page.url.pathname}?${query}` : page.url.pathname, {
			replaceState: true,
			noScroll: true,
			keepFocus: true
		});
	}

	function resetFilters() {
		searchTerm = '';
		statusFilter = 'all';
		alertFilter = 'all';
		showStaffAttempts = false;
		syncFilters();
	}

	function toggleHistory(studentId: string) {
		expandedStudents = {
			...expandedStudents,
			[studentId]: !expandedStudents[studentId]
		};
	}

	function statusLabel(attempt: LessonReviewAttemptSummary | null): string {
		if (!attempt) return 'Sin intentos';
		if (attempt.reviewStatus === 'completed') return 'Completado';
		if (attempt.reviewStatus === 'attention') return 'Con alertas';
		return 'Activo';
	}

	function statusClasses(attempt: LessonReviewAttemptSummary | null): string {
		if (!attempt) {
			return 'border-slate-200 bg-slate-50 text-slate-600 dark:border-slate-700 dark:bg-slate-800/80 dark:text-slate-300';
		}

		if (attempt.reviewStatus === 'completed') {
			return 'border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-900/60 dark:bg-emerald-950/25 dark:text-emerald-300';
		}

		if (attempt.reviewStatus === 'attention') {
			return 'border-rose-200 bg-rose-50 text-rose-700 dark:border-rose-900/60 dark:bg-rose-950/25 dark:text-rose-300';
		}

		return 'border-amber-200 bg-amber-50 text-amber-700 dark:border-amber-900/60 dark:bg-amber-950/25 dark:text-amber-300';
	}

	function revisionLabel(attempt: LessonReviewAttemptSummary | null): string {
		if (!attempt?.definitionRevisionNumber) return 'Revisión sin identificar';
		return `Rev ${attempt.definitionRevisionNumber}`;
	}

	function alertClasses(kind: LessonReviewAlertKind): string {
		if (kind === 'abandoned_attempt' || kind === 'checkpoint_blocked') {
			return 'border-rose-200 bg-rose-50 text-rose-700 dark:border-rose-900/60 dark:bg-rose-950/25 dark:text-rose-300';
		}

		if (kind === 'branch_complexity') {
			return 'border-sky-200 bg-sky-50 text-sky-700 dark:border-sky-900/60 dark:bg-sky-950/25 dark:text-sky-300';
		}

		return 'border-amber-200 bg-amber-50 text-amber-700 dark:border-amber-900/60 dark:bg-amber-950/25 dark:text-amber-300';
	}
</script>

<div class="min-h-screen bg-[radial-gradient(circle_at_top_left,_rgba(245,158,11,0.09),_transparent_24%),radial-gradient(circle_at_top_right,_rgba(56,189,248,0.08),_transparent_22%),linear-gradient(180deg,_#fffaf0_0%,_#f8fafc_100%)] dark:bg-[radial-gradient(circle_at_top_left,_rgba(245,158,11,0.08),_transparent_24%),radial-gradient(circle_at_top_right,_rgba(56,189,248,0.06),_transparent_22%),linear-gradient(180deg,_#020617_0%,_#111827_100%)]">
	<div class="sticky top-0 z-20 border-b border-white/70 bg-white/85 backdrop-blur-xl dark:border-slate-800 dark:bg-slate-950/85">
		<div class="mx-auto flex max-w-7xl items-center gap-4 px-4 py-4 sm:px-6">
			<a
				href={resolve(`/course/${page.params.cid}/admin/interactives/${page.params.ilid}`)}
				class="inline-flex h-10 w-10 items-center justify-center rounded-2xl border border-slate-200 bg-white text-slate-600 transition-colors hover:border-amber-300 hover:text-amber-700 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300 dark:hover:border-amber-700 dark:hover:text-amber-200"
				aria-label="Volver a la actividad"
			>
				<ArrowLeft class="h-4 w-4" />
			</a>

			<div class="min-w-0 flex-1">
				<p class="text-[11px] font-semibold uppercase tracking-[0.24em] text-amber-700 dark:text-amber-300">
					Revisión pedagógica
				</p>
				<h1 class="truncate text-lg font-semibold text-slate-900 dark:text-white sm:text-xl">
					{data.activity.name}
				</h1>
			</div>
		</div>
	</div>

	<div class="mx-auto max-w-7xl space-y-6 px-4 py-6 sm:px-6">
		<section class="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
			<div class="rounded-[28px] border border-slate-200/80 bg-white/92 p-5 shadow-sm dark:border-slate-800 dark:bg-slate-900/88">
				<p class="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500 dark:text-slate-400">
					Estudiantes
				</p>
				<div class="mt-3 flex items-center gap-3">
					<div class="rounded-2xl bg-amber-100 p-3 text-amber-700 dark:bg-amber-950/40 dark:text-amber-300">
						<Users class="h-5 w-5" />
					</div>
					<div>
						<p class="text-2xl font-semibold text-slate-900 dark:text-white">
							{data.summary.totalStudents}
						</p>
						<p class="text-sm text-slate-500 dark:text-slate-400">cohorte total</p>
					</div>
				</div>
			</div>

			<div class="rounded-[28px] border border-slate-200/80 bg-white/92 p-5 shadow-sm dark:border-slate-800 dark:bg-slate-900/88">
				<p class="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500 dark:text-slate-400">
					Con intentos
				</p>
				<div class="mt-3 flex items-center gap-3">
					<div class="rounded-2xl bg-sky-100 p-3 text-sky-700 dark:bg-sky-950/40 dark:text-sky-300">
						<Clock3 class="h-5 w-5" />
					</div>
					<div>
						<p class="text-2xl font-semibold text-slate-900 dark:text-white">
							{data.summary.studentsWithAttempts}
						</p>
						<p class="text-sm text-slate-500 dark:text-slate-400">último intento visible</p>
					</div>
				</div>
			</div>

			<div class="rounded-[28px] border border-slate-200/80 bg-white/92 p-5 shadow-sm dark:border-slate-800 dark:bg-slate-900/88">
				<p class="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500 dark:text-slate-400">
					Completados
				</p>
				<div class="mt-3 flex items-center gap-3">
					<div class="rounded-2xl bg-emerald-100 p-3 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300">
						<CheckCircle2 class="h-5 w-5" />
					</div>
					<div>
						<p class="text-2xl font-semibold text-slate-900 dark:text-white">
							{data.summary.studentsCompleted}
						</p>
						<p class="text-sm text-slate-500 dark:text-slate-400">último intento cerrado</p>
					</div>
				</div>
			</div>

			<div class="rounded-[28px] border border-slate-200/80 bg-white/92 p-5 shadow-sm dark:border-slate-800 dark:bg-slate-900/88">
				<p class="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500 dark:text-slate-400">
					Con alertas
				</p>
				<div class="mt-3 flex items-center gap-3">
					<div class="rounded-2xl bg-rose-100 p-3 text-rose-700 dark:bg-rose-950/40 dark:text-rose-300">
						<AlertTriangle class="h-5 w-5" />
					</div>
					<div>
						<p class="text-2xl font-semibold text-slate-900 dark:text-white">
							{data.summary.studentsWithAlerts}
						</p>
						<p class="text-sm text-slate-500 dark:text-slate-400">fricción pedagógica</p>
					</div>
				</div>
			</div>
		</section>

		<section class="rounded-[30px] border border-slate-200/80 bg-white/92 p-5 shadow-sm dark:border-slate-800 dark:bg-slate-900/88">
			<div class="flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between">
				<label class="relative block flex-1">
					<input
						bind:value={searchTerm}
						type="search"
						placeholder="Buscar por estudiante, alias o email..."
						class="h-12 w-full rounded-2xl border border-slate-200 bg-slate-50 pl-12 pr-4 text-sm text-slate-900 outline-none transition focus:border-amber-400 focus:bg-white dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100 dark:focus:border-amber-700"
						onchange={syncFilters}
					/>
					<Search class="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
				</label>

				<div class="flex flex-wrap gap-2">
					<label class="inline-flex items-center gap-2 rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-700 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200">
						<ListFilter class="h-4 w-4" />
						<select bind:value={statusFilter} class="bg-transparent outline-none" onchange={syncFilters}>
							<option value="all">Todos los estados</option>
							<option value="completed">Completados</option>
							<option value="active">Activos</option>
							<option value="attention">Con alertas</option>
						</select>
					</label>

					<label class="inline-flex items-center gap-2 rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-700 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200">
						<AlertTriangle class="h-4 w-4" />
						<select bind:value={alertFilter} class="bg-transparent outline-none" onchange={syncFilters}>
							<option value="all">Todas las alertas</option>
							{#each alertOptions as option (option.value)}
								<option value={option.value}>{option.label}</option>
							{/each}
						</select>
					</label>

					<label class="inline-flex items-center gap-3 rounded-2xl border border-sky-200 bg-sky-50 px-4 py-3 text-sm text-sky-800 dark:border-sky-900/60 dark:bg-sky-950/25 dark:text-sky-200">
						<input
							bind:checked={showStaffAttempts}
							type="checkbox"
							class="h-4 w-4 rounded border-sky-300 text-sky-600 focus:ring-sky-500 dark:border-sky-700 dark:bg-slate-900"
							onchange={syncFilters}
						/>
						<span class="inline-flex items-center gap-2">
							<Shield class="h-4 w-4" />
							Mostrar intentos del staff
						</span>
					</label>

					<button
						type="button"
						onclick={resetFilters}
						class="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm font-medium text-rose-700 transition-colors hover:bg-rose-100 dark:border-rose-900/60 dark:bg-rose-950/25 dark:text-rose-300 dark:hover:bg-rose-950/35"
					>
						Restablecer
					</button>
				</div>
			</div>

			{#if showStaffAttempts}
				<p class="mt-4 text-sm text-sky-700 dark:text-sky-300">
					Los intentos del staff se muestran solo para depuración y no alteran las métricas pedagógicas superiores.
					{#if staffRows.length > 0}
						<span class="font-medium"> Staff con actividad detectado: {staffRows.filter((row) => row.hasAnyActivity).length}.</span>
					{/if}
				</p>
			{/if}
		</section>

		<section class="space-y-4">
			{#if filteredStudents.length === 0}
				<div class="rounded-[30px] border border-slate-200/80 bg-white/92 px-6 py-16 text-center shadow-sm dark:border-slate-800 dark:bg-slate-900/88">
					<h2 class="text-lg font-semibold text-slate-900 dark:text-white">
						No hay participantes que coincidan con los filtros
					</h2>
					<p class="mt-2 text-sm text-slate-600 dark:text-slate-300">
						Ajusta la búsqueda o limpia los filtros para volver a ver la cohorte completa.
					</p>
				</div>
			{:else}
				{#each filteredStudents as row (row.student.id)}
					<article class="rounded-[32px] border border-slate-200/80 bg-white/95 p-5 shadow-sm dark:border-slate-800 dark:bg-slate-900/90">
						<div class="flex flex-col gap-5 xl:flex-row xl:items-start xl:justify-between">
							<div class="min-w-0 flex-1">
								<div class="flex flex-wrap items-center gap-2">
									<h2 class="text-lg font-semibold text-slate-900 dark:text-white">
										{row.student.username}
									</h2>
									{#if row.student.alias}
										<span class="text-sm italic text-slate-500 dark:text-slate-400">
											({row.student.alias})
										</span>
									{/if}
									<span class={`rounded-full border px-2.5 py-1 text-[11px] font-semibold uppercase tracking-[0.16em] ${statusClasses(row.latestAttempt)}`}>
										{statusLabel(row.latestAttempt)}
									</span>
									<span class={`rounded-full border px-2.5 py-1 text-[11px] font-semibold uppercase tracking-[0.16em] ${roleBadgeClasses(row)}`}>
										{audienceLabel(row)}
									</span>
								</div>

								{#if row.student.email}
									<p class="mt-2 text-sm text-slate-600 dark:text-slate-300">{row.student.email}</p>
								{/if}

								{#if row.latestAttempt}
									<div class="mt-3 flex flex-wrap gap-2">
										<span class="rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-xs font-medium text-slate-700 dark:border-slate-700 dark:bg-slate-800/70 dark:text-slate-200">
											{revisionLabel(row.latestAttempt)}
										</span>
										{#if row.latestAttempt.isHistoricalApproximation}
											<span class="rounded-full border border-amber-200 bg-amber-50 px-3 py-1 text-xs font-medium text-amber-800 dark:border-amber-900/60 dark:bg-amber-950/25 dark:text-amber-200">
												Histórico aproximado
											</span>
										{/if}
									</div>
									<div class="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
										<div class="rounded-2xl bg-slate-100/90 px-4 py-3 dark:bg-slate-800/80">
											<p class="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500 dark:text-slate-400">Intento</p>
											<p class="mt-1 text-base font-semibold text-slate-900 dark:text-white">
												#{row.latestAttempt.attemptNumber}
											</p>
										</div>
										<div class="rounded-2xl bg-slate-100/90 px-4 py-3 dark:bg-slate-800/80">
											<p class="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500 dark:text-slate-400">Última actividad</p>
											<p class="mt-1 text-sm font-semibold text-slate-900 dark:text-white">
												{formatDate(row.latestAttempt.lastActiveAt)}
											</p>
										</div>
										<div class="rounded-2xl bg-slate-100/90 px-4 py-3 dark:bg-slate-800/80">
											<p class="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500 dark:text-slate-400">Recorrido</p>
											<p class="mt-1 text-sm font-semibold text-slate-900 dark:text-white">
												{row.latestAttempt.visitedBlocksCount}/{row.latestAttempt.totalBlocks} bloques
											</p>
										</div>
										<div class="rounded-2xl bg-slate-100/90 px-4 py-3 dark:bg-slate-800/80">
											<p class="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500 dark:text-slate-400">Checks</p>
											<p class="mt-1 text-sm font-semibold text-slate-900 dark:text-white">
												{row.latestAttempt.checksPassed} superados · {row.latestAttempt.checksPending} pendientes
											</p>
										</div>
										<div class="rounded-2xl bg-slate-100/90 px-4 py-3 dark:bg-slate-800/80">
											<p class="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500 dark:text-slate-400">Fricción</p>
											<p class="mt-1 text-sm font-semibold text-slate-900 dark:text-white">
												{row.latestAttempt.checkRetryBlocks} reintentos · {row.latestAttempt.revisitedBlocks} revisitas
											</p>
										</div>
									</div>

									<div class="mt-4 flex flex-wrap gap-2">
										<span class="inline-flex items-center gap-1 rounded-full border border-slate-200 bg-slate-50 px-3 py-1.5 text-xs font-medium text-slate-700 dark:border-slate-700 dark:bg-slate-800/70 dark:text-slate-300">
											<GitBranch class="h-3.5 w-3.5" />
											{row.latestAttempt.branchCount} ramas tomadas
										</span>
										{#if row.latestAttempt.hasAgentBlocks}
											<span class="inline-flex items-center gap-1 rounded-full border border-sky-200 bg-sky-50 px-3 py-1.5 text-xs font-medium text-sky-700 dark:border-sky-900/60 dark:bg-sky-950/25 dark:text-sky-300">
												<Bot class="h-3.5 w-3.5" />
												Con bloques IA
											</span>
										{/if}
										{#each row.latestAttempt.alerts as alert (alert.kind)}
											<span class={`inline-flex items-center gap-1 rounded-full border px-3 py-1.5 text-xs font-medium ${alertClasses(alert.kind)}`}>
												<AlertTriangle class="h-3.5 w-3.5" />
												{alert.label}
											</span>
										{/each}
									</div>

									<p class="mt-4 text-sm text-slate-600 dark:text-slate-300">
										Bloque actual: <span class="font-medium text-slate-900 dark:text-white">{row.latestAttempt.currentBlockTitle}</span>
										<span class="text-slate-500 dark:text-slate-400"> · {row.latestAttempt.currentBlockKind}</span>
									</p>
								{:else}
									<p class="mt-4 text-sm text-slate-600 dark:text-slate-300">
										Este alumno aún no ha iniciado ningún intento de la lesson.
									</p>
								{/if}
							</div>

							<div class="flex flex-col gap-3 xl:items-end">
								{#if row.latestAttempt}
									<a
										href={resolve(`/course/${page.params.cid}/admin/interactives/${page.params.ilid}/lesson-review/${row.latestAttempt.sessionId}`)}
										class="inline-flex items-center justify-center rounded-2xl bg-slate-900 px-4 py-2.5 text-sm font-medium text-white transition-colors hover:bg-slate-700 dark:bg-white dark:text-slate-900 dark:hover:bg-slate-200"
									>
										Ver intento
									</a>
								{/if}

								{#if row.previousAttempts.length > 0}
									<button
										type="button"
										onclick={() => toggleHistory(row.student.id)}
										class="inline-flex items-center gap-2 rounded-2xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-medium text-slate-700 transition-colors hover:border-amber-300 hover:text-amber-700 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200 dark:hover:border-amber-700 dark:hover:text-amber-200"
									>
										Historial ({row.previousAttempts.length})
										{#if expandedStudents[row.student.id]}
											<ChevronUp class="h-4 w-4" />
										{:else}
											<ChevronDown class="h-4 w-4" />
										{/if}
									</button>
								{/if}
							</div>
						</div>

						{#if expandedStudents[row.student.id] && row.previousAttempts.length > 0}
							<div class="mt-5 space-y-3 border-t border-slate-200/80 pt-5 dark:border-slate-800">
								<p class="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500 dark:text-slate-400">
									Intentos anteriores
								</p>
								{#each row.previousAttempts as attempt (attempt.sessionId)}
									<div class="flex flex-col gap-3 rounded-[24px] border border-slate-200/80 bg-slate-50/80 px-4 py-4 dark:border-slate-800 dark:bg-slate-950/50 sm:flex-row sm:items-center sm:justify-between">
										<div class="flex flex-wrap items-center gap-2">
											<span class={`rounded-full border px-2.5 py-1 text-[11px] font-semibold uppercase tracking-[0.16em] ${statusClasses(attempt)}`}>
												{statusLabel(attempt)}
											</span>
											<span class="text-sm font-medium text-slate-900 dark:text-white">
												Intento #{attempt.attemptNumber}
											</span>
											<span class="text-sm text-slate-500 dark:text-slate-400">
												{formatDate(attempt.lastActiveAt)}
											</span>
										</div>

										<a
											href={resolve(`/course/${page.params.cid}/admin/interactives/${page.params.ilid}/lesson-review/${attempt.sessionId}`)}
											class="inline-flex items-center justify-center rounded-2xl border border-slate-200 bg-white px-4 py-2 text-sm font-medium text-slate-700 transition-colors hover:border-amber-300 hover:text-amber-700 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200 dark:hover:border-amber-700 dark:hover:text-amber-200"
										>
											Abrir detalle
										</a>
									</div>
								{/each}
							</div>
						{/if}
					</article>
				{/each}
			{/if}
		</section>
	</div>
</div>
