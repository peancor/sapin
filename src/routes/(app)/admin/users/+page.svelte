<script lang="ts">
	import type { PageData } from './$types';
	import { UserPlus, Trash2, PencilLine, Eye, Download, Search, Users, Filter } from 'lucide-svelte';
	import { breadcrumb } from '$lib/stores/breadcrumb';
	import UserForm from '$lib/components/UserForm.svelte';
	import { enhance } from '$app/forms';
	import { goto } from '$app/navigation';
	import { page } from '$app/stores';

	import {
		Table,
		TableBody,
		TableBodyCell,
		TableBodyRow,
		TableHead,
		TableHeadCell,
		Button,
		Checkbox,
		Badge,
		Avatar,
		Tooltip,
		Toast,
		Modal,
		PaginationNav
	} from 'flowbite-svelte';
	import { invalidateAll } from '$app/navigation';

	let { data }: { data: PageData } = $props();
	let showAddForm = $state(false);
	let showDeleteModal = $state(false);
	let userToDelete = $state<string | null>(null);

	// State for toast messages
	let showToast = $state(false);
	let toastMessage = $state('');
	let toastType = $state<'success' | 'error'>('success');

	// State for selected users
	let selectedUsers = $state<string[]>([]);
	let allSelected = $state(false);

	// Search and filter state (initialized from URL params via data)
	let searchTerm = $state('');
	let roleFilter = $state('all');

	// Sync filters from URL on data change
	$effect(() => {
		searchTerm = data.filters.search;
		roleFilter = data.filters.role;
	});

	const roleOptions = [
		{ value: 'all', name: 'Todos los roles' },
		{ value: 'student', name: 'Estudiantes' },
		{ value: 'teacher', name: 'Profesores' },
		{ value: 'admin', name: 'Administradores' }
	];

	$effect(() => {
		breadcrumb.set([
			{ label: 'Inicio', href: '/' },
			{ label: 'Administración', href: '/admin' },
			{ label: 'Usuarios', href: '/admin/users' }
		]);
	});

	const formatDate = (date: Date) => {
		return new Date(date).toLocaleDateString('es-ES', {
			day: '2-digit',
			month: 'short',
			year: 'numeric'
		});
	};

	function getRoleBadgeColor(role: string): 'purple' | 'red' | 'blue' | 'green' | 'yellow' {
		switch (role) {
			case 'super_admin':
				return 'red';
			case 'admin':
				return 'purple';
			case 'teacher':
				return 'blue';
			case 'assistant':
				return 'yellow';
			default:
				return 'green';
		}
	}

	function getRoleLabel(role: string) {
		switch (role) {
			case 'super_admin':
				return 'Super Admin';
			case 'admin':
				return 'Admin';
			case 'teacher':
				return 'Profesor';
			case 'assistant':
				return 'Asistente';
			default:
				return 'Estudiante';
		}
	}

	function getRoleBadgeColorByLevel(level: number): 'purple' | 'red' | 'blue' | 'green' | 'yellow' {
		if (level >= 100) return 'red';
		if (level >= 90) return 'purple';
		if (level >= 50) return 'blue';
		if (level >= 40) return 'yellow';
		return 'green';
	}

	// Navigation with filters
	function updateFilters() {
		const params = new URLSearchParams();
		if (searchTerm) params.set('search', searchTerm);
		if (roleFilter && roleFilter !== 'all') params.set('role', roleFilter);
		params.set('page', '1');
		goto(`?${params.toString()}`);
	}

	function handlePageChange(newPage: number) {
		const params = new URLSearchParams($page.url.searchParams);
		params.set('page', String(newPage));
		goto(`?${params.toString()}`);
	}

	function clearFilters() {
		searchTerm = '';
		roleFilter = 'all';
		goto('/admin/users');
	}

	// Display toast message
	function showToastMessage(message: string, type: 'success' | 'error') {
		toastMessage = message;
		toastType = type;
		showToast = true;
		setTimeout(() => {
			showToast = false;
		}, 3000);
	}

	// Handle toggle of a single user selection
	function toggleSelection(userId: string) {
		if (selectedUsers.includes(userId)) {
			selectedUsers = selectedUsers.filter((id) => id !== userId);
			allSelected = false;
		} else {
			selectedUsers = [...selectedUsers, userId];
			allSelected = selectedUsers.length === data.users.length;
		}
	}

	// Handle toggle of all users selection
	function toggleSelectAll() {
		if (allSelected) {
			selectedUsers = [];
			allSelected = false;
		} else {
			selectedUsers = data.users.map((user) => user.id);
			allSelected = true;
		}
	}

	// Show delete confirmation modal for a single user
	function confirmDeleteUser(userId: string) {
		userToDelete = userId;
		showDeleteModal = true;
	}

	// Handle single user deletion result
	function handleDeleteResult() {
		return async ({ result }: { result: { type: string } }) => {
			if (result.type === 'success') {
				showToastMessage('Usuario eliminado correctamente', 'success');
				showDeleteModal = false;
				userToDelete = null;
				invalidateAll();
			} else {
				showToastMessage('Error al eliminar usuario', 'error');
			}
		};
	}

	// Handle bulk deletion result
	function handleBulkDeleteResult() {
		return async ({ result }: { result: { type: string } }) => {
			if (result.type === 'success') {
				showToastMessage(`${selectedUsers.length} usuarios eliminados correctamente`, 'success');
				selectedUsers = [];
				allSelected = false;
				invalidateAll();
			} else {
				showToastMessage('Error al eliminar usuarios', 'error');
			}
		};
	}

	// Export users as CSV
	function exportUsers() {
		const usersToExport = data.users.filter(
			(user) => selectedUsers.length === 0 || selectedUsers.includes(user.id)
		);

		const headers = ['ID', 'Username', 'Email', 'Roles', 'Created At'];
		const csvContent = [
			headers.join(','),
			...usersToExport.map((user) =>
				[
					user.id,
					user.username || '',
					user.email,
					user.roles?.map(r => r.displayName).join(';') || 'Usuario',
					new Date(user.createdAt).toISOString()
				].join(',')
			)
		].join('\n');

		const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
		const url = URL.createObjectURL(blob);
		const link = document.createElement('a');
		link.setAttribute('href', url);
		link.setAttribute('download', 'users.csv');
		link.style.visibility = 'hidden';
		document.body.appendChild(link);
		link.click();
		document.body.removeChild(link);

		if (selectedUsers.length > 0) {
			showToastMessage(`Exportados ${selectedUsers.length} usuarios`, 'success');
		} else {
			showToastMessage(`Exportados ${usersToExport.length} usuarios`, 'success');
		}
	}
