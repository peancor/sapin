<script lang="ts">
	import { resolve } from '$app/paths';
	import { page } from '$app/state';
	import type { PageProps } from './$types';
	import { Avatar, Badge, Table, TableBody, TableBodyCell, TableBodyRow, TableHead, TableHeadCell } from 'flowbite-svelte';
	import {
		AlertTriangle,
		ArrowLeft,
		BookOpen,
		Calendar,
		CheckCircle2,
		Clock3,
		Eye,
		GitBranch,
		MessageSquare,
		Users
	} from 'lucide-svelte';
	import type { LessonReviewAttemptSummary } from '$lib/types/lessonReview';

	let { data }: PageProps = $props();

	type LessonBadgeColor = 'gray' | 'green' | 'red' | 'yellow';

	const isLesson = $derived(data.interactive.type === 'lesson');
	const standardStudents = $derived(data.students ?? []);
	const lessonStudents = $derived(data.lessonStudents ?? []);
	const lessonSummary = $derived(data.lessonSummary);

	function formatDate(date: string | number | Date | undefined | null): string {
		if (!date) return 'Nunca';
		const dateObj = date instanceof Date ? date : new Date(date);
		return dateObj.toLocaleDateString('es-ES', {
			year: 'numeric',
			month: 'long',
			day: 'numeric',
			hour: '2-digit',
			minute: '2-digit'
		});
	}

	function lessonStatusLabel(attempt: LessonReviewAttemptSummary | null): string {
		if (!attempt) return 'Sin intentos';
		if (attempt.reviewStatus === 'completed') return 'Completado';
		if (attempt.reviewStatus === 'attention') return 'Con alertas';
		return 'Activo';
	}

	function lessonStatusClasses(attempt: LessonReviewAttemptSummary | null): LessonBadgeColor {
		if (!attempt) return 'gray';
		if (attempt.reviewStatus === 'completed') return 'green';
		if (attempt.reviewStatus === 'attention') return 'red';
		return 'yellow';
	}

	function exportToCSV(): void {
		if (isLesson) {
			const rows = [
				[
					'Estudiante',
					'Estado último intento',
					'Última actividad',
					'Intentos',
					'Bloques visitados',
					'Checks',
					'Alertas'
				].join(';')
			];

			lessonStudents.forEach((row) => {
				rows.push(
					[
						row.student.username,
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
					].join(';')
				);
			});

			downloadCSV(rows.join('\n'), 'estudiantes_lesson.csv');
			return;
		}

		const headers = [
			'Estudiante',
			'Estado',
			'Última Actividad',
			'Mensajes',
			'Chats',
			'Total Pulsaciones',
			'Total Pegados',
			'Tiempo Total (segundos)'
		];
		const csvRows = [headers.join(';')];

		standardStudents.forEach((student) => {
			let totalKeypresses = 0;
			let totalPastes = 0;
			let totalTime = 0;

			student.chats.forEach((chat) => {
				if (!chat.messages) return;

				chat.messages.forEach((message) => {
					if (!message.metadata) return;

					try {
						const metrics = JSON.parse(message.metadata);
						totalKeypresses += metrics.keystrokeCount || 0;
						totalPastes += metrics.pasteCount || 0;
						totalTime += metrics.timeSpentSeconds || 0;
					} catch {
						// Ignorar metadatos malformados al exportar.
					}
				});
			});

			csvRows.push(
				[
					student.username || student.alias || 'Sin nombre',
					student.isCompleted ? 'Completado' : student.inProgress ? 'En Progreso' : 'Pendiente',
					formatDate(student.lastActivity),
					student.totalMessages,
					student.chats.length,
					totalKeypresses,
					totalPastes,
					totalTime
				].join(';')
			);
		});

		downloadCSV(csvRows.join('\n'), 'estudiantes_actividad.csv');
	}

	function downloadCSV(content: string, filename: string): void {
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
</script>

<svelte:head>
	<title>
		{isLesson ? `Estudiantes de lesson · ${data.interactive.name}` : `Estudiantes · ${data.interactive.name}`}
	</title>
</svelte:head>

<div class="min-h-screen bg-gray-50 dark:bg-gray-900">
	<div class="sticky top-0 z-10 bg-white shadow-sm dark:bg-gray-800">
		<div class="container mx-auto max-w-screen-xl px-4">
			<div class="flex items-center gap-4 py-4">
				<a
					href={resolve(`/course/${page.params.cid}/admin/interactives/${page.params.ilid}`)}
					class="-ml-2 rounded-lg p-2 transition-colors hover:bg-gray-100 dark:hover:bg-gray-700"
					title="Volver a la actividad"
				>
					<ArrowLeft size={20} class="text-gray-500 dark:text-gray-400" />
				</a>
				<div class="min-w-0 flex-1">
					<h1 class="truncate text-lg font-semibold text-gray-900 dark:text-white">
						{isLesson ? `Alumnado: ${data.interactive.name}` : `Estudiantes: ${data.interactive.name}`}
					</h1>
					<p class="text-sm text-gray-500 dark:text-gray-400">
						{#if isLesson}
							Seguimiento del alumnado por intentos, estado y progreso de lesson.
						{:else}
							Seguimiento de participación y finalización por estudiante.
						{/if}
					</p>
				</div>
			</div>
		</div>
	</div>

	<div class="container mx-auto max-w-screen-xl px-4 py-6">
		{#if isLesson && lessonSummary}
			<div class="mb-6 rounded-3xl border border-amber-200/70 bg-linear-to-br from-amber-50 via-white to-sky-50 p-6 shadow-sm dark:border-amber-900/40 dark:from-amber-950/20 dark:via-slate-900 dark:to-sky-950/20">
				<div class="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
					<div class="max-w-3xl">
						<div class="inline-flex items-center gap-2 rounded-full border border-amber-200 bg-white/80 px-3 py-1 text-xs font-semibold uppercase tracking-[0.16em] text-amber-700 dark:border-amber-900/60 dark:bg-slate-900/80 dark:text-amber-300">
							<BookOpen class="h-3.5 w-3.5" />
							Lesson students
						</div>
						<h2 class="mt-4 text-2xl font-semibold text-gray-900 dark:text-white">
							Alumno por alumno, sin perder el detalle de cada intento
						</h2>
						<p class="mt-2 text-sm leading-6 text-gray-600 dark:text-gray-300">
							Esta vista está centrada en el seguimiento del alumnado. Para inspección pedagógica avanzada, alertas complejas o intentos del staff, sigue usando la revisión completa de la lesson.
						</p>
						<div class="mt-4 flex flex-wrap gap-3 text-sm text-gray-600 dark:text-gray-300">
							<span class="inline-flex items-center gap-2 rounded-full border border-gray-200 bg-white px-3 py-1.5 dark:border-slate-700 dark:bg-slate-900">
								<Users class="h-4 w-4 text-amber-600 dark:text-amber-300" />
								{lessonSummary.totalStudents} alumnos
							</span>
							<span class="inline-flex items-center gap-2 rounded-full border border-gray-200 bg-white px-3 py-1.5 dark:border-slate-700 dark:bg-slate-900">
								<GitBranch class="h-4 w-4 text-sky-600 dark:text-sky-300" />
								{lessonSummary.totalAttempts} intentos registrados
							</span>
							{#if lessonSummary.lastActivityAt}
								<span class="inline-flex items-center gap-2 rounded-full border border-gray-200 bg-white px-3 py-1.5 dark:border-slate-700 dark:bg-slate-900">
									<Clock3 class="h-4 w-4 text-emerald-600 dark:text-emerald-300" />
									Última actividad: {formatDate(lessonSummary.lastActivityAt)}
								</span>
							{/if}
						</div>
					</div>

					<div class="flex flex-wrap gap-3">
						<a
							href={resolve(`/course/${page.params.cid}/admin/interactives/${page.params.ilid}/lesson-review`)}
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
								{lessonSummary.totalStudents}
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
								{lessonSummary.studentsWithAttempts}
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
								{lessonSummary.studentsCompleted}
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
								{lessonSummary.studentsWithAlerts}
							</p>
						</div>
					</div>
				</div>
			</div>

			<div class="overflow-hidden rounded-3xl bg-white shadow-sm dark:bg-gray-800">
				<div class="border-b border-gray-200 px-6 py-5 dark:border-gray-700">
					<h2 class="text-lg font-semibold text-gray-900 dark:text-white">
						Directorio de alumnado
					</h2>
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
							{#each lessonStudents as row (row.student.id)}
								<TableBodyRow>
									<TableBodyCell class="p-4! w-14 h-14 flex items-center justify-center">
										<Avatar
											src={row.student.image || '/images/default_avatar.png'}
											class="w-8 h-8"
											alt={row.student.username}
											cornerStyle="rounded"
										/>
									</TableBodyCell>
									<TableBodyCell>
										<div class="font-medium text-gray-900 dark:text-white">
											{row.student.username}
										</div>
										{#if row.student.alias}
											<p class="text-xs italic text-gray-500 dark:text-gray-400">
												{row.student.alias}
											</p>
										{/if}
										{#if row.student.email}
											<p class="text-xs text-gray-500 dark:text-gray-400">
												{row.student.email}
											</p>
										{/if}
									</TableBodyCell>
									<TableBodyCell>
										<Badge color={lessonStatusClasses(row.latestAttempt)}>
											{lessonStatusLabel(row.latestAttempt)}
										</Badge>
									</TableBodyCell>
									<TableBodyCell>
										{formatDate(row.latestAttempt?.lastActiveAt)}
									</TableBodyCell>
									<TableBodyCell>
										<div class="font-medium text-gray-900 dark:text-white">{row.totalAttempts}</div>
										<p class="text-xs text-gray-500 dark:text-gray-400">
											{row.latestAttempt ? `Intento #${row.latestAttempt.attemptNumber}` : 'Sin actividad'}
										</p>
									</TableBodyCell>
									<TableBodyCell>
										{#if row.latestAttempt}
											<div class="font-medium text-gray-900 dark:text-white">
												{row.latestAttempt.visitedBlocksCount}/{row.latestAttempt.totalBlocks} bloques
											</div>
											<p class="text-xs text-gray-500 dark:text-gray-400">
												Checks: {row.latestAttempt.checksPassed} superados · {row.latestAttempt.checksPending} pendientes
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
													<span class="inline-flex items-center gap-1 rounded-full border border-rose-200 bg-rose-50 px-2.5 py-1 text-[11px] font-medium text-rose-700 dark:border-rose-900/60 dark:bg-rose-950/25 dark:text-rose-300">
														<AlertTriangle class="h-3 w-3" />
														{alert.label}
													</span>
												{/each}
												{#if row.latestAttempt.alerts.length > 2}
													<span class="inline-flex items-center rounded-full border border-gray-200 bg-gray-50 px-2.5 py-1 text-[11px] font-medium text-gray-600 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300">
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
											href={resolve(`/course/${page.params.cid}/admin/interactives/${page.params.ilid}/students/${row.student.id}`)}
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
		{:else}
			<div class="bg-white dark:bg-gray-800 rounded-lg shadow mb-6 p-4">
				<div class="flex justify-between items-center mb-4">
					<h2 class="text-xl font-semibold text-gray-900 dark:text-white flex items-center">
						<Users class="mr-2 h-5 w-5 text-blue-500" />
						Actividad de Estudiantes
					</h2>
					<button class="bg-blue-500 hover:bg-blue-700 text-white font-bold py-2 px-4 rounded" onclick={exportToCSV}>
						Exportar a CSV
					</button>
				</div>

				<div class="bg-blue-50 dark:bg-blue-900 p-3 rounded-lg mb-4">
					<div class="flex items-start">
						<div>
							<p class="font-medium text-blue-800 dark:text-blue-200">Criterios de estado de actividad</p>
							<ul class="list-disc ml-5 mt-2 text-sm text-blue-700 dark:text-blue-300">
								<li>Un estudiante ha <strong>accedido</strong> a la actividad cuando tiene al menos un chat.</li>
								{#if data.interactive.type === 'agent'}
									<li>Un estudiante ha <strong>completado</strong> la actividad cuando el agente ejecuta la tool de finalizacion configurada y se registra progreso completado.</li>
								{:else}
									<li>Un estudiante ha <strong>completado</strong> la actividad cuando tiene al menos {data.requiresMinMessages} mensajes y uno de ellos contiene el texto <code>[[DONE]]</code>.</li>
								{/if}
								<li>Un estudiante está <strong>en progreso</strong> cuando ha accedido pero aún no ha completado la actividad.</li>
							</ul>
						</div>
					</div>
				</div>

				<div class="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
					<div class="bg-blue-50 dark:bg-blue-900 p-4 rounded-lg">
						<div class="flex items-center">
							<div class="p-2 bg-blue-100 dark:bg-blue-800 rounded">
								<Users class="h-6 w-6 text-blue-600 dark:text-blue-400" />
							</div>
							<div class="ml-3">
								<p class="text-sm text-gray-600 dark:text-gray-400">Total Estudiantes Activos</p>
								<p class="text-xl font-bold dark:text-white">
									{standardStudents.filter((student) => student.hasActivity).length} / {standardStudents.length}
								</p>
							</div>
						</div>
					</div>

					<div class="bg-green-50 dark:bg-green-900 p-4 rounded-lg">
						<div class="flex items-center">
							<div class="p-2 bg-green-100 dark:bg-green-800 rounded">
								<MessageSquare class="h-6 w-6 text-green-600 dark:text-green-400" />
							</div>
							<div class="ml-3">
								<p class="text-sm text-gray-600 dark:text-gray-400">Actividades Completadas</p>
								<p class="text-xl font-bold dark:text-white">
									{standardStudents.filter((student) => student.isCompleted).length} / {standardStudents.length}
								</p>
							</div>
						</div>
					</div>

					<div class="bg-purple-50 dark:bg-purple-900 p-4 rounded-lg">
						<div class="flex items-center">
							<div class="p-2 bg-purple-100 dark:bg-purple-800 rounded">
								<Calendar class="h-6 w-6 text-purple-600 dark:text-purple-400" />
							</div>
							<div class="ml-3">
								<p class="text-sm text-gray-600 dark:text-gray-400">Promedio de Mensajes</p>
								<p class="text-xl font-bold dark:text-white">
									{standardStudents.filter((student) => student.hasActivity).length > 0
										? Math.round(
												standardStudents.reduce((sum, student) => sum + student.totalMessages, 0) /
													standardStudents.filter((student) => student.hasActivity).length
											)
										: 0}
								</p>
							</div>
						</div>
					</div>
				</div>

				<div class="overflow-x-auto">
					<Table striped>
						<TableHead>
							<TableHeadCell class="w-14"></TableHeadCell>
							<TableHeadCell>Estudiante</TableHeadCell>
							<TableHeadCell>Estado</TableHeadCell>
							<TableHeadCell>Última Actividad</TableHeadCell>
							<TableHeadCell>Mensajes</TableHeadCell>
							<TableHeadCell>Chats</TableHeadCell>
						</TableHead>
						<TableBody class="divide-y">
							{#each standardStudents as student (student.id)}
								<TableBodyRow>
									<TableBodyCell class="p-4! w-14 h-14 flex items-center justify-center">
										<Avatar
											src={student.image || '/images/default_avatar.png'}
											class="w-8 h-8"
											alt={student.username || student.alias || 'Sin nombre'}
											cornerStyle="rounded"
										/>
									</TableBodyCell>
									<TableBodyCell>
										<div class="font-medium text-gray-900 dark:text-white">
											{student.username || student.alias || 'Sin nombre'}
										</div>
									</TableBodyCell>
									<TableBodyCell>
										{#if student.isCompleted}
											<Badge color="green">Completado</Badge>
										{:else if student.inProgress}
											<Badge color="yellow">En Progreso</Badge>
										{:else}
											<Badge color="gray">Pendiente</Badge>
										{/if}
									</TableBodyCell>
									<TableBodyCell>
										{formatDate(student.lastActivity)}
									</TableBodyCell>
									<TableBodyCell>
										<div class="flex items-center">
											<span class="font-medium">{student.totalMessages}</span>
											{#if student.inProgress}
												<span class="ml-2 text-xs text-blue-500">
													{student.hasCompletionMarker
														? `Falta llegar a ${data.requiresMinMessages} mensajes`
														: '(Falta marca finalización)'}
												</span>
											{/if}
										</div>
									</TableBodyCell>
									<TableBodyCell>
										<div class="font-medium">{student.chats.length}</div>
									</TableBodyCell>
								</TableBodyRow>
							{/each}

							{#if standardStudents.length === 0}
								<TableBodyRow>
									<TableBodyCell colspan={6} class="text-center py-4">
										No hay estudiantes inscritos en este curso
									</TableBodyCell>
								</TableBodyRow>
							{/if}
						</TableBody>
					</Table>
				</div>
			</div>
		{/if}
	</div>
</div>
