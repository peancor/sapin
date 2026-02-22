<script lang="ts">
	import type { PageData } from './$types';
	import { Activity, BookOpen, Calendar, Clock } from 'lucide-svelte';
	import EChart from '$lib/components/charts/EChart.svelte';
	import { onMount, onDestroy } from 'svelte';

	let { data }: { data: PageData } = $props();
	let isDark = $state(false);
	let themeObserver: MutationObserver | null = null;

	onMount(() => {
		isDark = document.documentElement.classList.contains('dark');
		themeObserver = new MutationObserver(() => {
			isDark = document.documentElement.classList.contains('dark');
		});
		themeObserver.observe(document.documentElement, { attributes: true, attributeFilter: ['class'] });
	});

	onDestroy(() => {
		themeObserver?.disconnect();
	});

	function formatDate(date: number | Date | undefined | null) {
		if (!date) return 'Never';
		const dateObj = date instanceof Date ? date : new Date(date);
		return dateObj.toLocaleDateString(undefined, {
			year: 'numeric',
			month: 'long',
			day: 'numeric',
			hour: '2-digit',
			minute: '2-digit'
		});
	}

	// function getActivityStatus(activityId: string) {
	// 	const progress = data.progress.find((p) => p.activityId === activityId);
	// 	return progress ? 'Completed' : 'Pending';
	// }

	// function getActivityClass(activityId: string) {
	// 	return getActivityStatus(activityId) === 'Completed'
	// 		? 'text-green-600 dark:text-green-400'
	// 		: 'text-yellow-600 dark:text-yellow-400';
	// }

	function formatTime(seconds: number) {
		const hours = Math.floor(seconds / 3600);
		const minutes = Math.floor((seconds % 3600) / 60);
		if (hours > 0) {
			return `${hours}h ${minutes}m`;
		}
		return `${minutes}m`;
	}

	function getActivityProgress(activityId: string) {
		const progress = data.stats.activitiesDetail.find(
			(p) => p.activityId === activityId
		);
		if (!progress) return { status: 'not_started', timeSpentSeconds: 0 };
		return progress;
	}

	async function copyLoginLink(externalId: string) {
		const url = `${window.location.origin}/student/login-with-external-id/${externalId}`;
		await navigator.clipboard.writeText(url);
		alert('Link copiado al portapapeles');
	}

	const completedCount = $derived(
		data.stats.activitiesDetail.filter((activity) => activity.status === 'completed').length
	);
	const inProgressCount = $derived(
		data.stats.activitiesDetail.filter((activity) => activity.status === 'in_progress').length
	);
	const attemptedCount = $derived(
		data.stats.activitiesDetail.filter((activity) => activity.status !== 'not_started').length
	);
	const notStartedCount = $derived(Math.max(0, data.stats.totalActivities - attemptedCount));
	const avgTimePerAttempted = $derived(
		attemptedCount > 0 ? Math.round(data.stats.totalTimeSpent / attemptedCount) : 0
	);

	const statusDonutOptions = $derived({
		tooltip: {
			trigger: 'item',
			formatter: '{b}: {c} ({d}%)',
			backgroundColor: isDark ? '#1f2937' : '#fff',
			borderColor: isDark ? '#374151' : '#e5e7eb',
			textStyle: { color: isDark ? '#f3f4f6' : '#1f2937' }
		},
		legend: {
			bottom: 0,
			textStyle: { color: isDark ? '#9ca3af' : '#6b7280' }
		},
		series: [
			{
				type: 'pie',
				radius: ['45%', '70%'],
				avoidLabelOverlap: true,
				label: { show: false },
				labelLine: { show: false },
				data: [
					{ value: completedCount, name: 'Completadas', itemStyle: { color: '#10b981' } },
					{ value: inProgressCount, name: 'En progreso', itemStyle: { color: '#f59e0b' } },
					{ value: notStartedCount, name: 'Sin iniciar', itemStyle: { color: '#94a3b8' } }
				]
			}
		]
	});

	const timeByActivityOptions = $derived({
		tooltip: {
			trigger: 'axis',
			axisPointer: { type: 'shadow' },
			formatter: (params: Array<{ value: number; axisValue: string }>) => {
				const item = params[0];
				if (!item) return '';
				return `${item.axisValue}: ${formatTime(item.value * 60)}`;
			},
			backgroundColor: isDark ? '#1f2937' : '#fff',
			borderColor: isDark ? '#374151' : '#e5e7eb',
			textStyle: { color: isDark ? '#f3f4f6' : '#1f2937' }
		},
		grid: { left: 110, right: 20, top: 20, bottom: 20 },
		xAxis: {
			type: 'value',
			axisLabel: { color: isDark ? '#9ca3af' : '#6b7280', formatter: '{value}m' },
			splitLine: { lineStyle: { color: isDark ? '#374151' : '#e5e7eb' } }
		},
		yAxis: {
			type: 'category',
			axisLabel: { color: isDark ? '#9ca3af' : '#6b7280' },
			data: data.activities.map((activity) => activity.name)
		},
		series: [
			{
				type: 'bar',
				data: data.activities.map((activity) => {
					const progress = getActivityProgress(activity.id);
					return Math.round(progress.timeSpentSeconds / 60);
				}),
				itemStyle: { color: '#3b82f6', borderRadius: [0, 6, 6, 0] }
			}
		]
	});

	const eventsByDay = $derived.by(() => {
		const days = Array.from({ length: 30 }, (_, index) => {
			const offset = 29 - index;
			const key = new Date(Date.now() - offset * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
			return {
				date: key,
				started: 0,
				completed: 0,
				other: 0,
				total: 0
			};
		});

		const dayIndexByDate = Object.fromEntries(
			days.map((day, index) => [day.date, index])
		) as Record<string, number>;

		for (const event of data.recentEvents) {
			const key = new Date(event.eventAt).toISOString().slice(0, 10);
			const index = dayIndexByDate[key];
			if (index === undefined) continue;
			const current = days[index];
			current.total += 1;
			if (event.eventType === 'started') {
				current.started += 1;
			} else if (event.eventType === 'completed') {
				current.completed += 1;
			} else {
				current.other += 1;
			}
		}

		return days;
	});

	const recentEvents7d = $derived(
		eventsByDay.slice(-7).reduce((acc, day) => acc + day.total, 0)
	);

	const activityTrendOptions = $derived({
		tooltip: {
			trigger: 'axis',
			backgroundColor: isDark ? '#1f2937' : '#fff',
			borderColor: isDark ? '#374151' : '#e5e7eb',
			textStyle: { color: isDark ? '#f3f4f6' : '#1f2937' }
		},
		legend: {
			data: ['Started', 'Completed', 'Otros'],
			textStyle: { color: isDark ? '#9ca3af' : '#6b7280' }
		},
		grid: { left: '3%', right: '4%', bottom: '3%', containLabel: true },
		xAxis: {
			type: 'category',
			data: eventsByDay.map((item) => item.date),
			axisLabel: {
				color: isDark ? '#9ca3af' : '#6b7280',
				formatter: (value: string) => {
					const date = new Date(value);
					return date.toLocaleDateString('es-ES', { day: '2-digit', month: '2-digit' });
				}
			}
		},
		yAxis: {
			type: 'value',
			axisLabel: { color: isDark ? '#9ca3af' : '#6b7280' },
			splitLine: { lineStyle: { color: isDark ? '#374151' : '#e5e7eb' } }
		},
		series: [
			{
				name: 'Started',
				type: 'line',
				smooth: true,
				data: eventsByDay.map((item) => item.started),
				itemStyle: { color: '#3b82f6' }
			},
			{
				name: 'Completed',
				type: 'line',
				smooth: true,
				data: eventsByDay.map((item) => item.completed),
				itemStyle: { color: '#10b981' }
			},
			{
				name: 'Otros',
				type: 'line',
				smooth: true,
				data: eventsByDay.map((item) => item.other),
				itemStyle: { color: '#a855f7' }
			}
		]
	});
</script>

<div class="container mx-auto p-4">
	<!-- Student Header -->
	<div class="mb-6 rounded-lg bg-white p-6 shadow-sm dark:bg-gray-800">
		<div class="flex items-center gap-6">
			<img
				src={data.student.image || '/images/default_avatar.png'}
				alt={data.student.username}
				class="h-24 w-24 rounded-full border-4 border-purple-100 dark:border-purple-900 dark:bg-gray-200"
			/>
			<div>
				<h1 class="mb-2 text-2xl font-bold dark:text-white">
					{data.student.username}
					{#if data.student.alias}
						<span class="ml-2 text-lg text-gray-500 dark:text-gray-400">({data.student.alias})</span
						>
					{/if}
				</h1>
				<p class="text-gray-600 dark:text-gray-400">{data.student.email}</p>
				{#if data.student.externalId}
					<p class="text-sm text-gray-500 dark:text-gray-400">
						External ID:
						<button
							class="text-blue-500 underline hover:text-blue-700"
							onclick={() => copyLoginLink(data.student.externalId ?? '')}
						>
							{data.student.externalId}
						</button>
					</p>
				{/if}
			</div>
		</div>
	</div>

	<!-- Progress Stats -->
	<div class="mb-6 grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-6">
		<div class="rounded-lg bg-white p-4 shadow dark:bg-gray-800">
			<div class="flex items-center gap-3">
				<div class="rounded bg-purple-100 p-2 dark:bg-purple-900">
					<Activity class="h-5 w-5 text-purple-600 dark:text-purple-400" />
				</div>
				<div>
					<p class="text-sm text-gray-600 dark:text-gray-400">Completion</p>
					<p class="text-xl font-bold dark:text-white">{data.stats.completionRate}%</p>
				</div>
			</div>
		</div>

		<div class="rounded-lg bg-white p-4 shadow dark:bg-gray-800">
			<div class="flex items-center gap-3">
				<div class="rounded bg-blue-100 p-2 dark:bg-blue-900">
					<BookOpen class="h-5 w-5 text-blue-600 dark:text-blue-400" />
				</div>
				<div>
					<p class="text-sm text-gray-600 dark:text-gray-400">Activities</p>
					<p class="text-xl font-bold dark:text-white">
						{data.stats.completedActivities}/{data.stats.totalActivities}
					</p>
				</div>
			</div>
		</div>

		<div class="rounded-lg bg-white p-4 shadow dark:bg-gray-800">
			<div class="flex items-center gap-3">
				<div class="rounded bg-orange-100 p-2 dark:bg-orange-900">
					<Clock class="h-5 w-5 text-orange-600 dark:text-orange-400" />
				</div>
				<div>
					<p class="text-sm text-gray-600 dark:text-gray-400">Total Time</p>
					<p class="text-xl font-bold dark:text-white">
						{formatTime(data.stats.totalTimeSpent)}
					</p>
				</div>
			</div>
		</div>

		<div class="rounded-lg bg-white p-4 shadow dark:bg-gray-800">
			<div class="flex items-center gap-3">
				<div class="rounded bg-green-100 p-2 dark:bg-green-900">
					<Calendar class="h-5 w-5 text-green-600 dark:text-green-400" />
				</div>
				<div>
					<p class="text-sm text-gray-600 dark:text-gray-400">Last Access</p>
					<p class="text-xl font-bold dark:text-white">
						{formatDate(data.stats.lastActivityDate)}
					</p>
				</div>
			</div>
		</div>

		<div class="rounded-lg bg-white p-4 shadow dark:bg-gray-800">
			<div class="flex items-center gap-3">
				<div class="rounded bg-amber-100 p-2 dark:bg-amber-900">
					<Activity class="h-5 w-5 text-amber-600 dark:text-amber-400" />
				</div>
				<div>
					<p class="text-sm text-gray-600 dark:text-gray-400">En progreso</p>
					<p class="text-xl font-bold dark:text-white">{inProgressCount}</p>
				</div>
			</div>
		</div>

		<div class="rounded-lg bg-white p-4 shadow dark:bg-gray-800">
			<div class="flex items-center gap-3">
				<div class="rounded bg-slate-100 p-2 dark:bg-slate-900">
					<BookOpen class="h-5 w-5 text-slate-600 dark:text-slate-400" />
				</div>
				<div>
					<p class="text-sm text-gray-600 dark:text-gray-400">Sin iniciar</p>
					<p class="text-xl font-bold dark:text-white">{notStartedCount}</p>
				</div>
			</div>
		</div>

		<div class="rounded-lg bg-white p-4 shadow dark:bg-gray-800">
			<div class="flex items-center gap-3">
				<div class="rounded bg-blue-100 p-2 dark:bg-blue-900">
					<Clock class="h-5 w-5 text-blue-600 dark:text-blue-400" />
				</div>
				<div>
					<p class="text-sm text-gray-600 dark:text-gray-400">Media por intento</p>
					<p class="text-xl font-bold dark:text-white">{formatTime(avgTimePerAttempted)}</p>
				</div>
			</div>
		</div>

		<div class="rounded-lg bg-white p-4 shadow dark:bg-gray-800">
			<div class="flex items-center gap-3">
				<div class="rounded bg-indigo-100 p-2 dark:bg-indigo-900">
					<Activity class="h-5 w-5 text-indigo-600 dark:text-indigo-400" />
				</div>
				<div>
					<p class="text-sm text-gray-600 dark:text-gray-400">Eventos (7d)</p>
					<p class="text-xl font-bold dark:text-white">{recentEvents7d}</p>
				</div>
			</div>
		</div>
	</div>

	<div class="mb-6 grid grid-cols-1 gap-4 xl:grid-cols-2">
		<div class="rounded-lg bg-white p-4 shadow-sm dark:bg-gray-800">
			<h2 class="mb-3 text-lg font-semibold dark:text-white">Distribución de progreso</h2>
			<EChart options={statusDonutOptions} height="260px" theme={isDark ? 'dark' : 'light'} />
		</div>

		<div class="rounded-lg bg-white p-4 shadow-sm dark:bg-gray-800">
			<h2 class="mb-3 text-lg font-semibold dark:text-white">Tiempo por actividad</h2>
			<EChart options={timeByActivityOptions} height="260px" theme={isDark ? 'dark' : 'light'} />
		</div>

		<div class="rounded-lg bg-white p-4 shadow-sm dark:bg-gray-800 xl:col-span-2">
			<h2 class="mb-3 text-lg font-semibold dark:text-white">Actividad reciente (30 días)</h2>
			<EChart options={activityTrendOptions} height="280px" theme={isDark ? 'dark' : 'light'} />
		</div>
	</div>

	<!-- Activities Timeline -->
	<div class="rounded-lg bg-white shadow-sm dark:bg-gray-800">
		<div class="border-b border-gray-200 p-4 dark:border-gray-700">
			<h2 class="text-xl font-bold dark:text-white">Activity Progress</h2>
		</div>
		<div class="p-4">
			<div class="relative">
				{#each data.activities as activity, i (activity.id)}
					{@const progress = getActivityProgress(activity.id)}
					<div class="mb-8 flex gap-4">
						<div class="flex flex-col items-center">
							<div
								class={`flex h-8 w-8 items-center justify-center rounded-full ${
									progress.status === 'completed'
										? 'border-green-600 text-green-600 dark:text-green-400'
										: progress.status === 'in_progress'
											? 'border-yellow-600 text-yellow-600 dark:text-yellow-400'
											: 'border-gray-600 text-gray-600 dark:text-gray-400'
								} border-2`}
							>
								{i + 1}
							</div>
							{#if i < data.activities.length - 1}
								<div class="my-2 h-full w-0.5 bg-gray-200 dark:bg-gray-700"></div>
							{/if}
						</div>
						<div class="flex-1">
							<h3 class="font-medium dark:text-white">{activity.name}</h3>
							{#if activity.description}
								<p class="mt-1 text-gray-600 dark:text-gray-400">{activity.description}</p>
							{/if}
							<div class="mt-2 flex flex-wrap items-center gap-4">
								<span
									class={`text-sm font-medium ${
										progress.status === 'completed'
											? 'text-green-600 dark:text-green-400'
											: progress.status === 'in_progress'
												? 'text-yellow-600 dark:text-yellow-400'
												: 'text-gray-600 dark:text-gray-400'
									}`}
								>
									{progress.status === 'completed'
										? 'Completed'
										: progress.status === 'in_progress'
											? 'In Progress'
											: 'Not Started'}
								</span>
								{#if progress.timeSpentSeconds > 0}
									<span class="text-sm text-gray-500 dark:text-gray-400">
										Time spent: {formatTime(progress.timeSpentSeconds)}
									</span>
								{/if}
								<!-- {#if progress.attempts > 0}
                                    <span class="text-sm text-gray-500 dark:text-gray-400">
                                        Attempts: {progress.attempts}
                                    </span>
                                {/if}
                                {#if progress.score !== null}
                                    <span class="text-sm text-gray-500 dark:text-gray-400">
                                        Score: {progress.score}%
                                    </span>
                                {/if}
                                {#if progress.completedAt}
                                    <span class="text-sm text-gray-500 dark:text-gray-400">
                                        Completed on {formatDate(progress.completedAt)}
                                    </span>
                                {/if} -->
							</div>
						</div>
					</div>
				{/each}
			</div>
		</div>
	</div>
</div>
