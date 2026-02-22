<script lang="ts">
	import type { PageData } from './$types';
	import { Badge } from 'flowbite-svelte';
	import EChart from '$lib/components/charts/EChart.svelte';
	import { goto } from '$app/navigation';
	import { onMount, onDestroy } from 'svelte';

	let { data }: { data: PageData } = $props();
	let isDark = $state(false);
	let themeObserver: MutationObserver | null = null;
	let calendarRangeDays = $state<30 | 90 | 180>(90);
	let stackedRangeDays = $state<14 | 30>(30);
	let studentHeatmapRangeDays = $state<14 | 28>(28);
	let studentHeatmapSortMode = $state<'activity_desc' | 'activity_asc' | 'name_asc' | 'name_desc'>(
		'activity_desc'
	);
	let studentHeatmapActivityFilter = $state<'all' | 'with_activity' | 'without_activity'>('all');
	let studentHeatmapSearch = $state('');
	let studentHeatmapRowsPerPage = $state<20 | 40 | 80>(20);
	let studentHeatmapPage = $state(1);
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

	function formatDuration(seconds: number): string {
		if (!seconds || seconds <= 0) return '0m';
		const hours = Math.floor(seconds / 3600);
		const minutes = Math.floor((seconds % 3600) / 60);
		if (hours > 0) return `${hours}h ${minutes}m`;
		return `${minutes}m`;
	}

	function formatDateTime(date: Date | string | null): string {
		if (!date) return 'Sin actividad';
		return new Date(date).toLocaleString('es-ES', {
			day: '2-digit',
			month: '2-digit',
			year: 'numeric',
			hour: '2-digit',
			minute: '2-digit'
		});
	}

	function getStudentDisplayName(student: PageData['analytics']['topStudents'][number]): string {
		return (
			student.displayName?.trim() ||
			student.alias?.trim() ||
			student.username?.trim() ||
			student.email?.trim() ||
			student.userId.slice(0, 8)
		);
	}

	function formatShortDate(date: string): string {
		const parsed = new Date(date);
		return parsed.toLocaleDateString('es-ES', { day: '2-digit', month: '2-digit' });
	}

	function escapeHtml(value: string): string {
		return value
			.replaceAll('&', '&amp;')
			.replaceAll('<', '&lt;')
			.replaceAll('>', '&gt;')
			.replaceAll('"', '&quot;')
			.replaceAll("'", '&#039;');
	}

	function getStudentFullName(student: (typeof heatmapStudents)[number]): string {
		return (
			student.displayName?.trim() ||
			student.alias?.trim() ||
			student.username?.trim() ||
			student.email?.trim() ||
			student.label
		);
	}

	function onStudentHeatmapClick(params: unknown): void {
		if (
			typeof params !== 'object' ||
			params === null ||
			!('componentType' in params) ||
			!('value' in params)
		) {
			return;
		}

		const event = params as { componentType?: string; value?: unknown };
		if (event.componentType !== 'yAxis' || typeof event.value !== 'string') {
			return;
		}

		const student = pagedHeatmapStudents.find((item) => item.label === event.value);
		if (!student) return;

		goto(`/course/${data.courseId}/admin/students/${student.userId}`);
	}

	function setCalendarRange(range: 30 | 90 | 180): void {
		calendarRangeDays = range;
	}

	function setStackedRange(range: 14 | 30): void {
		stackedRangeDays = range;
	}

	function setStudentHeatmapRange(range: 14 | 28): void {
		studentHeatmapRangeDays = range;
		studentHeatmapPage = 1;
	}

	const calendarHeatmapData = $derived(data.analytics.calendarHeatmap180d.slice(-calendarRangeDays));
	const stackedTrendData = $derived(data.analytics.stackedTrend30d.slice(-stackedRangeDays));
	const studentHeatmapDates = $derived(
		data.analytics.studentActivityHeatmap28d.dates.slice(-studentHeatmapRangeDays)
	);
	const heatmapStudents = $derived(data.analytics.studentActivityHeatmap28d.students);
	const studentHeatmapValues = $derived(
		data.analytics.studentActivityHeatmap28d.values
			.filter((value) => value[0] >= data.analytics.studentActivityHeatmap28d.dates.length - studentHeatmapRangeDays)
			.map((value) => [
				value[0] - (data.analytics.studentActivityHeatmap28d.dates.length - studentHeatmapRangeDays),
				value[1],
				value[2]
			] as [number, number, number])
	);
	const studentActivityTotalsByIndex = $derived.by(() => {
		const totals = Array.from({ length: heatmapStudents.length }, () => 0);
		for (const value of studentHeatmapValues) {
			totals[value[1]] += value[2];
		}
		return totals;
	});
	const filteredStudentIndexes = $derived.by(() => {
		const search = studentHeatmapSearch.trim().toLowerCase();
		const rows = heatmapStudents
			.map((student, index) => ({
				student,
				index,
				total: studentActivityTotalsByIndex[index] ?? 0
			}))
			.filter((entry) => {
				if (studentHeatmapActivityFilter === 'with_activity' && entry.total <= 0) return false;
				if (studentHeatmapActivityFilter === 'without_activity' && entry.total > 0) return false;
				if (!search) return true;
				const label = entry.student.label.toLowerCase();
				const email = entry.student.email?.toLowerCase() ?? '';
				return label.includes(search) || email.includes(search);
			});

		rows.sort((a, b) => {
			if (studentHeatmapSortMode === 'activity_desc') {
				if (b.total !== a.total) return b.total - a.total;
				return a.student.label.localeCompare(b.student.label, 'es');
			}
			if (studentHeatmapSortMode === 'activity_asc') {
				if (a.total !== b.total) return a.total - b.total;
				return a.student.label.localeCompare(b.student.label, 'es');
			}
			if (studentHeatmapSortMode === 'name_desc') {
				return b.student.label.localeCompare(a.student.label, 'es');
			}

			return a.student.label.localeCompare(b.student.label, 'es');
		});

		return rows.map((entry) => entry.index);
	});
	const filteredHeatmapStudents = $derived(filteredStudentIndexes.map((index) => heatmapStudents[index]));
	const filteredIndexByOriginalIndex = $derived.by(() => {
		const lookup = Array.from({ length: heatmapStudents.length }, () => -1);
		filteredStudentIndexes.forEach((originalIndex, filteredIndex) => {
			lookup[originalIndex] = filteredIndex;
		});
		return lookup;
	});
	const filteredStudentHeatmapValues = $derived(
		studentHeatmapValues
			.filter((value) => (filteredIndexByOriginalIndex[value[1]] ?? -1) >= 0)
			.map((value) => [value[0], filteredIndexByOriginalIndex[value[1]], value[2]] as [number, number, number])
	);
	const filteredStudentsCount = $derived(filteredHeatmapStudents.length);
	const studentHeatmapTotalPages = $derived(
		Math.max(1, Math.ceil(filteredStudentsCount / studentHeatmapRowsPerPage))
	);
	const studentHeatmapEffectivePage = $derived(
		Math.min(studentHeatmapTotalPages, Math.max(1, studentHeatmapPage))
	);
	const pagedStudentStartIndex = $derived((studentHeatmapEffectivePage - 1) * studentHeatmapRowsPerPage);
	const pagedStudentEndIndex = $derived(
		Math.min(filteredStudentsCount, pagedStudentStartIndex + studentHeatmapRowsPerPage)
	);
	const pagedDisplayStart = $derived(filteredStudentsCount === 0 ? 0 : pagedStudentStartIndex + 1);
	const pagedDisplayEnd = $derived(filteredStudentsCount === 0 ? 0 : pagedStudentEndIndex);
	const pagedHeatmapStudents = $derived(
		filteredHeatmapStudents.slice(pagedStudentStartIndex, pagedStudentEndIndex)
	);
	const pagedStudentHeatmapValues = $derived(
		filteredStudentHeatmapValues
			.filter(
				(value) => value[1] >= pagedStudentStartIndex && value[1] < pagedStudentEndIndex
			)
			.map((value) => [value[0], value[1] - pagedStudentStartIndex, value[2]] as [number, number, number])
	);
	const studentHeatmapMaxValue = $derived(
		Math.max(1, ...pagedStudentHeatmapValues.map((value) => value[2]))
	);
	const studentHeatmapChartHeight = $derived(
		`${Math.min(
			980,
			Math.max(360, pagedHeatmapStudents.length * 28 + 140)
		)}px`
	);

	const calendarHeatmapOptions = $derived({
		tooltip: {
			position: 'top',
			formatter: (params: { data: [string, number] }) =>
				`${formatShortDate(params.data[0])}: ${params.data[1]} eventos`,
			backgroundColor: isDark ? '#1f2937' : '#fff',
			borderColor: isDark ? '#374151' : '#e5e7eb',
			textStyle: { color: isDark ? '#f3f4f6' : '#1f2937' }
		},
		visualMap: {
			min: 0,
			max: Math.max(1, ...calendarHeatmapData.map((item) => item.value)),
			orient: 'horizontal',
			right: 12,
			top: 4,
			itemWidth: 14,
			itemHeight: 10,
			inRange: {
				color: isDark
					? ['#1f2937', '#1e3a8a', '#2563eb', '#60a5fa']
					: ['#ebedf0', '#9be9a8', '#40c463', '#216e39']
			},
			text: ['Más', 'Menos'],
			textStyle: { color: isDark ? '#9ca3af' : '#6b7280' }
		},
		calendar: {
			top: 40,
			left: 54,
			right: 16,
			cellSize: [16, 16],
			range: [calendarHeatmapData[0]?.date, calendarHeatmapData.at(-1)?.date],
			yearLabel: { show: false },
			splitLine: { show: false },
			itemStyle: {
				borderWidth: 2,
				borderColor: isDark ? '#0f172a' : '#ffffff'
			},
			dayLabel: {
				firstDay: 1,
				nameMap: ['D', 'L', 'M', 'X', 'J', 'V', 'S'],
				margin: 8,
				color: isDark ? '#9ca3af' : '#6b7280'
			},
			monthLabel: {
				margin: 10,
				color: isDark ? '#9ca3af' : '#6b7280'
			}
		},
		series: [
			{
				type: 'heatmap',
				coordinateSystem: 'calendar',
				data: calendarHeatmapData.map((item) => [item.date, item.value])
			}
		]
	});

	const stackedTrendOptions = $derived({
		tooltip: {
			trigger: 'axis',
			backgroundColor: isDark ? '#1f2937' : '#fff',
			borderColor: isDark ? '#374151' : '#e5e7eb',
			textStyle: { color: isDark ? '#f3f4f6' : '#1f2937' }
		},
		legend: {
			data: ['Started', 'Completed', 'Other'],
			textStyle: { color: isDark ? '#9ca3af' : '#6b7280' }
		},
		grid: { left: '3%', right: '4%', bottom: '3%', containLabel: true },
		xAxis: {
			type: 'category',
			boundaryGap: false,
			data: stackedTrendData.map((point) => formatShortDate(point.date)),
			axisLine: { lineStyle: { color: isDark ? '#4b5563' : '#d1d5db' } },
			axisLabel: { color: isDark ? '#9ca3af' : '#6b7280' }
		},
		yAxis: {
			type: 'value',
			axisLine: { lineStyle: { color: isDark ? '#4b5563' : '#d1d5db' } },
			axisLabel: { color: isDark ? '#9ca3af' : '#6b7280' },
			splitLine: { lineStyle: { color: isDark ? '#374151' : '#e5e7eb' } }
		},
		series: [
			{
				name: 'Started',
				type: 'line',
				stack: 'events',
				smooth: true,
				areaStyle: { opacity: 0.4 },
				data: stackedTrendData.map((point) => point.started),
				itemStyle: { color: '#3b82f6' }
			},
			{
				name: 'Completed',
				type: 'line',
				stack: 'events',
				smooth: true,
				areaStyle: { opacity: 0.4 },
				data: stackedTrendData.map((point) => point.completed),
				itemStyle: { color: '#10b981' }
			},
			{
				name: 'Other',
				type: 'line',
				stack: 'events',
				smooth: true,
				areaStyle: { opacity: 0.35 },
				data: stackedTrendData.map((point) => point.other),
				itemStyle: { color: '#a855f7' }
			}
		]
	});

	const studentHeatmapOptions = $derived({
		tooltip: {
			position: 'top',
			enterable: true,
			formatter: (params: { data: [number, number, number] }) => {
				const [dateIndex, studentIndex, value] = params.data;
				const student = pagedHeatmapStudents[studentIndex];
				const date = studentHeatmapDates[dateIndex] ?? '';
				if (!student) {
					return `${formatShortDate(date)}: ${value} eventos`;
				}

				const fullName = escapeHtml(getStudentFullName(student));
				const email = student.email ? escapeHtml(student.email) : 'Sin email';
				return `<div style="min-width:220px"><div style="font-weight:600;margin-bottom:2px">${fullName}</div><div style="font-size:12px;opacity:.85">${email}</div><div style="margin:6px 0">${formatShortDate(date)}: <strong>${value}</strong> eventos</div><div style="font-size:12px;opacity:.85">Completitud: ${student.completionRate}% · Completadas: ${student.completedActivities}</div></div>`;
			},
			backgroundColor: isDark ? '#1f2937' : '#fff',
			borderColor: isDark ? '#374151' : '#e5e7eb',
			textStyle: { color: isDark ? '#f3f4f6' : '#1f2937' }
		},
		grid: { top: 20, height: '72%', left: 130, right: 20 },
		xAxis: {
			type: 'category',
			data: studentHeatmapDates.map((date) => formatShortDate(date)),
			splitArea: { show: true },
			axisLabel: { color: isDark ? '#9ca3af' : '#6b7280' },
			axisLine: { lineStyle: { color: isDark ? '#4b5563' : '#d1d5db' } }
		},
		yAxis: {
			type: 'category',
			data: pagedHeatmapStudents.map((student) => student.label),
			triggerEvent: true,
			splitArea: { show: true },
			axisLabel: {
				color: isDark ? '#93c5fd' : '#1d4ed8',
				interval: 0,
				formatter: (value: string) => value
			},
			axisLine: { lineStyle: { color: isDark ? '#4b5563' : '#d1d5db' } }
		},
		visualMap: {
			min: 0,
			max: studentHeatmapMaxValue,
			calculable: true,
			orient: 'horizontal',
			left: 'center',
			bottom: 0,
			inRange: {
				color: isDark
					? ['#1f2937', '#0f766e', '#14b8a6', '#5eead4']
					: ['#ecfeff', '#99f6e4', '#2dd4bf', '#0f766e']
			},
			textStyle: { color: isDark ? '#9ca3af' : '#6b7280' }
		},
		series: [
			{
				name: 'Eventos',
				type: 'heatmap',
				data: pagedStudentHeatmapValues,
				label: { show: false },
				emphasis: { itemStyle: { shadowBlur: 10, shadowColor: 'rgba(0,0,0,0.35)' } }
			}
		]
	});

	const punchCardOptions = $derived({
		tooltip: {
			position: 'top',
			formatter: (params: { data: [number, number, number] }) => {
				const [hourIndex, dayIndex, value] = params.data;
				const day = data.analytics.punchCardHeatmap60d.weekdays[dayIndex] ?? 'N/A';
				const hour = data.analytics.punchCardHeatmap60d.hours[hourIndex] ?? '00';
				return `${day} ${hour}:00 · ${value} eventos`;
			},
			backgroundColor: isDark ? '#1f2937' : '#fff',
			borderColor: isDark ? '#374151' : '#e5e7eb',
			textStyle: { color: isDark ? '#f3f4f6' : '#1f2937' }
		},
		grid: { left: 60, right: 20, top: 20, bottom: 30 },
		xAxis: {
			type: 'category',
			data: data.analytics.punchCardHeatmap60d.hours,
			axisLabel: { color: isDark ? '#9ca3af' : '#6b7280', interval: 2 },
			axisLine: { lineStyle: { color: isDark ? '#4b5563' : '#d1d5db' } }
		},
		yAxis: {
			type: 'category',
			data: data.analytics.punchCardHeatmap60d.weekdays,
			axisLabel: { color: isDark ? '#9ca3af' : '#6b7280' },
			axisLine: { lineStyle: { color: isDark ? '#4b5563' : '#d1d5db' } }
		},
		series: [
			{
				type: 'scatter',
				data: data.analytics.punchCardHeatmap60d.values,
				symbolSize: (value: [number, number, number]) => {
					const count = value[2];
					if (count <= 0) return 4;
					const max = Math.max(1, data.analytics.punchCardHeatmap60d.maxValue);
					return Math.max(6, Math.round((count / max) * 26));
				},
				itemStyle: {
					color: '#3b82f6',
					opacity: 0.8
				}
			}
		]
	});
