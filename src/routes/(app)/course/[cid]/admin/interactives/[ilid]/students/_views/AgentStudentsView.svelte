<script lang="ts">
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
	import { Activity, Bot, Users } from 'lucide-svelte';
	import type { PageData } from '../$types';
	import {
		buildActivityStudentsCsvFilename,
		downloadCSV,
		formatDate,
		sortCsvRowsByStudent
	} from '../viewUtils';

	type AgentStudentsData = Extract<PageData, { view: 'agent' }>;

	let { data }: { data: AgentStudentsData } = $props();

	async function exportToCSV(): Promise<void> {
		const headers = [
			'Estudiante',
			'Estado',
			'Última Actividad',
			'Mensajes',
			'Sesiones',
			'Total Pulsaciones',
			'Total Pegados',
			'Tiempo Total (segundos)',
			'Progreso'
		];
		const sortedStudents = sortCsvRowsByStudent(
			data.students,
			(student) => student.username || student.alias || 'Sin nombre',
			(student) => `${student.email ?? ''}\u0000${student.id}`
		);
		const rows = [
			headers,
			...sortedStudents.map((student) => [
				student.username || student.alias || 'Sin nombre',
				student.isCompleted ? 'Completado' : student.inProgress ? 'En progreso' : 'Pendiente',
				formatDate(student.lastActivity),
				student.totalMessages,
				student.chats.length,
				student.totalKeypresses,
				student.totalPastes,
				student.totalTimeSpentSeconds,
				student.isCompleted ? 'Completado' : student.inProgress ? 'En curso' : 'Sin iniciar'
			])
		];

		await downloadCSV(rows, buildActivityStudentsCsvFilename('agent', data.interactive.name));
	}
</script>

<div class="rounded-lg bg-white p-4 shadow dark:bg-gray-800">
	<div class="mb-4 flex items-center justify-between">
		<h2 class="flex items-center text-xl font-semibold text-gray-900 dark:text-white">
			<Bot class="mr-2 h-5 w-5 text-green-500" />
			Actividad agéntica
		</h2>
		<button
			class="rounded bg-green-600 px-4 py-2 font-bold text-white hover:bg-green-700"
			onclick={exportToCSV}
		>
			Exportar a CSV
		</button>
	</div>

	<div class="mb-4 rounded-lg bg-green-50 p-3 dark:bg-green-900/40">
		<p class="font-medium text-green-800 dark:text-green-200">Criterios de estado del agente</p>
		<ul class="mt-2 ml-5 list-disc text-sm text-green-700 dark:text-green-300">
			<li>Se considera acceso cuando el alumnado abre al menos una sesión del agente.</li>
			<li>Se considera completado cuando el flujo del agente registra progreso completado.</li>
			<li>Si hay sesión pero no existe cierre pedagógico, se muestra como en progreso.</li>
		</ul>
	</div>

	<div class="mb-6 grid grid-cols-1 gap-4 md:grid-cols-3">
		<div class="rounded-lg bg-green-50 p-4 dark:bg-green-900/40">
			<div class="flex items-center">
				<div class="rounded bg-green-100 p-2 dark:bg-green-800">
					<Users class="h-6 w-6 text-green-600 dark:text-green-400" />
				</div>
				<div class="ml-3">
					<p class="text-sm text-gray-600 dark:text-gray-400">Estudiantes activos</p>
					<p class="text-xl font-bold dark:text-white">
						{data.students.filter((student) => student.hasActivity).length} / {data.students.length}
					</p>
				</div>
			</div>
		</div>

		<div class="rounded-lg bg-emerald-50 p-4 dark:bg-emerald-900/40">
			<div class="flex items-center">
				<div class="rounded bg-emerald-100 p-2 dark:bg-emerald-800">
					<Activity class="h-6 w-6 text-emerald-600 dark:text-emerald-400" />
				</div>
				<div class="ml-3">
					<p class="text-sm text-gray-600 dark:text-gray-400">Actividades completadas</p>
					<p class="text-xl font-bold dark:text-white">
						{data.students.filter((student) => student.isCompleted).length} / {data.students.length}
					</p>
				</div>
			</div>
		</div>

		<div class="rounded-lg bg-teal-50 p-4 dark:bg-teal-900/40">
			<div class="flex items-center">
				<div class="rounded bg-teal-100 p-2 dark:bg-teal-800">
					<Bot class="h-6 w-6 text-teal-600 dark:text-teal-400" />
				</div>
				<div class="ml-3">
					<p class="text-sm text-gray-600 dark:text-gray-400">Promedio de sesiones</p>
					<p class="text-xl font-bold dark:text-white">
						{data.students.length > 0
							? Math.round(
									(data.students.reduce((sum, student) => sum + student.chats.length, 0) /
										data.students.length) *
										10
								) / 10
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
				<TableHeadCell>Última actividad</TableHeadCell>
				<TableHeadCell>Mensajes</TableHeadCell>
				<TableHeadCell>Sesiones</TableHeadCell>
			</TableHead>
			<TableBody class="divide-y">
				{#each data.students as student (student.id)}
					<TableBodyRow>
						<TableBodyCell class="flex h-14 w-14 items-center justify-center p-4!">
							<Avatar
								src={student.image || '/images/default_avatar.png'}
								class="h-8 w-8"
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
								<Badge color="yellow">En progreso</Badge>
							{:else}
								<Badge color="gray">Pendiente</Badge>
							{/if}
						</TableBodyCell>
						<TableBodyCell>{formatDate(student.lastActivity)}</TableBodyCell>
						<TableBodyCell>
							<div class="font-medium">{student.totalMessages}</div>
						</TableBodyCell>
						<TableBodyCell>
							<div class="font-medium">{student.chats.length}</div>
						</TableBodyCell>
					</TableBodyRow>
				{:else}
					<TableBodyRow>
						<TableBodyCell colspan={6} class="py-4 text-center">
							No hay estudiantes inscritos en este curso
						</TableBodyCell>
					</TableBodyRow>
				{/each}
			</TableBody>
		</Table>
	</div>
</div>