</script>

<div class="space-y-6">
	<!-- Header -->
	<div class="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
		<div>
			<h1 class="text-2xl font-bold text-gray-900 dark:text-white">Gestión de Usuarios</h1>
			<p class="mt-1 text-sm text-gray-500 dark:text-gray-400">
				{data.pagination.totalUsers} usuarios en total
			</p>
		</div>
		<Button color="primary" onclick={() => (showAddForm = true)} class="flex items-center gap-2">
			<UserPlus size={18} />
			Nuevo Usuario
		</Button>
	</div>

	<!-- Filters Card -->
	<div class="rounded-xl border border-gray-200 bg-white p-4 dark:border-gray-700 dark:bg-gray-800">
		<div class="flex flex-col gap-4 md:flex-row md:items-end">
			<!-- Search Input -->
			<div class="flex-1">
				<label for="search" class="mb-2 block text-sm font-medium text-gray-700 dark:text-gray-300">
					Buscar
				</label>
				<div class="relative">
					<div class="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-3">
						<Search size={16} class="text-gray-400" />
					</div>
					<input
						id="search"
						type="text"
						bind:value={searchTerm}
						placeholder="Buscar por nombre o email..."
						class="block w-full rounded-lg border border-gray-300 bg-gray-50 p-2.5 pl-10 text-sm text-gray-900 focus:border-primary-500 focus:ring-primary-500 dark:border-gray-600 dark:bg-gray-700 dark:text-white dark:placeholder-gray-400"
						onkeydown={(e) => e.key === 'Enter' && updateFilters()}
					/>
				</div>
			</div>

			<!-- Role Filter -->
			<div class="w-full md:w-48">
				<label for="role" class="mb-2 block text-sm font-medium text-gray-700 dark:text-gray-300">
					Rol
				</label>
				<select
					id="role"
					bind:value={roleFilter}
					class="block w-full rounded-lg border border-gray-300 bg-gray-50 p-2.5 text-sm text-gray-900 focus:border-primary-500 focus:ring-primary-500 dark:border-gray-600 dark:bg-gray-700 dark:text-white"
				>
					{#each roleOptions as option}
						<option value={option.value}>{option.name}</option>
					{/each}
				</select>
			</div>

			<!-- Filter Actions -->
			<div class="flex gap-2">
				<Button color="primary" onclick={updateFilters} class="flex items-center gap-2">
					<Filter size={16} />
					Filtrar
				</Button>
				{#if data.filters.search || data.filters.role !== 'all'}
					<Button color="alternative" onclick={clearFilters}>
						Limpiar
					</Button>
				{/if}
			</div>
		</div>
	</div>

	<!-- Bulk Actions -->
	{#if selectedUsers.length > 0}
		<div class="flex items-center gap-3 rounded-lg border border-primary-200 bg-primary-50 p-3 dark:border-primary-800 dark:bg-primary-900/20">
			<Users size={18} class="text-primary-600 dark:text-primary-400" />
			<span class="text-sm font-medium text-primary-700 dark:text-primary-300">
				{selectedUsers.length} usuario(s) seleccionado(s)
			</span>
			<div class="ml-auto flex gap-2">
				<form action="?/deleteBulk" method="POST" use:enhance={handleBulkDeleteResult}>
					<input type="hidden" name="userIds" value={JSON.stringify(selectedUsers)} />
					<Button color="red" size="xs" type="submit" class="flex items-center gap-1">
						<Trash2 size={14} />
						Eliminar
					</Button>
				</form>
				<Button color="light" size="xs" onclick={exportUsers} class="flex items-center gap-1">
					<Download size={14} />
					Exportar
				</Button>
				<Button
					color="alternative"
					size="xs"
					onclick={() => {
						selectedUsers = [];
						allSelected = false;
					}}
				>
					Cancelar
				</Button>
			</div>
		</div>
	{/if}

	<!-- Table Card -->
	<div class="rounded-xl border border-gray-200 bg-white dark:border-gray-700 dark:bg-gray-800">
		<div class="overflow-x-auto">
			<Table hoverable={true} striped={true} class="w-full">
				<TableHead class="bg-gray-50 dark:bg-gray-700">
					<TableHeadCell class="w-12 p-4!">
						<Checkbox checked={allSelected} onchange={toggleSelectAll} />
					</TableHeadCell>
					<TableHeadCell>Usuario</TableHeadCell>
					<TableHeadCell>Email</TableHeadCell>
					<TableHeadCell>Roles</TableHeadCell>
					<TableHeadCell>Fecha de registro</TableHeadCell>
					<TableHeadCell class="text-right">Acciones</TableHeadCell>
				</TableHead>
				<TableBody>
					{#each data.users as user (user.id)}
						<TableBodyRow class="transition-colors">
							<TableBodyCell class="w-12 p-4!">
								<Checkbox
									checked={selectedUsers.includes(user.id)}
									onchange={() => toggleSelection(user.id)}
								/>
							</TableBodyCell>
							<TableBodyCell>
								<div class="flex items-center gap-3">
									<Avatar src={user.image || '/images/default_avatar.png'} size="sm" class="ring-2 ring-gray-100 dark:ring-gray-700" />
									<div>
										<p class="font-medium text-gray-900 dark:text-white">
											{user.username || 'Sin nombre'}
										</p>
									</div>
								</div>
							</TableBodyCell>
							<TableBodyCell>
								<span class="text-gray-600 dark:text-gray-300">{user.email}</span>
							</TableBodyCell>
							<TableBodyCell>
								<div class="flex flex-wrap gap-1">
									{#if user.roles && user.roles.length > 0}
										{#each user.roles.sort((a, b) => b.level - a.level) as r (r.id)}
											<Badge color={getRoleBadgeColorByLevel(r.level)} class="font-medium text-xs">
												{r.displayName}
											</Badge>
										{/each}
									{:else}
										<Badge color="green" class="font-medium">
											Usuario
										</Badge>
									{/if}
								</div>
							</TableBodyCell>
							<TableBodyCell>
								<span class="text-sm text-gray-500 dark:text-gray-400">
									{formatDate(user.createdAt)}
								</span>
							</TableBodyCell>
							<TableBodyCell>
								<div class="flex justify-end gap-1">
									<a
										href="/admin/users/{user.id}"
										class="rounded-lg p-2 text-gray-500 transition-colors hover:bg-gray-100 hover:text-gray-900 dark:text-gray-400 dark:hover:bg-gray-700 dark:hover:text-white"
									>
										<Eye size={18} />
										<Tooltip>Ver detalles</Tooltip>
									</a>
									<a
										href="/admin/users/{user.id}/edit"
										class="rounded-lg p-2 text-gray-500 transition-colors hover:bg-gray-100 hover:text-primary-600 dark:text-gray-400 dark:hover:bg-gray-700 dark:hover:text-primary-400"
									>
										<PencilLine size={18} />
										<Tooltip>Editar</Tooltip>
									</a>
									<button
										type="button"
										class="rounded-lg p-2 text-gray-500 transition-colors hover:bg-red-50 hover:text-red-600 dark:text-gray-400 dark:hover:bg-red-900/20 dark:hover:text-red-400"
										onclick={() => confirmDeleteUser(user.id)}
									>
										<Trash2 size={18} />
										<Tooltip>Eliminar</Tooltip>
									</button>
								</div>
							</TableBodyCell>
						</TableBodyRow>
					{:else}
						<TableBodyRow>
							<TableBodyCell colspan={6} class="py-8 text-center">
								<div class="flex flex-col items-center gap-2">
									<Users size={40} class="text-gray-300 dark:text-gray-600" />
									<p class="text-gray-500 dark:text-gray-400">No se encontraron usuarios</p>
									{#if data.filters.search || data.filters.role !== 'all'}
										<Button color="alternative" size="xs" onclick={clearFilters}>
											Limpiar filtros
										</Button>
									{/if}
								</div>
							</TableBodyCell>
						</TableBodyRow>
					{/each}
				</TableBody>
			</Table>
		</div>

		<!-- Pagination -->
		{#if data.pagination.totalPages > 1}
			<div class="flex flex-col items-center justify-between gap-4 border-t border-gray-200 px-4 py-4 dark:border-gray-700 sm:flex-row">
				<div class="text-sm text-gray-500 dark:text-gray-400">
					Mostrando <span class="font-semibold text-gray-900 dark:text-white">{(data.pagination.page - 1) * data.pagination.itemsPerPage + 1}</span>
					a <span class="font-semibold text-gray-900 dark:text-white">{Math.min(data.pagination.page * data.pagination.itemsPerPage, data.pagination.totalUsers)}</span>
					de <span class="font-semibold text-gray-900 dark:text-white">{data.pagination.totalUsers}</span> usuarios
				</div>
				<PaginationNav
					currentPage={data.pagination.page}
					totalPages={data.pagination.totalPages}
					onPageChange={handlePageChange}
				/>
			</div>
		{/if}
	</div>

	<!-- User form modal -->
	<UserForm bind:show={showAddForm} onClose={() => (showAddForm = false)} availableRoles={data.availableRoles} />

	<!-- Delete confirmation modal -->
	<Modal bind:open={showDeleteModal} size="sm">
		<div class="p-2 text-center">
			<div class="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-red-100 dark:bg-red-900/20">
				<Trash2 size={28} class="text-red-600 dark:text-red-400" />
			</div>
			<h3 class="mb-2 text-lg font-semibold text-gray-900 dark:text-white">
				¿Eliminar usuario?
			</h3>
			<p class="mb-5 text-sm text-gray-500 dark:text-gray-400">
				Esta acción no se puede deshacer. El usuario será eliminado permanentemente.
			</p>
			<div class="flex justify-center gap-3">
				<Button color="alternative" onclick={() => (showDeleteModal = false)}>
					Cancelar
				</Button>
				<form action="?/deleteUser" method="POST" use:enhance={handleDeleteResult}>
					<input type="hidden" name="userId" value={userToDelete} />
					<Button color="red" type="submit">Sí, eliminar</Button>
				</form>
			</div>
		</div>
	</Modal>

	<!-- Toast notification -->
	{#if showToast}
		<Toast class="fixed bottom-4 right-4 z-50" color={toastType === 'success' ? 'green' : 'red'}>
			{#snippet icon()}
				{#if toastType === 'success'}
					<svg class="h-5 w-5" fill="currentColor" viewBox="0 0 20 20">
						<path fill-rule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clip-rule="evenodd"></path>
					</svg>
				{:else}
					<svg class="h-5 w-5" fill="currentColor" viewBox="0 0 20 20">
						<path fill-rule="evenodd" d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" clip-rule="evenodd"></path>
					</svg>
				{/if}
			{/snippet}
			{toastMessage}
		</Toast>
	{/if}
</div>