</script>

<div class="space-y-6">
	<div>
		<h1 class="text-2xl font-bold text-gray-900 dark:text-white">Learning analytics avanzado</h1>
		<p class="mt-1 text-sm text-gray-500 dark:text-gray-400">
			Análisis detallado del progreso, participación y rendimiento del curso
		</p>
	</div>

	<div class="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4">
		<div class="rounded-xl bg-white p-5 shadow-sm dark:bg-gray-800">
			<p class="text-sm text-gray-500 dark:text-gray-400">Participación</p>
			<p class="mt-1 text-2xl font-bold text-gray-900 dark:text-white">{data.analytics.participationRate}%</p>
			<p class="text-xs text-gray-500 dark:text-gray-400">{data.analytics.participants}/{data.analytics.totalStudents} estudiantes</p>
		</div>
		<div class="rounded-xl bg-white p-5 shadow-sm dark:bg-gray-800">
			<p class="text-sm text-gray-500 dark:text-gray-400">Completitud global</p>
			<p class="mt-1 text-2xl font-bold text-gray-900 dark:text-white">{data.analytics.overallCompletionRate}%</p>
			<p class="text-xs text-gray-500 dark:text-gray-400">{data.analytics.totalCompletedPairs} pares completados</p>
		</div>
		<div class="rounded-xl bg-white p-5 shadow-sm dark:bg-gray-800">
			<p class="text-sm text-gray-500 dark:text-gray-400">Media por estudiante</p>
			<p class="mt-1 text-2xl font-bold text-gray-900 dark:text-white">{data.analytics.avgCompletionRateByStudent}%</p>
			<p class="text-xs text-gray-500 dark:text-gray-400">Sobre summaries del curso</p>
		</div>
		<div class="rounded-xl bg-white p-5 shadow-sm dark:bg-gray-800">
			<p class="text-sm text-gray-500 dark:text-gray-400">Tiempo medio participante</p>
			<p class="mt-1 text-2xl font-bold text-gray-900 dark:text-white">{formatDuration(data.analytics.avgTimeSpentPerParticipantSeconds)}</p>
			<p class="text-xs text-gray-500 dark:text-gray-400">Última actividad: {formatDateTime(data.analytics.lastActivityAt)}</p>
		</div>
	</div>

	<div class="grid grid-cols-1 gap-6 xl:grid-cols-2">
		<div class="rounded-xl bg-white p-5 shadow-sm dark:bg-gray-800 xl:col-span-2">
			<div class="mb-3 flex flex-wrap items-center justify-between gap-3">
				<div>
					<h2 class="text-lg font-semibold text-gray-900 dark:text-white">Calendar heatmap · {calendarRangeDays}d</h2>
					<p class="text-sm text-gray-500 dark:text-gray-400">Constancia de actividad diaria del curso, estilo GitHub</p>
				</div>
				<div class="inline-flex rounded-lg border border-gray-200 p-1 dark:border-gray-700">
					<button
						type="button"
						aria-pressed={calendarRangeDays === 30}
						class="rounded-md px-2 py-1 text-xs font-medium {calendarRangeDays === 30
							? 'bg-blue-600 text-white'
							: 'text-gray-600 hover:bg-gray-100 dark:text-gray-300 dark:hover:bg-gray-700'}"
						onclick={() => setCalendarRange(30)}
					>
						30d
					</button>
					<button
						type="button"
						aria-pressed={calendarRangeDays === 90}
						class="rounded-md px-2 py-1 text-xs font-medium {calendarRangeDays === 90
							? 'bg-blue-600 text-white'
							: 'text-gray-600 hover:bg-gray-100 dark:text-gray-300 dark:hover:bg-gray-700'}"
						onclick={() => setCalendarRange(90)}
					>
						90d
					</button>
					<button
						type="button"
						aria-pressed={calendarRangeDays === 180}
						class="rounded-md px-2 py-1 text-xs font-medium {calendarRangeDays === 180
							? 'bg-blue-600 text-white'
							: 'text-gray-600 hover:bg-gray-100 dark:text-gray-300 dark:hover:bg-gray-700'}"
						onclick={() => setCalendarRange(180)}
					>
						180d
					</button>
				</div>
			</div>
			{#key `calendar-${calendarRangeDays}-${isDark ? 'dark' : 'light'}`}
				<EChart options={calendarHeatmapOptions} height="190px" theme={isDark ? 'dark' : 'light'} />
			{/key}
		</div>

		<div class="rounded-xl bg-white p-5 shadow-sm dark:bg-gray-800">
			<div class="mb-3 flex flex-wrap items-center justify-between gap-3">
				<div>
					<h2 class="text-lg font-semibold text-gray-900 dark:text-white">Evolución apilada · {stackedRangeDays}d</h2>
					<p class="text-sm text-gray-500 dark:text-gray-400">Volumen por tipo de evento para detectar cambios de dinámica</p>
				</div>
				<div class="inline-flex rounded-lg border border-gray-200 p-1 dark:border-gray-700">
					<button
						type="button"
						aria-pressed={stackedRangeDays === 14}
						class="rounded-md px-2 py-1 text-xs font-medium {stackedRangeDays === 14
							? 'bg-blue-600 text-white'
							: 'text-gray-600 hover:bg-gray-100 dark:text-gray-300 dark:hover:bg-gray-700'}"
						onclick={() => setStackedRange(14)}
					>
						14d
					</button>
					<button
						type="button"
						aria-pressed={stackedRangeDays === 30}
						class="rounded-md px-2 py-1 text-xs font-medium {stackedRangeDays === 30
							? 'bg-blue-600 text-white'
							: 'text-gray-600 hover:bg-gray-100 dark:text-gray-300 dark:hover:bg-gray-700'}"
						onclick={() => setStackedRange(30)}
					>
						30d
					</button>
				</div>
			</div>
			{#key `stacked-${stackedRangeDays}-${isDark ? 'dark' : 'light'}`}
				<EChart options={stackedTrendOptions} height="260px" theme={isDark ? 'dark' : 'light'} />
			{/key}
		</div>

		<div class="rounded-xl bg-white p-5 shadow-sm dark:bg-gray-800">
			<div class="mb-3">
				<h2 class="text-lg font-semibold text-gray-900 dark:text-white">Punch card horario (60 días)</h2>
				<p class="text-sm text-gray-500 dark:text-gray-400">Patrones de actividad por día de semana y hora</p>
			</div>
			{#key `punch-${isDark ? 'dark' : 'light'}`}
				<EChart options={punchCardOptions} height="260px" theme={isDark ? 'dark' : 'light'} />
			{/key}
		</div>

		<div class="rounded-xl bg-white p-5 shadow-sm dark:bg-gray-800 xl:col-span-2">
			<div class="mb-3 flex flex-wrap items-center justify-between gap-3">
				<div>
					<h2 class="text-lg font-semibold text-gray-900 dark:text-white">Heatmap estudiantes vs tiempo · {studentHeatmapRangeDays}d</h2>
					<p class="text-sm text-gray-500 dark:text-gray-400">Comparativa de intensidad de actividad para todo el alumnado del curso</p>
					<p class="text-xs text-gray-500 dark:text-gray-400">Mostrando {pagedDisplayStart}-{pagedDisplayEnd} de {filteredStudentsCount} (total curso: {heatmapStudents.length})</p>
				</div>
				<div class="flex items-center gap-2 rounded-lg border border-blue-200 bg-blue-50 px-2 py-1 text-xs text-blue-700 dark:border-blue-800/70 dark:bg-blue-900/20 dark:text-blue-300" title="Haz clic en el nombre del eje Y para abrir la ficha del estudiante">
					<span class="inline-flex h-4 w-4 items-center justify-center rounded-full border border-current text-[10px] font-semibold">i</span>
					<span>Eje Y clicable</span>
				</div>
				<div class="inline-flex rounded-lg border border-gray-200 p-1 dark:border-gray-700">
					<button
						type="button"
						aria-pressed={studentHeatmapRangeDays === 14}
						class="rounded-md px-2 py-1 text-xs font-medium {studentHeatmapRangeDays === 14
							? 'bg-blue-600 text-white'
							: 'text-gray-600 hover:bg-gray-100 dark:text-gray-300 dark:hover:bg-gray-700'}"
						onclick={() => setStudentHeatmapRange(14)}
					>
						14d
					</button>
					<button
						type="button"
						aria-pressed={studentHeatmapRangeDays === 28}
						class="rounded-md px-2 py-1 text-xs font-medium {studentHeatmapRangeDays === 28
							? 'bg-blue-600 text-white'
							: 'text-gray-600 hover:bg-gray-100 dark:text-gray-300 dark:hover:bg-gray-700'}"
						onclick={() => setStudentHeatmapRange(28)}
					>
						28d
					</button>
				</div>
			</div>
			<div class="mb-3 grid grid-cols-1 gap-2 md:grid-cols-3">
				<input
					type="text"
					bind:value={studentHeatmapSearch}
					oninput={() => (studentHeatmapPage = 1)}
					placeholder="Buscar por nombre o email"
					class="rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 dark:border-gray-600 dark:bg-gray-700 dark:text-white"
				/>
				<select
					bind:value={studentHeatmapSortMode}
					onchange={() => (studentHeatmapPage = 1)}
					class="rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 dark:border-gray-600 dark:bg-gray-700 dark:text-white"
				>
					<option value="activity_desc">Orden: más actividad</option>
					<option value="activity_asc">Orden: menos actividad</option>
					<option value="name_asc">Orden: nombre A-Z</option>
					<option value="name_desc">Orden: nombre Z-A</option>
				</select>
				<select
					bind:value={studentHeatmapActivityFilter}
					onchange={() => (studentHeatmapPage = 1)}
					class="rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 dark:border-gray-600 dark:bg-gray-700 dark:text-white"
				>
					<option value="all">Filtro: todos</option>
					<option value="with_activity">Filtro: con actividad</option>
					<option value="without_activity">Filtro: sin actividad</option>
				</select>
			</div>
			<div class="mb-3 flex flex-wrap items-center justify-between gap-2">
				<div class="inline-flex items-center gap-2">
					<span class="text-xs text-gray-500 dark:text-gray-400">Filas visibles</span>
					<select
						bind:value={studentHeatmapRowsPerPage}
						onchange={() => (studentHeatmapPage = 1)}
						class="min-w-16 rounded-lg border border-gray-300 bg-white px-2 py-1 text-center text-xs font-medium text-gray-900 dark:border-gray-600 dark:bg-gray-700 dark:text-white"
					>
						<option value={20}>20</option>
						<option value={40}>40</option>
						<option value={80}>80</option>
					</select>
				</div>
				<div class="inline-flex items-center gap-2">
					<button
						type="button"
						disabled={studentHeatmapEffectivePage <= 1}
						class="rounded-md border border-gray-300 px-2 py-1 text-xs text-gray-700 enabled:hover:bg-gray-100 disabled:cursor-not-allowed disabled:opacity-50 dark:border-gray-600 dark:text-gray-200 dark:enabled:hover:bg-gray-700"
						onclick={() => (studentHeatmapPage = Math.max(1, studentHeatmapEffectivePage - 1))}
					>
						Anterior
					</button>
					<span class="text-xs text-gray-500 dark:text-gray-400">Página {studentHeatmapEffectivePage}/{studentHeatmapTotalPages}</span>
					<button
						type="button"
						disabled={studentHeatmapEffectivePage >= studentHeatmapTotalPages}
						class="rounded-md border border-gray-300 px-2 py-1 text-xs text-gray-700 enabled:hover:bg-gray-100 disabled:cursor-not-allowed disabled:opacity-50 dark:border-gray-600 dark:text-gray-200 dark:enabled:hover:bg-gray-700"
						onclick={() => (studentHeatmapPage = Math.min(studentHeatmapTotalPages, studentHeatmapEffectivePage + 1))}
					>
						Siguiente
					</button>
				</div>
			</div>
			{#key `student-heatmap-${studentHeatmapRangeDays}-${studentHeatmapEffectivePage}-${studentHeatmapRowsPerPage}-${studentHeatmapSortMode}-${studentHeatmapActivityFilter}-${studentHeatmapSearch}-${isDark ? 'dark' : 'light'}`}
				<EChart
					options={studentHeatmapOptions}
					height={studentHeatmapChartHeight}
					theme={isDark ? 'dark' : 'light'}
					onChartClick={onStudentHeatmapClick}
				/>
			{/key}
		</div>

		<div class="rounded-xl bg-white p-5 shadow-sm dark:bg-gray-800">
			<h2 class="mb-4 text-lg font-semibold text-gray-900 dark:text-white">Actividad por estudiante (Top 10)</h2>
			<div class="space-y-3">
				{#each data.analytics.topStudents as student, index (student.userId)}
					<div class="flex items-center justify-between rounded-lg border border-gray-200 p-3 dark:border-gray-700">
						<div>
							<p class="text-sm font-medium text-gray-900 dark:text-white">
								#{index + 1} ·
								<a
									href={`/course/${data.courseId}/admin/students/${student.userId}`}
									class="hover:text-primary-600 dark:hover:text-primary-400 underline-offset-2 hover:underline"
								>
									{getStudentDisplayName(student)}
								</a>
							</p>
							<p class="text-xs text-gray-500 dark:text-gray-400">
								{student.completedActivities} completadas · {student.inProgressActivities} en progreso · {formatDuration(student.totalTimeSpentSeconds)}
							</p>
							{#if student.email}
								<p class="text-xs text-gray-400 dark:text-gray-500">{student.email}</p>
							{/if}
						</div>
						<Badge color={student.completionRate >= 70 ? 'green' : student.completionRate >= 30 ? 'yellow' : 'red'}>
							{student.completionRate}%
						</Badge>
					</div>
				{:else}
					<p class="text-sm text-gray-500 dark:text-gray-400">No hay estudiantes con progreso registrado.</p>
				{/each}
			</div>
		</div>

		<div class="rounded-xl bg-white p-5 shadow-sm dark:bg-gray-800">
			<h2 class="mb-4 text-lg font-semibold text-gray-900 dark:text-white">Rendimiento por actividad</h2>
			<div class="space-y-3">
				{#each data.analytics.activityAnalytics as activity (activity.activityId)}
					<div class="rounded-lg border border-gray-200 p-3 dark:border-gray-700">
						<div class="mb-2 flex items-center justify-between">
							<p class="font-medium text-gray-900 dark:text-white">{activity.name}</p>
							<Badge color={activity.completionRate >= 70 ? 'green' : activity.completionRate >= 30 ? 'yellow' : 'red'}>
								{activity.completionRate}%
							</Badge>
						</div>
						<p class="text-xs text-gray-500 dark:text-gray-400">
							{activity.completedStudents} completadas · {activity.inProgressStudents} en progreso · {activity.notStartedStudents} sin iniciar
						</p>
					</div>
				{:else}
					<p class="text-sm text-gray-500 dark:text-gray-400">No hay actividades en el curso.</p>
				{/each}
			</div>
		</div>
	</div>
</div>
