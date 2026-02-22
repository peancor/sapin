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
		Checkbox,
		Toast,
		Input,
		Dropdown,
		DropdownItem
	} from 'flowbite-svelte';
	import { GraduationCap, UserPlus, Trash2, Search, X, Upload, Download, Menu } from 'lucide-svelte';

	interface ImportResult {
		status: 'success' | 'error';
		email: string;
		rowNumber?: number;
		message?: string;
	}

	let { data, form }: { data: PageData; form: ActionData } = $props();

	// Search state
	let searchTerm = $state('');
	let addSearchTerm = $state('');

	// Modal states
	let showAddModal = $state(false);
	let showRemoveModal = $state(false);
	let showBulkRemoveModal = $state(false);
	let showImportModal = $state(false);
	let showImportResultsModal = $state(false);
	let studentToRemove = $state<{ id: string; name: string } | null>(null);

	// Selection state
	let selectedStudents = $state<string[]>([]);
	let selectedToAdd = $state<string[]>([]);
	let allSelected = $state(false);

	// Loading states
	let isProcessing = $state(false);
	let isImporting = $state(false);

	// Import state
	let csvFile = $state<File | null>(null);
	let importResults = $state<ImportResult[]>([]);
	let importSummary = $state<{ total: number; success: number; errors: number }>({
		total: 0,
		success: 0,
		errors: 0
	});
	let importValidationError = $state<string | null>(null);

	// Toast state
	let showToast = $state(false);
	let toastMessage = $state('');
	let toastType = $state<'success' | 'error'>('success');

	// Filtered students
	let filteredStudents = $derived.by(() => {
		if (!searchTerm) return data.students;
		const term = searchTerm.toLowerCase();
		return data.students.filter(
			(s) =>
				s.username?.toLowerCase().includes(term) || s.email?.toLowerCase().includes(term)
		);
	});

	// Filtered available students for add modal
	let filteredAvailableStudents = $derived.by(() => {
		if (!addSearchTerm) return data.availableStudents;
		const term = addSearchTerm.toLowerCase();
		return data.availableStudents.filter(
			(s) =>
				s.username?.toLowerCase().includes(term) || s.email?.toLowerCase().includes(term)
		);
	});

	// Show toast on form result
	$effect(() => {
		if (form?.success) {
			showToastMessage(form.message || 'Operación completada', 'success');
			showAddModal = false;
			showRemoveModal = false;
			showBulkRemoveModal = false;
			selectedStudents = [];
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
	function toggleSelection(studentId: string) {
		if (selectedStudents.includes(studentId)) {
			selectedStudents = selectedStudents.filter((id) => id !== studentId);
			allSelected = false;
		} else {
			selectedStudents = [...selectedStudents, studentId];
			allSelected = selectedStudents.length === filteredStudents.length;
		}
	}

	// Toggle all selection
	function toggleSelectAll() {
		if (allSelected) {
			selectedStudents = [];
			allSelected = false;
		} else {
			selectedStudents = filteredStudents.map((s) => s.id);
			allSelected = true;
		}
	}

	// Toggle selection in add modal
	function toggleAddSelection(studentId: string) {
		if (selectedToAdd.includes(studentId)) {
			selectedToAdd = selectedToAdd.filter((id) => id !== studentId);
		} else {
			selectedToAdd = [...selectedToAdd, studentId];
		}
	}

	// Confirm remove single student
	function confirmRemove(student: (typeof data.students)[0]) {
		studentToRemove = { id: student.id, name: student.username || 'Estudiante' };
		showRemoveModal = true;
	}

	// Confirm bulk remove
	function confirmBulkRemove() {
		if (selectedStudents.length > 0) {
			showBulkRemoveModal = true;
		}
	}

	// Handle file change for CSV import
	function handleFileChange(event: Event) {
		const input = event.target as HTMLInputElement;
		if (input.files && input.files.length > 0) {
			csvFile = input.files[0];
			importValidationError = null;
		}
	}

	// Handle CSV upload
	async function handleCsvUpload() {
		if (!csvFile) return;

		isImporting = true;
		importValidationError = null;

		const formData = new FormData();
		formData.append('file', csvFile);
		formData.append('courseId', data.courseId);

		try {
			const response = await fetch(`/api/courses/${data.courseId}/students/import`, {
				method: 'POST',
				body: formData
			});

			const responseData = await response.json();

			if (!response.ok) {
				if (response.status === 400) {
					importValidationError =
						responseData.message || responseData.error || 'Error de validación';
					isImporting = false;
					return;
				}
				throw new Error(responseData.message || responseData.error || 'Error desconocido');
			}

			importResults = responseData.results || [];
			importSummary = {
				total: responseData.totalProcessed || importResults.length,
				success:
					responseData.successCount ||
					importResults.filter((r: ImportResult) => r.status === 'success').length,
				errors: importResults.filter((r: ImportResult) => r.status === 'error').length
			};

			showImportModal = false;
			showImportResultsModal = true;
			csvFile = null;

			setTimeout(() => {
				invalidateAll();
			}, 1000);
		} catch (error) {
			console.error('Error importing students:', error);
			showToastMessage(
				'Error al importar: ' + (error instanceof Error ? error.message : 'Error desconocido'),
				'error'
			);
		} finally {
			isImporting = false;
		}
	}

	// Export students as CSV
	function exportStudents() {
		const studentsToExport =
			selectedStudents.length > 0
				? data.students.filter((s) => selectedStudents.includes(s.id))
				: data.students;

		const headers = ['ID', 'Username', 'Email'];
		const csvContent = [
			headers.join(','),
			...studentsToExport.map((student) =>
				[student.id, student.username || '', student.email || ''].join(',')
			)
		].join('\n');

		const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
		const url = URL.createObjectURL(blob);
		const link = document.createElement('a');
		link.setAttribute('href', url);
		link.setAttribute('download', `curso-${data.courseId}-estudiantes.csv`);
		link.style.visibility = 'hidden';
		document.body.appendChild(link);
		link.click();
		document.body.removeChild(link);

		showToastMessage(
			`Exportados ${studentsToExport.length} estudiante(s)`,
			'success'
		);
	}

	// Close import modal
	function closeImportModal() {
		showImportModal = false;
		csvFile = null;
		importValidationError = null;
	}

	// Close import results modal
	function closeImportResultsModal() {
		showImportResultsModal = false;
		importResults = [];
		importSummary = { total: 0, success: 0, errors: 0 };
	}
</script>

<div class="space-y-6">
	<!-- Page Header -->
	<div class="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
		<div>
			<h1 class="text-2xl font-bold text-gray-900 dark:text-white">Gestión de Estudiantes</h1>
			<p class="mt-1 text-gray-500 dark:text-gray-400">
				{data.students.length} estudiantes inscritos
			</p>
		</div>
		<div class="flex gap-2">
			<Button color="light">
				<Menu class="mr-2 h-4 w-4" />
				Acciones
			</Button>
			<Dropdown>
				<DropdownItem onclick={() => (showAddModal = true)}>
					<UserPlus class="mr-2 h-4 w-4" />
					Inscribir Estudiantes
				</DropdownItem>
				<DropdownItem onclick={() => (showImportModal = true)}>
					<Upload class="mr-2 h-4 w-4" />
					Importar desde CSV
				</DropdownItem>
				<DropdownItem onclick={exportStudents}>
					<Download class="mr-2 h-4 w-4" />
					Exportar como CSV
				</DropdownItem>
			</Dropdown>
		</div>
	</div>

	<!-- Search and Bulk Actions -->
	<div class="rounded-xl bg-white p-4 shadow-sm dark:bg-gray-800">
		<div class="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
			<!-- Search -->
			<div class="relative max-w-md flex-1">
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
			{#if selectedStudents.length > 0}
				<div class="flex items-center gap-3">
					<span class="text-sm text-gray-500 dark:text-gray-400">
						{selectedStudents.length} seleccionado(s)
					</span>
					<Button color="alternative" size="sm" onclick={exportStudents}>
						<Download class="mr-1 h-4 w-4" />
						Exportar
					</Button>
					<Button color="red" size="sm" onclick={confirmBulkRemove}>
						<Trash2 class="mr-1 h-4 w-4" />
						Dar de baja
					</Button>
					<Button
						color="alternative"
						size="sm"
						onclick={() => {
							selectedStudents = [];
							allSelected = false;
						}}
					>
						Cancelar
					</Button>
				</div>
			{/if}
		</div>
	</div>

	<!-- Students Table -->
	<div class="rounded-xl bg-white shadow-sm dark:bg-gray-800">
		{#if filteredStudents.length > 0}
			<div class="overflow-x-auto">
				<Table striped>
					<TableHead>
						<TableHeadCell class="w-12">
							<Checkbox checked={allSelected} onchange={toggleSelectAll} />
						</TableHeadCell>
						<TableHeadCell>Estudiante</TableHeadCell>
						<TableHeadCell>Email</TableHeadCell>
						<TableHeadCell class="w-20">
							<span class="sr-only">Acciones</span>
						</TableHeadCell>
					</TableHead>
					<TableBody>
						{#each filteredStudents as student (student.id)}
							<TableBodyRow>
								<TableBodyCell>
									<Checkbox
										checked={selectedStudents.includes(student.id)}
										onchange={() => toggleSelection(student.id)}
									/>
								</TableBodyCell>
								<TableBodyCell>
									<div class="flex items-center gap-3">
										<img
											src={student.image || '/images/default_avatar.png'}
											alt={student.username || 'Estudiante'}
											class="h-10 w-10 rounded-full object-cover"
										/>
										<span class="font-medium text-gray-900 dark:text-white">
											{student.username || 'Sin nombre'}
										</span>
									</div>
								</TableBodyCell>
								<TableBodyCell>
									<span class="text-gray-500 dark:text-gray-400">
										{student.email || '-'}
									</span>
								</TableBodyCell>
								<TableBodyCell>
									<Button
										size="xs"
										color="red"
										outline
										onclick={() => confirmRemove(student)}
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
				<GraduationCap class="mx-auto mb-4 h-12 w-12 text-gray-300 dark:text-gray-600" />
				{#if searchTerm}
					<h3 class="mb-2 text-lg font-medium text-gray-900 dark:text-white">Sin resultados</h3>
					<p class="text-gray-500 dark:text-gray-400">
						No se encontraron estudiantes que coincidan con "{searchTerm}"
					</p>
					<Button color="light" size="sm" class="mt-4" onclick={() => (searchTerm = '')}>
						Limpiar búsqueda
					</Button>
				{:else}
					<h3 class="mb-2 text-lg font-medium text-gray-900 dark:text-white">
						Sin estudiantes inscritos
					</h3>
					<p class="text-gray-500 dark:text-gray-400">
						Inscribe estudiantes para que puedan acceder al curso
					</p>
					<div class="mt-4 flex justify-center gap-2">
						<Button color="primary" size="sm" onclick={() => (showAddModal = true)}>
							<UserPlus class="mr-2 h-4 w-4" />
							Inscribir
						</Button>
						<Button color="alternative" size="sm" onclick={() => (showImportModal = true)}>
							<Upload class="mr-2 h-4 w-4" />
							Importar CSV
						</Button>
					</div>
				{/if}
			</div>
		{/if}
	</div>
</div>

<!-- Add Students Modal -->
<Modal title="Inscribir Estudiantes" bind:open={showAddModal} size="lg">
	<div class="space-y-4">
		<!-- Search in modal -->
		<div class="relative">
			<div class="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-3">
				<Search class="h-4 w-4 text-gray-400" />
			</div>
			<Input
				type="text"
				placeholder="Buscar usuarios disponibles..."
				bind:value={addSearchTerm}
				class="pl-10"
			/>
		</div>

		{#if filteredAvailableStudents.length > 0}
			<div class="max-h-80 overflow-y-auto rounded-lg border border-gray-200 dark:border-gray-700">
				{#each filteredAvailableStudents as student (student.id)}
					<label
						class="flex cursor-pointer items-center gap-3 border-b border-gray-100 p-3 transition-colors last:border-b-0 hover:bg-gray-50 dark:border-gray-700 dark:hover:bg-gray-700"
					>
						<Checkbox
							checked={selectedToAdd.includes(student.id)}
							onchange={() => toggleAddSelection(student.id)}
						/>
						<img
							src={student.image || '/images/default_avatar.png'}
							alt={student.username || 'Usuario'}
							class="h-8 w-8 rounded-full object-cover"
						/>
						<div class="flex-1">
							<p class="font-medium text-gray-900 dark:text-white">
								{student.username || 'Sin nombre'}
							</p>
							<p class="text-sm text-gray-500 dark:text-gray-400">{student.email}</p>
						</div>
					</label>
				{/each}
			</div>
			{#if selectedToAdd.length > 0}
				<p class="text-sm text-gray-500 dark:text-gray-400">
					{selectedToAdd.length} estudiante(s) seleccionado(s)
				</p>
			{/if}
		{:else if addSearchTerm}
			<p class="py-8 text-center text-gray-500 dark:text-gray-400">
				No se encontraron usuarios que coincidan con "{addSearchTerm}"
			</p>
		{:else}
			<p class="py-8 text-center text-gray-500 dark:text-gray-400">
				No hay más usuarios disponibles para inscribir
			</p>
		{/if}
	</div>

	{#snippet footer()}
		<form
			method="POST"
			action="?/addStudents"
			use:enhance={() => {
				isProcessing = true;
				return async ({ update }) => {
					isProcessing = false;
					await update();
					await invalidateAll();
				};
			}}
		>
			<input type="hidden" name="studentIds" value={JSON.stringify(selectedToAdd)} />
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
						Inscribiendo...
					{:else}
						Inscribir ({selectedToAdd.length})
					{/if}
				</Button>
			</div>
		</form>
	{/snippet}
</Modal>

<!-- Import CSV Modal -->
<Modal title="Importar Estudiantes desde CSV" bind:open={showImportModal} size="md">
	<div class="space-y-4">
		{#if importValidationError}
			<div
				class="rounded-lg border border-red-300 bg-red-100 p-4 dark:border-red-700 dark:bg-red-900/20"
			>
				<p class="font-semibold text-red-800 dark:text-red-200">Error en la validación:</p>
				<p class="mt-1 text-sm text-red-700 dark:text-red-300">{importValidationError}</p>
			</div>
		{/if}

		<p class="text-sm text-gray-600 dark:text-gray-400">
			Sube un archivo CSV con las columnas: <strong>id, email, firstname, lastname, fullname</strong>
		</p>

		{#if isImporting}
			<div class="flex flex-col items-center justify-center py-8">
				<div class="mb-4 h-12 w-12 animate-spin rounded-full border-b-2 border-purple-600"></div>
				<p class="text-gray-600 dark:text-gray-400">Importando estudiantes...</p>
			</div>
		{:else}
			<input
				type="file"
				accept=".csv"
				onchange={handleFileChange}
				disabled={isImporting}
				class="block w-full cursor-pointer rounded-lg border border-gray-300 bg-gray-50 text-sm text-gray-900 focus:outline-none disabled:cursor-not-allowed disabled:opacity-50 dark:border-gray-600 dark:bg-gray-700 dark:text-gray-400 dark:placeholder-gray-400"
			/>

			<div class="rounded bg-blue-50 p-3 text-xs text-gray-500 dark:bg-blue-900/20 dark:text-gray-400">
				<p class="mb-2 font-semibold">Requisitos del CSV:</p>
				<ul class="list-inside list-disc space-y-1">
					<li>Codificación: UTF-8 o Windows-1252</li>
					<li>Separador: coma (,)</li>
					<li>Columnas requeridas: id, email, firstname, lastname, fullname</li>
					<li>Email debe ser válido</li>
				</ul>
			</div>
		{/if}
	</div>

	{#snippet footer()}
		<div class="flex justify-end gap-2">
			<Button color="alternative" onclick={closeImportModal} disabled={isImporting}>
				Cancelar
			</Button>
			<Button color="primary" onclick={handleCsvUpload} disabled={!csvFile || isImporting}>
				<Upload class="mr-2 h-4 w-4" />
				Importar
			</Button>
		</div>
	{/snippet}
</Modal>

<!-- Import Results Modal -->
<Modal title="Resultados de la Importación" bind:open={showImportResultsModal} size="lg">
	<div class="space-y-4">
		<!-- Summary -->
		<div class="grid grid-cols-3 gap-4">
			<div class="rounded-lg bg-blue-50 p-3 dark:bg-blue-900/20">
				<p class="text-xs text-gray-600 dark:text-gray-400">Total</p>
				<p class="text-2xl font-bold text-blue-600 dark:text-blue-400">{importSummary.total}</p>
			</div>
			<div class="rounded-lg bg-green-50 p-3 dark:bg-green-900/20">
				<p class="text-xs text-gray-600 dark:text-gray-400">Exitosos</p>
				<p class="text-2xl font-bold text-green-600 dark:text-green-400">{importSummary.success}</p>
			</div>
			<div class="rounded-lg bg-red-50 p-3 dark:bg-red-900/20">
				<p class="text-xs text-gray-600 dark:text-gray-400">Errores</p>
				<p class="text-2xl font-bold text-red-600 dark:text-red-400">{importSummary.errors}</p>
			</div>
		</div>

		<!-- Detailed results -->
		{#if importResults.length > 0}
			<div>
				<h4 class="mb-3 font-semibold dark:text-white">Detalles:</h4>
				<div class="max-h-96 space-y-2 overflow-y-auto">
					{#each importResults as result (result.rowNumber || result.email)}
						<div
							class="flex items-start gap-3 rounded p-3 {result.status === 'success'
								? 'bg-green-50 dark:bg-green-900/20'
								: 'bg-red-50 dark:bg-red-900/20'}"
						>
							<div class="mt-0.5 flex-shrink-0">
								{#if result.status === 'success'}
									<svg class="h-5 w-5 text-green-600 dark:text-green-400" fill="currentColor" viewBox="0 0 20 20">
										<path fill-rule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clip-rule="evenodd"></path>
									</svg>
								{:else}
									<svg class="h-5 w-5 text-red-600 dark:text-red-400" fill="currentColor" viewBox="0 0 20 20">
										<path fill-rule="evenodd" d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" clip-rule="evenodd"></path>
									</svg>
								{/if}
							</div>
							<div class="min-w-0 flex-1">
								<div class="flex items-center gap-2">
									<p class="text-sm font-medium {result.status === 'success' ? 'text-green-800 dark:text-green-200' : 'text-red-800 dark:text-red-200'}">
										{result.email}
									</p>
									{#if result.rowNumber}
										<span class="rounded bg-gray-300 px-2 py-0.5 text-xs text-gray-700 dark:bg-gray-600 dark:text-gray-300">
											Fila {result.rowNumber}
										</span>
									{/if}
								</div>
								{#if result.message}
									<p class="mt-1 text-xs {result.status === 'success' ? 'text-green-700 dark:text-green-300' : 'text-red-700 dark:text-red-300'}">
										{result.message}
									</p>
								{/if}
							</div>
						</div>
					{/each}
				</div>
			</div>
		{/if}
	</div>

	{#snippet footer()}
		<div class="flex justify-end">
			<Button color="primary" onclick={closeImportResultsModal}>Cerrar</Button>
		</div>
	{/snippet}
</Modal>

<!-- Remove Single Student Modal -->
<Modal bind:open={showRemoveModal} size="sm">
	<div class="text-center">
		<Trash2 class="mx-auto mb-4 h-12 w-12 text-red-500" />
		<h3 class="mb-2 text-lg font-semibold text-gray-900 dark:text-white">
			¿Dar de baja al estudiante?
		</h3>
		<p class="mb-6 text-gray-500 dark:text-gray-400">
			<strong>{studentToRemove?.name}</strong> perderá acceso a este curso.
		</p>
		<form
			method="POST"
			action="?/removeStudent"
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
			<input type="hidden" name="studentId" value={studentToRemove?.id} />
			<Button color="alternative" onclick={() => (showRemoveModal = false)}>Cancelar</Button>
			<Button type="submit" color="red" disabled={isProcessing}>
				{#if isProcessing}
					Procesando...
				{:else}
					Dar de baja
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
			¿Dar de baja a {selectedStudents.length} estudiantes?
		</h3>
		<p class="mb-6 text-gray-500 dark:text-gray-400">
			Los estudiantes seleccionados perderán acceso a este curso.
		</p>
		<form
			method="POST"
			action="?/removeStudentsBulk"
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
			<input type="hidden" name="studentIds" value={JSON.stringify(selectedStudents)} />
			<Button color="alternative" onclick={() => (showBulkRemoveModal = false)}>Cancelar</Button>
			<Button type="submit" color="red" disabled={isProcessing}>
				{#if isProcessing}
					Procesando...
				{:else}
					Dar de baja ({selectedStudents.length})
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
