<script lang="ts">
	import type { PageData, ActionData } from './$types';
	import { enhance } from '$app/forms';
	import { invalidateAll } from '$app/navigation';
	import {
		Button,
		Modal,
		Table,
		TableBody,
		TableBodyCell,
		TableBodyRow,
		TableHead,
		TableHeadCell,
		Badge,
		Checkbox,
		Toast,
		Input
	} from 'flowbite-svelte';
	import { Users, UserPlus, Trash2, Search, X } from 'lucide-svelte';

	let { data, form }: { data: PageData; form: ActionData } = $props();

	// Search state
	let searchTerm = $state('');
	let addSearchTerm = $state('');

	// Modal states
	let showAddModal = $state(false);
	let showRemoveModal = $state(false);
	let showBulkRemoveModal = $state(false);
	let teacherToRemove = $state<{ id: string; name: string } | null>(null);

	// Selection state
	let selectedTeachers = $state<string[]>([]);
	let selectedToAdd = $state<string[]>([]);
	let allSelected = $state(false);

	// Loading states
	let isProcessing = $state(false);

	// Toast state
	let showToast = $state(false);
	let toastMessage = $state('');
	let toastType = $state<'success' | 'error'>('success');

	// Filtered teachers
	let filteredTeachers = $derived.by(() => {
		if (!searchTerm) return data.teachers;
		const term = searchTerm.toLowerCase();
		return data.teachers.filter(
			(t) =>
				t.username?.toLowerCase().includes(term) || t.email?.toLowerCase().includes(term)
		);
	});

	// Filtered available teachers for add modal
	let filteredAvailableTeachers = $derived.by(() => {
		if (!addSearchTerm) return data.availableTeachers;
		const term = addSearchTerm.toLowerCase();
		return data.availableTeachers.filter(
			(t) =>
				t.username?.toLowerCase().includes(term) || t.email?.toLowerCase().includes(term)
		);
	});

	// Show toast on form result
	$effect(() => {
		if (form?.success) {
			showToastMessage(form.message || 'Operación completada', 'success');
			showAddModal = false;
			showRemoveModal = false;
			showBulkRemoveModal = false;
			selectedTeachers = [];
			selectedToAdd = [];
			allSelected = false;
		} else if (form?.error) {
			showToastMessage(form.error, 'error');
		}
	});

	function showToastMessage(message: string, type: 'success' | 'error') {
		toastMessage = message;
		toastType = type;
		showToast = true;
		setTimeout(() => (showToast = false), 3000);
	}

	// Toggle single selection
	function toggleSelection(teacherId: string) {
		if (selectedTeachers.includes(teacherId)) {
			selectedTeachers = selectedTeachers.filter((id) => id !== teacherId);
			allSelected = false;
		} else {
			selectedTeachers = [...selectedTeachers, teacherId];
			allSelected = selectedTeachers.length === filteredTeachers.length;
		}
	}

	// Toggle all selection
	function toggleSelectAll() {
		if (allSelected) {
			selectedTeachers = [];
			allSelected = false;
		} else {
			selectedTeachers = filteredTeachers.map((t) => t.id);
			allSelected = true;
		}
	}

	// Toggle selection in add modal
	function toggleAddSelection(teacherId: string) {
		if (selectedToAdd.includes(teacherId)) {
			selectedToAdd = selectedToAdd.filter((id) => id !== teacherId);
		} else {
			selectedToAdd = [...selectedToAdd, teacherId];
		}
	}

	// Confirm remove single teacher
	function confirmRemove(teacher: (typeof data.teachers)[0]) {
		teacherToRemove = { id: teacher.id, name: teacher.username || 'Profesor' };
		showRemoveModal = true;
	}

	// Confirm bulk remove
	function confirmBulkRemove() {
		if (selectedTeachers.length > 0) {
			showBulkRemoveModal = true;
		}
	}

	// Role badge helpers
	function getRoleBadgeColor(role: string): 'purple' | 'red' | 'blue' | 'green' | 'gray' {
		switch (role) {
			case 'owner':
				return 'purple';
			case 'admin':
				return 'red';
			case 'teacher':
				return 'blue';
			case 'assistant':
				return 'green';
			default:
				return 'gray';
		}
	}

	function getRoleDisplayName(role: string) {
		switch (role) {
			case 'owner':
				return 'Propietario';
			case 'admin':
				return 'Administrador';
			case 'teacher':
				return 'Profesor';
			case 'assistant':
				return 'Asistente';
			default:
				return role;
		}
	}
