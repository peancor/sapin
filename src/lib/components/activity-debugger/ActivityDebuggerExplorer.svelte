<script lang="ts">
	import type {
		ActivityDebuggerActivitySummary,
		ActivityDebuggerCourseOption,
		ActivityDebuggerFilters
	} from '$lib/types/activityDebugger';
	import { resolve } from '$app/paths';
	import { Activity, AlertTriangle, ArrowRight, Brain, Bug, CalendarRange, Cpu, Search, Wrench } from 'lucide-svelte';

	interface Props {
		title: string;
		subtitle: string;
		activities: ActivityDebuggerActivitySummary[];
		courses: ActivityDebuggerCourseOption[];
		filters: ActivityDebuggerFilters;
		lockedCourse?: ActivityDebuggerCourseOption | null;
	}

	let { title, subtitle, activities, courses, filters, lockedCourse = null }: Props = $props();

	function formatDate(value: string | null): string {
		if (!value) return 'Sin actividad';
		return new Date(value).toLocaleString('es-ES', {
			day: '2-digit',
			month: '2-digit',
			year: 'numeric',
			hour: '2-digit',
			minute: '2-digit'
		});
	}

	function formatCurrency(value: number): string {
		return new Intl.NumberFormat('es-ES', {
			style: 'currency',
			currency: 'USD',
			maximumFractionDigits: value < 1 ? 4 : 2
		}).format(value);
	}

	function typeClasses(type: string): string {
		return type === 'agent'
			? 'border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-900/60 dark:bg-emerald-950/30 dark:text-emerald-300'
			: 'border-sky-200 bg-sky-50 text-sky-700 dark:border-sky-900/60 dark:bg-sky-950/30 dark:text-sky-300';
	}

	function clearHref(): string {
		return lockedCourse?.id
			? resolve(`/admin/activity-debugger/courses/${lockedCourse.id}`)
			: resolve('/admin/activity-debugger');
	}
</script>

