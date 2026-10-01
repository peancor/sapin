<script lang="ts">
	import { resolve } from '$app/paths';
	import {
		Avatar,
		Badge,
		Table,
		TableBody,
		TableBodyCell,
		TableBodyRow,
		TableHead,
		TableHeadCell
	} from 'flowbite-svelte';
	import {
		AlertTriangle,
		BookOpen,
		CheckCircle2,
		Clock3,
		Eye,
		GitBranch,
		Users
	} from 'lucide-svelte';
	import type { PageData } from '../$types';
	import {
		buildActivityStudentsCsvFilename,
		downloadCSV,
		formatDate,
		lessonStatusColor,
		lessonStatusLabel,
		sortCsvRowsByStudent
	} from '../viewUtils';

	type LessonStudentsData = Extract<PageData, { view: 'lesson' }>;

	let {
		data,
		courseId,
		interactiveId
	}: {
		data: LessonStudentsData;
		courseId: string;
		interactiveId: string;
	} = $props();

	async function exportToCSV(): Promise<void> {
		const sortedStudents = sortCsvRowsByStudent(
			data.lessonStudents,
			(row) => row.student.username || row.student.alias || 'Sin nombre',
			(row) => `${row.student.email ?? ''}\u0000${row.student.id}`
		);
		const rows = [
			[
				'Estudiante',
				'Estado último intento',
				'Última actividad',
				'Intentos',
				'Bloques visitados',
				'Checks',
				'Alertas'
			],
			...sortedStudents.map((row) => [
				row.student.username || row.student.alias || 'Sin nombre',
				lessonStatusLabel(row.latestAttempt),
				formatDate(row.latestAttempt?.lastActiveAt),
				row.totalAttempts,
				row.latestAttempt
					? `${row.latestAttempt.visitedBlocksCount}/${row.latestAttempt.totalBlocks}`
					: '0/0',
				row.latestAttempt
					? `${row.latestAttempt.checksPassed}/${row.latestAttempt.checksPassed + row.latestAttempt.checksPending}`
					: '0/0',
				row.latestAttempt?.alerts.map((alert) => alert.label).join(', ') ?? ''
			])
		];

		await downloadCSV(rows, buildActivityStudentsCsvFilename('lesson', data.interactive.name));
	}
</script>

<div
	class="mb-6 rounded-3xl border border-amber-200/70 bg-linear-to-br from-amber-50 via-white to-sky-50 p-6 shadow-sm dark:border-amber-900/40 dark:from-amber-950/20 dark:via-slate-900 dark:to-sky-950/20"