</script>

<div class="space-y-6">
	<!-- Page Header -->
	<div class="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
		<div>
			<h1 class="text-2xl font-bold text-gray-900 dark:text-white">Gestión de Profesores</h1>
			<p class="mt-1 text-gray-500 dark:text-gray-400">
				{data.teachers.length} profesores asignados al curso
			</p>
		</div>
		<Button color="primary" onclick={() => (showAddModal = true)}>
			<UserPlus class="mr-2 h-4 w-4" />
			Añadir Profesores
		</Button>
	</div>

	<!-- Search and Bulk Actions -->
	<div class="rounded-xl bg-white p-4 shadow-sm dark:bg-gray-800">
		<div class="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
			<!-- Search -->
			<div class="relative flex-1 max-w-md">
				<div class="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-3">
					<Search class="h-4 w-4 text-gray-400" />
				</div>
				<Input
					type="text"
					placeholder="Buscar por nombre o email..."
					bind:value={searchTerm}
					class="pl-10"
				/>
				{#if searchTerm}
					<button
						onclick={() => (searchTerm = '')}
						class="absolute inset-y-0 right-0 flex items-center pr-3 text-gray-400 hover:text-gray-600"
					>
						<X class="h-4 w-4" />
					</button>
				{/if}
			</div>

			<!-- Bulk Actions -->
			{#if selectedTeachers.length > 0}
				<div class="flex items-center gap-3">
					<span class="text-sm text-gray-500 dark:text-gray-400">
						{selectedTeachers.length} seleccionado(s)
					</span>
					<Button color="red" size="sm" onclick={confirmBulkRemove}>
						<Trash2 class="mr-1 h-4 w-4" />
						Eliminar
					</Button>
					<Button
						color="alternative"
						size="sm"
						onclick={() => {
							selectedTeachers = [];
							allSelected = false;
						}}
					>
						Cancelar
					</Button>
				</div>
			{/if}
		</div>
	</div>

	<!-- Teachers Table -->
	<div class="rounded-xl bg-white shadow-sm dark:bg-gray-800">
		{#if filteredTeachers.length > 0}
			<div class="overflow-x-auto">
				<Table striped>
					<TableHead>
						<TableHeadCell class="w-12">
							<Checkbox checked={allSelected} onchange={toggleSelectAll} />
						</TableHeadCell>
						<TableHeadCell>Profesor</TableHeadCell>
						<TableHeadCell>Email</TableHeadCell>
						<TableHeadCell>Rol</TableHeadCell>
						<TableHeadCell class="w-20">
							<span class="sr-only">Acciones</span>
						</TableHeadCell>
					</TableHead>
					<TableBody>
						{#each filteredTeachers as teacher (teacher.id)}
							<TableBodyRow>
								<TableBodyCell>
									<Checkbox
										checked={selectedTeachers.includes(teacher.id)}
										onchange={() => toggleSelection(teacher.id)}
									/>
								</TableBodyCell>
								<TableBodyCell>
									<div class="flex items-center gap-3">
										<img
											src={teacher.image || '/images/default_avatar.png'}
											alt={teacher.username || 'Profesor'}
											class="h-10 w-10 rounded-full object-cover"
										/>
										<span class="font-medium text-gray-900 dark:text-white">
											{teacher.username || 'Sin nombre'}
										</span>
									</div>
								</TableBodyCell>
								<TableBodyCell>
									<span class="text-gray-500 dark:text-gray-400">
										{teacher.email || '-'}
									</span>
								</TableBodyCell>
								<TableBodyCell>
									<Badge color={getRoleBadgeColor(teacher.role)}>
										{getRoleDisplayName(teacher.role)}
									</Badge>
								</TableBodyCell>
								<TableBodyCell>
									<Button
										size="xs"
										color="red"
										outline
										onclick={() => confirmRemove(teacher)}
									>
										<Trash2 class="h-4 w-4" />
									</Button>
								</TableBodyCell>
							</TableBodyRow>
						{/each}
					</TableBody>
				</Table>
			</div>
		{:else}
			<div class="p-12 text-center">
				<Users class="mx-auto mb-4 h-12 w-12 text-gray-300 dark:text-gray-600" />
				{#if searchTerm}
					<h3 class="mb-2 text-lg font-medium text-gray-900 dark:text-white">Sin resultados</h3>
					<p class="text-gray-500 dark:text-gray-400">
						No se encontraron profesores que coincidan con "{searchTerm}"
					</p>
					<Button color="light" size="sm" class="mt-4" onclick={() => (searchTerm = '')}>
						Limpiar búsqueda
					</Button>
				{:else}
					<h3 class="mb-2 text-lg font-medium text-gray-900 dark:text-white">
						Sin profesores asignados
					</h3>
					<p class="text-gray-500 dark:text-gray-400">
						Añade profesores para que puedan gestionar el curso
					</p>
					<Button color="primary" size="sm" class="mt-4" onclick={() => (showAddModal = true)}>
						<UserPlus class="mr-2 h-4 w-4" />
						Añadir primer profesor
					</Button>
				{/if}
			</div>
		{/if}
	</div>
</div>

<!-- Add Teachers Modal -->
<Modal title="Añadir Profesores" bind:open={showAddModal} size="lg">
	<div class="space-y-4">
		<!-- Search in modal -->
		<div class="relative">
			<div class="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-3">
				<Search class="h-4 w-4 text-gray-400" />
			</div>
			<Input
				type="text"
				placeholder="Buscar profesores disponibles..."
				bind:value={addSearchTerm}
				class="pl-10"
			/>
		</div>

		{#if filteredAvailableTeachers.length > 0}
			<div class="max-h-80 overflow-y-auto rounded-lg border border-gray-200 dark:border-gray-700">
				{#each filteredAvailableTeachers as teacher (teacher.id)}
					<label
						class="flex cursor-pointer items-center gap-3 border-b border-gray-100 p-3 transition-colors last:border-b-0 hover:bg-gray-50 dark:border-gray-700 dark:hover:bg-gray-700"
					>
						<Checkbox
							checked={selectedToAdd.includes(teacher.id)}
							onchange={() => toggleAddSelection(teacher.id)}
						/>
						<img
							src={teacher.image || '/images/default_avatar.png'}
							alt={teacher.username || 'Profesor'}
							class="h-8 w-8 rounded-full object-cover"
						/>
						<div class="flex-1">
							<p class="font-medium text-gray-900 dark:text-white">
								{teacher.username || 'Sin nombre'}
							</p>
							<p class="text-sm text-gray-500 dark:text-gray-400">{teacher.email}</p>
						</div>
					</label>
				{/each}
			</div>
			{#if selectedToAdd.length > 0}
				<p class="text-sm text-gray-500 dark:text-gray-400">
					{selectedToAdd.length} profesor(es) seleccionado(s)
				</p>
			{/if}
		{:else if addSearchTerm}
			<p class="py-8 text-center text-gray-500 dark:text-gray-400">
				No se encontraron profesores que coincidan con "{addSearchTerm}"
			</p>
		{:else}
			<p class="py-8 text-center text-gray-500 dark:text-gray-400">
				No hay más profesores disponibles para añadir
			</p>
		{/if}
	</div>

	{#snippet footer()}
		<form
			method="POST"
			action="?/addTeachers"
			use:enhance={() => {
				isProcessing = true;
				return async ({ update }) => {
					isProcessing = false;
					await update();
					await invalidateAll();
				};
			}}
		>
			<input type="hidden" name="teacherIds" value={JSON.stringify(selectedToAdd)} />
			<div class="flex justify-end gap-3">
				<Button
					color="alternative"
					onclick={() => {
						showAddModal = false;
						selectedToAdd = [];
						addSearchTerm = '';
					}}
				>
					Cancelar
				</Button>
				<Button type="submit" color="primary" disabled={selectedToAdd.length === 0 || isProcessing}>
					{#if isProcessing}
						Añadiendo...
					{:else}
						Añadir Seleccionados ({selectedToAdd.length})
					{/if}
				</Button>
			</div>
		</form>
	{/snippet}
</Modal>

<!-- Remove Single Teacher Modal -->
<Modal bind:open={showRemoveModal} size="sm">
	<div class="text-center">
		<Trash2 class="mx-auto mb-4 h-12 w-12 text-red-500" />
		<h3 class="mb-2 text-lg font-semibold text-gray-900 dark:text-white">
			¿Eliminar profesor?
		</h3>
		<p class="mb-6 text-gray-500 dark:text-gray-400">
			<strong>{teacherToRemove?.name}</strong> ya no tendrá acceso a este curso.
		</p>
		<form
			method="POST"
			action="?/removeTeacher"
			use:enhance={() => {
				isProcessing = true;
				return async ({ update }) => {
					isProcessing = false;
					await update();
					await invalidateAll();
				};
			}}
			class="flex justify-center gap-3"
		>
			<input type="hidden" name="teacherId" value={teacherToRemove?.id} />
			<Button color="alternative" onclick={() => (showRemoveModal = false)}>Cancelar</Button>
			<Button type="submit" color="red" disabled={isProcessing}>
				{#if isProcessing}
					Eliminando...
				{:else}
					Eliminar
				{/if}
			</Button>
		</form>
	</div>
</Modal>

<!-- Bulk Remove Modal -->
<Modal bind:open={showBulkRemoveModal} size="sm">
	<div class="text-center">
		<Trash2 class="mx-auto mb-4 h-12 w-12 text-red-500" />
		<h3 class="mb-2 text-lg font-semibold text-gray-900 dark:text-white">
			¿Eliminar {selectedTeachers.length} profesores?
		</h3>
		<p class="mb-6 text-gray-500 dark:text-gray-400">
			Los profesores seleccionados perderán acceso a este curso.
		</p>
		<form
			method="POST"
			action="?/removeTeachersBulk"
			use:enhance={() => {
				isProcessing = true;
				return async ({ update }) => {
					isProcessing = false;
					await update();
					await invalidateAll();
				};
			}}
			class="flex justify-center gap-3"
		>
			<input type="hidden" name="teacherIds" value={JSON.stringify(selectedTeachers)} />
			<Button color="alternative" onclick={() => (showBulkRemoveModal = false)}>Cancelar</Button>
			<Button type="submit" color="red" disabled={isProcessing}>
				{#if isProcessing}
					Eliminando...
				{:else}
					Eliminar {selectedTeachers.length}
				{/if}
			</Button>
		</form>
	</div>
</Modal>

<!-- Toast notification -->
{#if showToast}
	<div class="fixed right-4 bottom-4 z-50">
		<Toast color={toastType === 'success' ? 'green' : 'red'}>
			{#snippet icon()}
				{#if toastType === 'success'}
					<svg class="h-5 w-5" fill="currentColor" viewBox="0 0 20 20">
						<path
							fill-rule="evenodd"
							d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z"
							clip-rule="evenodd"
						></path>
					</svg>
				{:else}
					<svg class="h-5 w-5" fill="currentColor" viewBox="0 0 20 20">
						<path
							fill-rule="evenodd"
							d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z"
							clip-rule="evenodd"
						></path>
					</svg>
				{/if}
			{/snippet}
			{toastMessage}
		</Toast>
	</div>
{/if}