<div class="space-y-6">
	<section class="overflow-hidden rounded-[2rem] border border-slate-200 bg-[radial-gradient(circle_at_top_left,_rgba(14,165,233,0.14),_transparent_25%),radial-gradient(circle_at_top_right,_rgba(16,185,129,0.12),_transparent_18%),linear-gradient(180deg,_#ffffff_0%,_#f8fafc_100%)] p-6 dark:border-slate-800 dark:bg-[radial-gradient(circle_at_top_left,_rgba(14,165,233,0.18),_transparent_25%),radial-gradient(circle_at_top_right,_rgba(16,185,129,0.12),_transparent_18%),linear-gradient(180deg,_#020617_0%,_#0f172a_100%)]">
		<div class="flex flex-col gap-4 xl:flex-row xl:items-end xl:justify-between">
			<div>
				<p class="text-[11px] font-semibold uppercase tracking-[0.26em] text-sky-700 dark:text-sky-300">
					Debug Console
				</p>
				<h1 class="mt-2 text-2xl font-black tracking-tight text-slate-900 dark:text-white sm:text-3xl">
					{title}
				</h1>
				<p class="mt-2 max-w-3xl text-sm text-slate-600 dark:text-slate-300">{subtitle}</p>
			</div>

			<div class="grid grid-cols-2 gap-3 sm:grid-cols-4">
				<div class="rounded-2xl border border-white/70 bg-white/80 px-4 py-3 dark:border-slate-800 dark:bg-slate-950/70">
					<p class="text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-500 dark:text-slate-400">Actividades</p>
					<p class="mt-2 text-2xl font-bold text-slate-900 dark:text-white">{activities.length}</p>
				</div>
				<div class="rounded-2xl border border-white/70 bg-white/80 px-4 py-3 dark:border-slate-800 dark:bg-slate-950/70">
					<p class="text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-500 dark:text-slate-400">Incidencias</p>
					<p class="mt-2 text-2xl font-bold text-rose-600 dark:text-rose-300">{activities.filter((activity) => activity.hasFailures || activity.hasToolFailures).length}</p>
				</div>
				<div class="rounded-2xl border border-white/70 bg-white/80 px-4 py-3 dark:border-slate-800 dark:bg-slate-950/70">
					<p class="text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-500 dark:text-slate-400">Pendientes</p>
					<p class="mt-2 text-2xl font-bold text-amber-600 dark:text-amber-300">{activities.filter((activity) => activity.hasPendingSessions).length}</p>
				</div>
				<div class="rounded-2xl border border-white/70 bg-white/80 px-4 py-3 dark:border-slate-800 dark:bg-slate-950/70">
					<p class="text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-500 dark:text-slate-400">Tokens</p>
					<p class="mt-2 text-2xl font-bold text-slate-900 dark:text-white">{activities.reduce((sum, activity) => sum + activity.totalTokens, 0).toLocaleString('es-ES')}</p>
				</div>
			</div>
		</div>
	</section>

	<section class="rounded-[2rem] border border-slate-200 bg-white p-6 dark:border-slate-800 dark:bg-slate-950/60">
		<form method="GET" class="space-y-5">
			<div class="grid gap-4 lg:grid-cols-[minmax(0,2fr)_repeat(4,minmax(0,1fr))]">
				<label class="flex items-center gap-3 rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 dark:border-slate-800 dark:bg-slate-900/70">
					<Search class="h-4 w-4 text-slate-400" />
					<input
						type="text"
						name="search"
						value={filters.search ?? ''}
						placeholder="Buscar actividad, curso, modelo o estado..."
						class="w-full bg-transparent text-sm text-slate-900 outline-hidden placeholder:text-slate-400 dark:text-white"
					/>
				</label>

				{#if !lockedCourse}
					<label class="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm dark:border-slate-800 dark:bg-slate-900/70">
						<span class="mb-1 block text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-500 dark:text-slate-400">Curso</span>
						<select name="courseId" class="w-full bg-transparent text-slate-900 outline-hidden dark:text-white">
							<option value="">Todos</option>
							{#each courses as course (course.id ?? course.name)}
								<option value={course.id ?? ''} selected={filters.courseId === (course.id ?? '')}>{course.name}</option>
							{/each}
						</select>
					</label>
				{:else}
					<div class="rounded-2xl border border-sky-200 bg-sky-50 px-4 py-3 text-sm text-sky-700 dark:border-sky-900/60 dark:bg-sky-950/30 dark:text-sky-200">
						<span class="mb-1 block text-[11px] font-semibold uppercase tracking-[0.16em]">Curso bloqueado</span>
						{lockedCourse.name}
					</div>
				{/if}

				<label class="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm dark:border-slate-800 dark:bg-slate-900/70">
					<span class="mb-1 block text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-500 dark:text-slate-400">Tipo</span>
					<select name="type" class="w-full bg-transparent text-slate-900 outline-hidden dark:text-white">
						<option value="all" selected={!filters.type || filters.type === 'all'}>Todos</option>
						<option value="chat" selected={filters.type === 'chat'}>Chat</option>
						<option value="agent" selected={filters.type === 'agent'}>Agent</option>
					</select>
				</label>

				<label class="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm dark:border-slate-800 dark:bg-slate-900/70">
					<span class="mb-1 block text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-500 dark:text-slate-400">Desde</span>
					<input type="date" name="dateFrom" value={filters.dateFrom ?? ''} class="w-full bg-transparent text-slate-900 outline-hidden dark:text-white" />
				</label>

				<label class="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm dark:border-slate-800 dark:bg-slate-900/70">
					<span class="mb-1 block text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-500 dark:text-slate-400">Hasta</span>
					<input type="date" name="dateTo" value={filters.dateTo ?? ''} class="w-full bg-transparent text-slate-900 outline-hidden dark:text-white" />
				</label>
			</div>

			<div class="flex flex-wrap items-center gap-3">
				<label class="inline-flex items-center gap-2 rounded-full border border-slate-200 px-3 py-2 text-sm text-slate-700 dark:border-slate-800 dark:text-slate-300">
					<input type="checkbox" name="onlyErrors" value="1" checked={filters.onlyErrors} />
					Solo errores IA
				</label>
				<label class="inline-flex items-center gap-2 rounded-full border border-slate-200 px-3 py-2 text-sm text-slate-700 dark:border-slate-800 dark:text-slate-300">
					<input type="checkbox" name="onlyToolFailures" value="1" checked={filters.onlyToolFailures} />
					Tools fallidas
				</label>
				<label class="inline-flex items-center gap-2 rounded-full border border-slate-200 px-3 py-2 text-sm text-slate-700 dark:border-slate-800 dark:text-slate-300">
					<input type="checkbox" name="onlyHighUsage" value="1" checked={filters.onlyHighUsage} />
					Uso alto
				</label>
				<label class="inline-flex items-center gap-2 rounded-full border border-slate-200 px-3 py-2 text-sm text-slate-700 dark:border-slate-800 dark:text-slate-300">
					<input type="checkbox" name="onlyPendingSessions" value="1" checked={filters.onlyPendingSessions} />
					Sesiones pendientes
				</label>

				<div class="ml-auto flex items-center gap-3">
					<a href={clearHref()} class="rounded-2xl border border-slate-200 px-4 py-2 text-sm font-medium text-slate-600 transition-colors hover:border-slate-300 hover:text-slate-900 dark:border-slate-800 dark:text-slate-300 dark:hover:text-white">
						Limpiar
					</a>
					<button type="submit" class="rounded-2xl bg-slate-900 px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-slate-700 dark:bg-sky-500 dark:text-slate-950 dark:hover:bg-sky-400">
						Aplicar filtros
					</button>
				</div>
			</div>
		</form>
	</section>

	<section class="overflow-hidden rounded-[2rem] border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-950/60">
		<div class="flex items-center justify-between border-b border-slate-200 px-6 py-4 dark:border-slate-800">
			<div>
				<p class="text-sm font-semibold text-slate-900 dark:text-white">Actividades depurables</p>
				<p class="text-xs text-slate-500 dark:text-slate-400">Listado global de actividades `chat` y `agent` con señales técnicas.</p>
			</div>
			<div class="text-xs text-slate-500 dark:text-slate-400">{activities.length} resultados</div>
		</div>

		{#if activities.length === 0}
			<div class="px-6 py-16 text-center">
				<Bug class="mx-auto h-10 w-10 text-slate-300 dark:text-slate-700" />
				<p class="mt-4 text-sm text-slate-500 dark:text-slate-400">No hay actividades que coincidan con los filtros actuales.</p>
			</div>
		{:else}
			<div class="overflow-x-auto">
				<table class="min-w-full divide-y divide-slate-200 dark:divide-slate-800">
					<thead class="bg-slate-50/80 dark:bg-slate-900/80">
						<tr class="text-left text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500 dark:text-slate-400">
							<th class="px-6 py-3">Actividad</th>
							<th class="px-6 py-3">Curso</th>
							<th class="px-6 py-3">Modelo</th>
							<th class="px-6 py-3">Sesiones</th>
							<th class="px-6 py-3">Tokens</th>
							<th class="px-6 py-3">Coste</th>
							<th class="px-6 py-3">Última actividad</th>
							<th class="px-6 py-3">Flags</th>
							<th class="px-6 py-3"></th>
						</tr>
					</thead>
					<tbody class="divide-y divide-slate-200 dark:divide-slate-800">
						{#each activities as activity (activity.activityId)}
							<tr class="align-top text-sm">
								<td class="px-6 py-4">
									<div class="flex items-start gap-3">
										<div class="mt-1 flex h-10 w-10 items-center justify-center rounded-2xl border border-slate-200 bg-slate-100 text-slate-600 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-300">
											{#if activity.activityType === 'agent'}
												<Brain class="h-4 w-4" />
											{:else}
												<Activity class="h-4 w-4" />
											{/if}
										</div>
										<div>
											<div class="flex flex-wrap items-center gap-2">
												<a href={resolve(`/admin/activity-debugger/activities/${activity.activityId}`)} class="font-semibold text-slate-900 transition-colors hover:text-sky-700 dark:text-white dark:hover:text-sky-300">
													{activity.activityName}
												</a>
												<span class={`rounded-full border px-2.5 py-1 text-[11px] font-semibold uppercase tracking-[0.14em] ${typeClasses(activity.activityType)}`}>
													{activity.activityType}
												</span>
											</div>
											<p class="mt-2 text-xs text-slate-500 dark:text-slate-400">ID: {activity.activityId}</p>
										</div>
									</div>
								</td>
								<td class="px-6 py-4 text-xs text-slate-600 dark:text-slate-300">
									{#if activity.courseId}
										<a href={resolve(`/admin/activity-debugger/courses/${activity.courseId}`)} class="font-medium text-slate-800 hover:text-sky-700 dark:text-slate-200 dark:hover:text-sky-300">
											{activity.courseName}
										</a>
									{:else}
										<span>Sistema / Sin curso</span>
									{/if}
								</td>
								<td class="px-6 py-4 text-xs text-slate-600 dark:text-slate-300">
									<div class="inline-flex items-center gap-2 rounded-full border border-slate-200 px-2.5 py-1 dark:border-slate-800">
										<Cpu class="h-3.5 w-3.5" />
										{activity.modelName || 'Sin modelo'}
									</div>
								</td>
								<td class="px-6 py-4">
									<p class="font-semibold text-slate-900 dark:text-white">{activity.sessionCount}</p>
									<p class="text-xs text-slate-500 dark:text-slate-400">{activity.totalMessages} mensajes</p>
								</td>
								<td class="px-6 py-4">
									<p class="font-semibold text-slate-900 dark:text-white">{activity.totalTokens.toLocaleString('es-ES')}</p>
									<p class="text-xs text-slate-500 dark:text-slate-400">{activity.totalInputTokens.toLocaleString('es-ES')} / {activity.totalOutputTokens.toLocaleString('es-ES')}</p>
								</td>
								<td class="px-6 py-4 text-sm font-semibold text-slate-900 dark:text-white">{formatCurrency(activity.totalEstimatedCost)}</td>
								<td class="px-6 py-4 text-xs text-slate-600 dark:text-slate-300">{formatDate(activity.lastActivityAt)}</td>
								<td class="px-6 py-4">
									<div class="flex flex-wrap gap-2">
										{#if activity.hasFailures}
											<span class="inline-flex items-center gap-1 rounded-full border border-rose-200 bg-rose-50 px-2.5 py-1 text-[11px] font-semibold uppercase tracking-[0.12em] text-rose-700 dark:border-rose-900/60 dark:bg-rose-950/30 dark:text-rose-300">
												<AlertTriangle class="h-3.5 w-3.5" />
												IA
											</span>
										{/if}
										{#if activity.hasToolFailures}
											<span class="inline-flex items-center gap-1 rounded-full border border-amber-200 bg-amber-50 px-2.5 py-1 text-[11px] font-semibold uppercase tracking-[0.12em] text-amber-700 dark:border-amber-900/60 dark:bg-amber-950/30 dark:text-amber-300">
												<Wrench class="h-3.5 w-3.5" />
												Tools
											</span>
										{/if}
										{#if activity.highUsage}
											<span class="inline-flex items-center gap-1 rounded-full border border-fuchsia-200 bg-fuchsia-50 px-2.5 py-1 text-[11px] font-semibold uppercase tracking-[0.12em] text-fuchsia-700 dark:border-fuchsia-900/60 dark:bg-fuchsia-950/30 dark:text-fuchsia-300">
												<Cpu class="h-3.5 w-3.5" />
												Alto uso
											</span>
										{/if}
										{#if activity.hasPendingSessions}
											<span class="inline-flex items-center gap-1 rounded-full border border-sky-200 bg-sky-50 px-2.5 py-1 text-[11px] font-semibold uppercase tracking-[0.12em] text-sky-700 dark:border-sky-900/60 dark:bg-sky-950/30 dark:text-sky-300">
												<CalendarRange class="h-3.5 w-3.5" />
												Pendientes
											</span>
										{/if}
									</div>
								</td>
								<td class="px-6 py-4 text-right">
									<a href={resolve(`/admin/activity-debugger/activities/${activity.activityId}`)} class="inline-flex items-center gap-2 rounded-2xl border border-slate-200 px-3 py-2 text-sm font-medium text-slate-700 transition-colors hover:border-sky-300 hover:text-sky-700 dark:border-slate-800 dark:text-slate-300 dark:hover:border-sky-800 dark:hover:text-sky-300">
										Abrir
										<ArrowRight class="h-4 w-4" />
									</a>
								</td>
							</tr>
						{/each}
					</tbody>
				</table>
			</div>
		{/if}
	</section>
</div>