>
	<div class="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
		<div class="max-w-3xl">
			<div
				class="inline-flex items-center gap-2 rounded-full border border-amber-200 bg-white/80 px-3 py-1 text-xs font-semibold tracking-[0.16em] text-amber-700 uppercase dark:border-amber-900/60 dark:bg-slate-900/80 dark:text-amber-300"
			>
				<BookOpen class="h-3.5 w-3.5" />
				Lesson students
			</div>
			<h2 class="mt-4 text-2xl font-semibold text-gray-900 dark:text-white">
				Alumno por alumno, sin perder el detalle de cada intento
			</h2>
			<p class="mt-2 text-sm leading-6 text-gray-600 dark:text-gray-300">
				Esta vista está centrada en el seguimiento del alumnado. Para inspección pedagógica
				avanzada, alertas complejas o intentos del staff, sigue usando la revisión completa de la
				lesson.
			</p>
			<div class="mt-4 flex flex-wrap gap-3 text-sm text-gray-600 dark:text-gray-300">
				<span
					class="inline-flex items-center gap-2 rounded-full border border-gray-200 bg-white px-3 py-1.5 dark:border-slate-700 dark:bg-slate-900"
				>
					<Users class="h-4 w-4 text-amber-600 dark:text-amber-300" />
					{data.lessonSummary.totalStudents} alumnos
				</span>
				<span
					class="inline-flex items-center gap-2 rounded-full border border-gray-200 bg-white px-3 py-1.5 dark:border-slate-700 dark:bg-slate-900"
				>
					<GitBranch class="h-4 w-4 text-sky-600 dark:text-sky-300" />
					{data.lessonSummary.totalAttempts} intentos registrados
				</span>
				{#if data.lessonSummary.lastActivityAt}
					<span
						class="inline-flex items-center gap-2 rounded-full border border-gray-200 bg-white px-3 py-1.5 dark:border-slate-700 dark:bg-slate-900"
					>
						<Clock3 class="h-4 w-4 text-emerald-600 dark:text-emerald-300" />
						Última actividad: {formatDate(data.lessonSummary.lastActivityAt)}
					</span>
				{/if}
			</div>
		</div>

		<div class="flex flex-wrap gap-3">
			<a
				href={resolve(`/course/${courseId}/admin/interactives/${interactiveId}/lesson-review`)}
				class="inline-flex items-center gap-2 rounded-2xl border border-gray-200 bg-white px-4 py-3 text-sm font-medium text-gray-700 transition-colors hover:border-amber-300 hover:text-amber-700 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200 dark:hover:border-amber-700 dark:hover:text-amber-200"
			>
				<Eye class="h-4 w-4" />
				Abrir revisión avanzada
			</a>
			<button
				type="button"
				class="rounded-2xl bg-gray-900 px-4 py-3 text-sm font-medium text-white transition-colors hover:bg-gray-700 dark:bg-white dark:text-gray-900 dark:hover:bg-gray-200"
				onclick={exportToCSV}
			>
				Exportar CSV
			</button>
		</div>
	</div>
</div>

<div class="mb-6 grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4">
	<div class="rounded-2xl bg-white p-5 shadow-sm dark:bg-gray-800">
		<div class="flex items-center gap-4">
			<div class="rounded-xl bg-amber-100 p-3 dark:bg-amber-900/40">
				<Users class="h-6 w-6 text-amber-700 dark:text-amber-300" />
			</div>
			<div>
				<p class="text-sm text-gray-500 dark:text-gray-400">Alumnado</p>
				<p class="text-2xl font-bold text-gray-900 dark:text-white">
					{data.lessonSummary.totalStudents}
				</p>
			</div>
		</div>
	</div>

	<div class="rounded-2xl bg-white p-5 shadow-sm dark:bg-gray-800">
		<div class="flex items-center gap-4">
			<div class="rounded-xl bg-sky-100 p-3 dark:bg-sky-900/40">
				<Clock3 class="h-6 w-6 text-sky-700 dark:text-sky-300" />
			</div>
			<div>
				<p class="text-sm text-gray-500 dark:text-gray-400">Con intentos</p>
				<p class="text-2xl font-bold text-gray-900 dark:text-white">
					{data.lessonSummary.studentsWithAttempts}
				</p>
			</div>
		</div>
	</div>

	<div class="rounded-2xl bg-white p-5 shadow-sm dark:bg-gray-800">
		<div class="flex items-center gap-4">
			<div class="rounded-xl bg-emerald-100 p-3 dark:bg-emerald-900/40">
				<CheckCircle2 class="h-6 w-6 text-emerald-700 dark:text-emerald-300" />
			</div>
			<div>
				<p class="text-sm text-gray-500 dark:text-gray-400">Último intento completado</p>
				<p class="text-2xl font-bold text-gray-900 dark:text-white">
					{data.lessonSummary.studentsCompleted}
				</p>
			</div>
		</div>
	</div>

	<div class="rounded-2xl bg-white p-5 shadow-sm dark:bg-gray-800">
		<div class="flex items-center gap-4">
			<div class="rounded-xl bg-rose-100 p-3 dark:bg-rose-900/40">
				<AlertTriangle class="h-6 w-6 text-rose-700 dark:text-rose-300" />
			</div>
			<div>
				<p class="text-sm text-gray-500 dark:text-gray-400">Con alertas</p>
				<p class="text-2xl font-bold text-gray-900 dark:text-white">
					{data.lessonSummary.studentsWithAlerts}
				</p>
			</div>
		</div>
	</div>
</div>

<div class="overflow-hidden rounded-3xl bg-white shadow-sm dark:bg-gray-800">
	<div class="border-b border-gray-200 px-6 py-5 dark:border-gray-700">
		<h2 class="text-lg font-semibold text-gray-900 dark:text-white">Directorio de alumnado</h2>
		<p class="mt-1 text-sm text-gray-500 dark:text-gray-400">
			Cada fila resume el último intento visible y abre la ficha completa del alumno.
		</p>
	</div>

	<div class="overflow-x-auto">
		<Table striped>
			<TableHead>
				<TableHeadCell class="w-14"></TableHeadCell>
				<TableHeadCell>Alumno</TableHeadCell>
				<TableHeadCell>Último estado</TableHeadCell>
				<TableHeadCell>Última actividad</TableHeadCell>
				<TableHeadCell>Intentos</TableHeadCell>
				<TableHeadCell>Recorrido</TableHeadCell>
				<TableHeadCell>Alertas</TableHeadCell>
				<TableHeadCell>Acción</TableHeadCell>
			</TableHead>
			<TableBody class="divide-y">
				{#each data.lessonStudents as row (row.student.id)}
					<TableBodyRow>
						<TableBodyCell class="flex h-14 w-14 items-center justify-center p-4!">
							<Avatar
								src={row.student.image || '/images/default_avatar.png'}
								class="h-8 w-8"
								alt={row.student.username}
								cornerStyle="rounded"
							/>
						</TableBodyCell>
						<TableBodyCell>
							<div class="font-medium text-gray-900 dark:text-white">{row.student.username}</div>
							{#if row.student.alias}
								<p class="text-xs text-gray-500 italic dark:text-gray-400">{row.student.alias}</p>
							{/if}
							{#if row.student.email}
								<p class="text-xs text-gray-500 dark:text-gray-400">{row.student.email}</p>
							{/if}
						</TableBodyCell>
						<TableBodyCell>
							<Badge color={lessonStatusColor(row.latestAttempt)}>
								{lessonStatusLabel(row.latestAttempt)}
							</Badge>
						</TableBodyCell>
						<TableBodyCell>{formatDate(row.latestAttempt?.lastActiveAt)}</TableBodyCell>
						<TableBodyCell>
							<div class="font-medium text-gray-900 dark:text-white">{row.totalAttempts}</div>
							<p class="text-xs text-gray-500 dark:text-gray-400">
								{row.latestAttempt
									? `Intento #${row.latestAttempt.attemptNumber}`
									: 'Sin actividad'}
							</p>
						</TableBodyCell>
						<TableBodyCell>
							{#if row.latestAttempt}
								<div class="font-medium text-gray-900 dark:text-white">
									{row.latestAttempt.visitedBlocksCount}/{row.latestAttempt.totalBlocks} bloques
								</div>
								<p class="text-xs text-gray-500 dark:text-gray-400">
									Checks: {row.latestAttempt.checksPassed} superados · {row.latestAttempt
										.checksPending} pendientes
								</p>
								<p class="text-xs text-gray-500 dark:text-gray-400">
									Bloque actual: {row.latestAttempt.currentBlockTitle}
								</p>
							{:else}
								<span class="text-sm text-gray-500 dark:text-gray-400">Sin intentos</span>
							{/if}
						</TableBodyCell>
						<TableBodyCell>
							{#if row.latestAttempt && row.latestAttempt.alerts.length > 0}
								<div class="flex flex-wrap gap-1.5">
									{#each row.latestAttempt.alerts.slice(0, 2) as alert (alert.kind)}
										<span
											class="inline-flex items-center gap-1 rounded-full border border-rose-200 bg-rose-50 px-2.5 py-1 text-[11px] font-medium text-rose-700 dark:border-rose-900/60 dark:bg-rose-950/25 dark:text-rose-300"
										>
											<AlertTriangle class="h-3 w-3" />
											{alert.label}
										</span>
									{/each}
									{#if row.latestAttempt.alerts.length > 2}
										<span
											class="inline-flex items-center rounded-full border border-gray-200 bg-gray-50 px-2.5 py-1 text-[11px] font-medium text-gray-600 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300"
										>
											+{row.latestAttempt.alerts.length - 2}
										</span>
									{/if}
								</div>
							{:else}
								<span class="text-sm text-gray-500 dark:text-gray-400">Sin alertas</span>
							{/if}
						</TableBodyCell>
						<TableBodyCell>
							<a
								href={resolve(
									`/course/${courseId}/admin/interactives/${interactiveId}/students/${row.student.id}`
								)}
								class="inline-flex items-center gap-2 rounded-xl border border-gray-200 bg-white px-3 py-2 text-sm font-medium text-gray-700 transition-colors hover:border-amber-300 hover:text-amber-700 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200 dark:hover:border-amber-700 dark:hover:text-amber-200"
							>
								<Eye class="h-4 w-4" />
								Ver ficha
							</a>
						</TableBodyCell>
					</TableBodyRow>
				{:else}
					<TableBodyRow>
						<TableBodyCell colspan={8} class="py-10 text-center">
							<p class="font-medium text-gray-900 dark:text-white">
								No hay alumnado matriculado en esta lesson
							</p>
							<p class="mt-1 text-sm text-gray-500 dark:text-gray-400">
								Cuando se matriculen estudiantes, aparecerán aquí con sus intentos y alertas.
							</p>
						</TableBodyCell>
					</TableBodyRow>
				{/each}
			</TableBody>
		</Table>
	</div>
</div>
