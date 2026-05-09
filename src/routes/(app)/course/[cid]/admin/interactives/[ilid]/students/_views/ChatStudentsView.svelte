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
	import { Calendar, MessageSquare, Users } from 'lucide-svelte';
	import type { PageData } from '../$types';
	import { downloadCSV, formatDate, sortCsvRowsByStudent } from '../viewUtils';

	type ChatStudentsData = Extract<PageData, { view: 'chat' }>;

	let { data }: { data: ChatStudentsData } = $props();

	async function exportToCSV(): Promise<void> {
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
		const sortedStudents = sortCsvRowsByStudent(
			data.students,
			(student) => student.username || student.alias || 'Sin nombre',
			(student) => `${student.email ?? ''}\u0000${student.id}`
		);
		const rows = [
			headers,
			...sortedStudents.map((student) => [
				student.username || student.alias || 'Sin nombre',
				student.isCompleted ? 'Completado' : student.inProgress ? 'En Progreso' : 'Pendiente',
				formatDate(student.lastActivity),
				student.totalMessages,
				student.chats.length,
				student.totalKeypresses,
				student.totalPastes,
				student.totalTimeSpentSeconds
			])
		];

		await downloadCSV(rows, 'estudiantes_chat.csv');
	}
</script>

<div class="rounded-lg bg-white p-4 shadow dark:bg-gray-800">
	<div class="mb-4 flex items-center justify-between">
		<h2 class="flex items-center text-xl font-semibold text-gray-900 dark:text-white">
			<Users class="mr-2 h-5 w-5 text-blue-500" />
			Actividad de chat
		</h2>
		<button
			class="rounded bg-blue-500 px-4 py-2 font-bold text-white hover:bg-blue-700"
			onclick={exportToCSV}
		>
			Exportar a CSV
		</button>
	</div>

	<div class="mb-4 rounded-lg bg-blue-50 p-3 dark:bg-blue-900">
		<p class="font-medium text-blue-800 dark:text-blue-200">Criterios de estado del chat</p>
		<ul class="mt-2 ml-5 list-disc text-sm text-blue-700 dark:text-blue-300">
			<li>Se considera acceso cuando existe al menos un chat en la actividad.</li>
			<li>
				Se considera completado cuando el estudiante llega a {data.requiresMinMessages}
				mensajes y uno contiene <code>[[DONE]]</code>.
			</li>
			<li>Si hay actividad pero no cumple cierre, se muestra como en progreso.</li>
		</ul>
	</div>

	<div class="mb-6 grid grid-cols-1 gap-4 md:grid-cols-3">
		<div class="rounded-lg bg-blue-50 p-4 dark:bg-blue-900">
			<div class="flex items-center">
				<div class="rounded bg-blue-100 p-2 dark:bg-blue-800">
					<Users class="h-6 w-6 text-blue-600 dark:text-blue-400" />
				</div>
				<div class="ml-3">
					<p class="text-sm text-gray-600 dark:text-gray-400">Estudiantes activos</p>
					<p class="text-xl font-bold dark:text-white">
						{data.students.filter((student) => student.hasActivity).length} / {data.students.length}
					</p>
				</div>
			</div>
		</div>

		<div class="rounded-lg bg-green-50 p-4 dark:bg-green-900">
			<div class="flex items-center">
				<div class="rounded bg-green-100 p-2 dark:bg-green-800">
					<MessageSquare class="h-6 w-6 text-green-600 dark:text-green-400" />
				</div>
				<div class="ml-3">
					<p class="text-sm text-gray-600 dark:text-gray-400">Chats completados</p>
					<p class="text-xl font-bold dark:text-white">
						{data.students.filter((student) => student.isCompleted).length} / {data.students.length}
					</p>
				</div>
			</div>
		</div>

		<div class="rounded-lg bg-purple-50 p-4 dark:bg-purple-900">
			<div class="flex items-center">
				<div class="rounded bg-purple-100 p-2 dark:bg-purple-800">
					<Calendar class="h-6 w-6 text-purple-600 dark:text-purple-400" />
				</div>
				<div class="ml-3">
					<p class="text-sm text-gray-600 dark:text-gray-400">Promedio de mensajes</p>
					<p class="text-xl font-bold dark:text-white">
						{data.students.filter((student) => student.hasActivity).length > 0
							? Math.round(
									data.students.reduce((sum, student) => sum + student.totalMessages, 0) /
										data.students.filter((student) => student.hasActivity).length
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
				<TableHeadCell>Última actividad</TableHeadCell>
				<TableHeadCell>Mensajes</TableHeadCell>
				<TableHeadCell>Chats</TableHeadCell>
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
