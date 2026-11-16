<script lang="ts">
	import { SvelteURLSearchParams } from 'svelte/reactivity';
	import { resolve } from '$app/paths';
	import type { PageData } from './$types';
	import {
		UserPlus,
		Trash2,
		PencilLine,
		Eye,
		Download,
		Search,
		Users,
		Filter
	} from 'lucide-svelte';
	import { breadcrumb } from '$lib/stores/breadcrumb';
	import UserForm from '$lib/components/UserForm.svelte';
	import { enhance } from '$app/forms';
	import { goto, invalidateAll } from '$app/navigation';
	import { page } from '$app/state';
	import type { SubmitFunction } from '@sveltejs/kit';

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

	let { data }: { data: PageData } = $props();

	let showAddForm = $state(false);
	let deleteTarget = $state<{ id: string; label: string } | null>(null);
	let showBulkDeleteModal = $state(false);
	let deleting = $state(false);
	let deleteError = $state('');

	let toastMessage = $state('');
	let toastType = $state<'success' | 'error'>('success');
	let toastTimer: ReturnType<typeof setTimeout> | undefined;

	let selectedUsers = $state<string[]>([]);

	// La selección solo puede contener usuarios visibles en la página actual
	const visibleSelection = $derived(
		selectedUsers.filter((id) => data.users.some((user) => user.id === id))
	);
	const selectableUsers = $derived(data.users.filter((user) => user.id !== data.currentUserId));
	const allSelected = $derived(
		selectableUsers.length > 0 && selectableUsers.every((u) => visibleSelection.includes(u.id))
	);
	const hasActiveFilters = $derived(data.filters.search !== '' || data.filters.role !== 'all');

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

	const dateFormatter = new Intl.DateTimeFormat('es-ES', {
		day: '2-digit',
		month: 'short',
		year: 'numeric'
	});

	function getRoleBadgeColorByLevel(level: number): 'purple' | 'red' | 'blue' | 'green' | 'yellow' {
		if (level >= 100) return 'red';
		if (level >= 90) return 'purple';
		if (level >= 50) return 'blue';
		if (level >= 40) return 'yellow';
		return 'green';
	}

	function handlePageChange(newPage: number) {
		const params = new SvelteURLSearchParams(page.url.searchParams);
		params.set('page', String(newPage));
		goto(resolve(`/admin/users?${params.toString()}`));
	}

	function showToastMessage(message: string, type: 'success' | 'error') {
		toastMessage = message;
		toastType = type;
		clearTimeout(toastTimer);
		toastTimer = setTimeout(() => (toastMessage = ''), 5000);
	}

	function toggleSelection(userId: string) {
		selectedUsers = visibleSelection.includes(userId)
			? visibleSelection.filter((id) => id !== userId)
			: [...visibleSelection, userId];
	}

	function toggleSelectAll() {
		selectedUsers = allSelected ? [] : selectableUsers.map((user) => user.id);
	}

	function userLabel(user: { username: string | null; email: string }) {
		return user.username || user.email;
	}

	const handleDeleteResult: SubmitFunction = () => {
		deleting = true;
		deleteError = '';
		return async ({ result }) => {
			deleting = false;
			if (result.type === 'success') {
				const message = (result.data as { message?: string } | undefined)?.message;
				deleteTarget = null;
				showBulkDeleteModal = false;
				selectedUsers = [];
				await invalidateAll();
				showToastMessage(message ?? 'Usuarios eliminados.', 'success');
			} else if (result.type === 'failure') {
				deleteError =
					(result.data as { message?: string } | undefined)?.message ?? 'No se pudo eliminar.';
			} else if (result.type === 'error') {
				deleteError = 'No tienes permisos o la sesión ha caducado. Recarga la página.';
			}
		};
	};

	function csvCell(value: string) {
		// Comillas para separadores y prefijo para evitar inyección de fórmulas en hojas de cálculo
		const safe = /^[=+\-@\t\r]/.test(value) ? `'${value}` : value;
		return `"${safe.replaceAll('"', '""')}"`;
	}

	function exportUsers() {
		const usersToExport = data.users.filter(
			(user) => visibleSelection.length === 0 || visibleSelection.includes(user.id)
		);

		const headers = ['ID', 'Username', 'Email', 'Roles', 'Created At'];
		const csvContent = [
			headers.map(csvCell).join(','),
			...usersToExport.map((user) =>
				[
					user.id,
					user.username || '',
					user.email,
					user.roles.map((r) => r.displayName).join(';') || 'Usuario',
					new Date(user.createdAt).toISOString()
				]
					.map(csvCell)
					.join(',')
			)
		].join('\n');

		const blob = new Blob(['﻿', csvContent], { type: 'text/csv;charset=utf-8' });
		const url = URL.createObjectURL(blob);
		const link = document.createElement('a');
		link.href = url;
		link.download = 'usuarios.csv';
		link.click();
		URL.revokeObjectURL(url);

		showToastMessage(`Exportados ${usersToExport.length} usuarios.`, 'success');
	}
</script>

<div class="space-y-6">
	<!-- Header -->
	<div class="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
		<div>
			<h1 class="text-2xl font-bold text-balance text-gray-900 dark:text-white">
				Gestión de Usuarios
			</h1>
			<p class="mt-1 text-sm text-gray-500 tabular-nums dark:text-gray-400">
				{data.pagination.totalUsers} usuarios en total
			</p>
		</div>
		<Button
			type="button"
			color="primary"
			onclick={() => (showAddForm = true)}
			class="flex items-center gap-2"
		>
			<UserPlus size={18} aria-hidden="true" />
			Nuevo Usuario
		</Button>
	</div>

	<!-- Filtros: formulario GET para que el estado viva en la URL -->
	<search
		class="block rounded-xl border border-gray-200 bg-white p-4 dark:border-gray-700 dark:bg-gray-800"
	>
		<form method="GET" class="flex flex-col gap-4 md:flex-row md:items-end">
			<div class="min-w-0 flex-1">
				<label
					for="user-search"
					class="mb-2 block text-sm font-medium text-gray-700 dark:text-gray-300"
				>
					Buscar
				</label>
				<div class="relative">
					<div class="pointer-events-none absolute inset-y-0 start-0 flex items-center ps-3">
						<Search size={16} class="text-gray-400" aria-hidden="true" />
					</div>
					<input
						id="user-search"
						name="search"
						type="search"
						value={data.filters.search}
						placeholder="Nombre o email…"
						autocomplete="off"
						spellcheck="false"
						autocapitalize="none"
						autocorrect="off"
						enterkeyhint="search"
						data-1p-ignore
						data-lpignore="true"
						data-bwignore
						class="focus:border-primary-500 focus:ring-primary-500 block w-full rounded-lg border border-gray-300 bg-gray-50 p-2.5 ps-10 text-base text-gray-900 sm:text-sm dark:border-gray-600 dark:bg-gray-700 dark:text-white dark:placeholder-gray-400"
					/>
				</div>
			</div>

			<div class="w-full md:w-48">
				<label
					for="user-role-filter"
					class="mb-2 block text-sm font-medium text-gray-700 dark:text-gray-300"
				>
					Rol
				</label>
				<select
					id="user-role-filter"
					name="role"
					autocomplete="off"
					class="focus:border-primary-500 focus:ring-primary-500 block w-full rounded-lg border border-gray-300 bg-gray-50 p-2.5 text-base text-gray-900 sm:text-sm dark:border-gray-600 dark:bg-gray-700 dark:text-white"
				>
					{#each roleOptions as option (option.value)}
						<option value={option.value} selected={option.value === data.filters.role}>
							{option.name}
						</option>
					{/each}
				</select>
			</div>

			<div class="flex gap-2">
				<Button type="submit" color="primary" class="flex items-center gap-2">
					<Filter size={16} aria-hidden="true" />
					Filtrar
				</Button>
				{#if hasActiveFilters}
					<Button href={resolve('/admin/users')} color="alternative">Limpiar</Button>
				{/if}
			</div>
		</form>
	</search>

	<!-- Bulk Actions -->
	{#if visibleSelection.length > 0}
		<div
			class="border-primary-200 bg-primary-50 dark:border-primary-800 dark:bg-primary-900/20 flex flex-wrap items-center gap-3 rounded-lg border p-3"
		>
			<Users size={18} class="text-primary-600 dark:text-primary-400" aria-hidden="true" />
			<span class="text-primary-700 dark:text-primary-300 text-sm font-medium tabular-nums">
				{visibleSelection.length} usuario(s) seleccionado(s)
			</span>
			<div class="ms-auto flex gap-2">
				<Button
					type="button"
					color="red"
					size="xs"
					class="flex items-center gap-1"
					onclick={() => {
						deleteError = '';
						showBulkDeleteModal = true;
					}}
				>
					<Trash2 size={14} aria-hidden="true" />
					Eliminar…
				</Button>
				<Button
					type="button"
					color="light"
					size="xs"
					onclick={exportUsers}
					class="flex items-center gap-1"
				>
					<Download size={14} aria-hidden="true" />
					Exportar
				</Button>
				<Button type="button" color="alternative" size="xs" onclick={() => (selectedUsers = [])}>
					Quitar selección
				</Button>
			</div>
		</div>
	{/if}

	<!-- Table Card -->
	<div class="rounded-xl border border-gray-200 bg-white dark:border-gray-700 dark:bg-gray-800">
		<div class="overflow-x-auto">
			<Table hoverable={true} striped={true} class="w-full">
				<caption class="sr-only">Usuarios del sistema</caption>
				<TableHead class="bg-gray-50 dark:bg-gray-700">
					<TableHeadCell class="w-12 p-4!">
						<Checkbox
							checked={allSelected}
							disabled={selectableUsers.length === 0}
							onchange={toggleSelectAll}
							aria-label="Seleccionar todos los usuarios de esta página"
						/>
					</TableHeadCell>
					<TableHeadCell>Usuario</TableHeadCell>
					<TableHeadCell>Email</TableHeadCell>
					<TableHeadCell>Roles</TableHeadCell>
					<TableHeadCell>Fecha de registro</TableHeadCell>
					<TableHeadCell class="text-right">Acciones</TableHeadCell>
				</TableHead>
				<TableBody>
					{#each data.users as user (user.id)}
						{@const isSelf = user.id === data.currentUserId}
						<TableBodyRow class="transition-colors">
							<TableBodyCell class="w-12 p-4!">
								<Checkbox
									checked={visibleSelection.includes(user.id)}
									disabled={isSelf}
									onchange={() => toggleSelection(user.id)}
									aria-label={`Seleccionar ${userLabel(user)}`}
								/>
							</TableBodyCell>
							<TableBodyCell>
								<div class="flex min-w-0 items-center gap-3">
									<Avatar
										src={user.image || '/images/default_avatar.png'}
										alt=""
										size="sm"
										class="shrink-0 ring-2 ring-gray-100 dark:ring-gray-700"
									/>
									<p class="truncate font-medium text-gray-900 dark:text-white">
										{user.username || 'Sin nombre'}
										{#if isSelf}<span class="text-xs font-normal text-gray-500">(tú)</span>{/if}
									</p>
								</div>
							</TableBodyCell>
							<TableBodyCell>
								<span class="break-all text-gray-600 dark:text-gray-300">{user.email}</span>
							</TableBodyCell>
							<TableBodyCell>
								<div class="flex flex-wrap gap-1">
									{#each user.roles as r (r.id)}
										<Badge color={getRoleBadgeColorByLevel(r.level)} class="text-xs font-medium">
											{r.displayName}
										</Badge>
									{:else}
										<Badge color="green" class="font-medium">Usuario</Badge>
									{/each}
								</div>
							</TableBodyCell>
							<TableBodyCell>
								<time
									datetime={new Date(user.createdAt).toISOString()}
									class="text-sm text-gray-500 tabular-nums dark:text-gray-400"
								>
									{dateFormatter.format(new Date(user.createdAt))}
								</time>
							</TableBodyCell>
							<TableBodyCell>
								<div class="flex justify-end gap-1">
									<a
										href={resolve(`/admin/users/${user.id}`)}
										aria-label={`Ver detalles de ${userLabel(user)}`}
										class="focus-visible:ring-primary-500 rounded-lg p-2 text-gray-500 transition-colors hover:bg-gray-100 hover:text-gray-900 focus-visible:ring-2 focus-visible:outline-none dark:text-gray-400 dark:hover:bg-gray-700 dark:hover:text-white"
									>
										<Eye size={18} aria-hidden="true" />
									</a>
									<Tooltip>Ver detalles</Tooltip>
									<a
										href={resolve(`/admin/users/${user.id}/edit`)}
										aria-label={`Editar ${userLabel(user)}`}
										class="hover:text-primary-600 dark:hover:text-primary-400 focus-visible:ring-primary-500 rounded-lg p-2 text-gray-500 transition-colors hover:bg-gray-100 focus-visible:ring-2 focus-visible:outline-none dark:text-gray-400 dark:hover:bg-gray-700"
									>
										<PencilLine size={18} aria-hidden="true" />
									</a>
									<Tooltip>Editar</Tooltip>
									{#if !isSelf}
										<button
											type="button"
											aria-label={`Eliminar ${userLabel(user)}`}
											class="rounded-lg p-2 text-gray-500 transition-colors hover:bg-red-50 hover:text-red-600 focus-visible:ring-2 focus-visible:ring-red-500 focus-visible:outline-none dark:text-gray-400 dark:hover:bg-red-900/20 dark:hover:text-red-400"
											onclick={() => {
												deleteError = '';
												deleteTarget = { id: user.id, label: userLabel(user) };
											}}
										>
											<Trash2 size={18} aria-hidden="true" />
										</button>
										<Tooltip>Eliminar</Tooltip>
									{/if}
								</div>
							</TableBodyCell>
						</TableBodyRow>
					{:else}
						<TableBodyRow>
							<TableBodyCell colspan={6} class="py-8 text-center">
								<div class="flex flex-col items-center gap-2">
									<Users size={40} class="text-gray-300 dark:text-gray-600" aria-hidden="true" />
									<p class="text-gray-500 dark:text-gray-400">No se encontraron usuarios</p>
									{#if hasActiveFilters}
										<Button href={resolve('/admin/users')} color="alternative" size="xs">
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

		{#if data.pagination.totalPages > 1}
			<div
				class="flex flex-col items-center justify-between gap-4 border-t border-gray-200 px-4 py-4 sm:flex-row dark:border-gray-700"
			>
				<div class="text-sm text-gray-500 tabular-nums dark:text-gray-400">
					Mostrando <span class="font-semibold text-gray-900 dark:text-white"
						>{(data.pagination.page - 1) * data.pagination.itemsPerPage + 1}</span
					>
					a
					<span class="font-semibold text-gray-900 dark:text-white"
						>{Math.min(
							data.pagination.page * data.pagination.itemsPerPage,
							data.pagination.totalUsers
						)}</span
					>
					de
					<span class="font-semibold text-gray-900 dark:text-white"
						>{data.pagination.totalUsers}</span
					> usuarios
				</div>
				<PaginationNav
					currentPage={data.pagination.page}
					totalPages={data.pagination.totalPages}
					onPageChange={handlePageChange}
				/>
			</div>
		{/if}
	</div>

	<UserForm
		bind:show={showAddForm}
		availableRoles={data.availableRoles}
		onCreated={(message) => showToastMessage(message, 'success')}
	/>

	<!-- Confirmación de borrado individual -->
	<Modal
		open={deleteTarget !== null}
		size="sm"
		outsideclose={false}
		aria-labelledby="delete-user-title"
		onclose={() => (deleteTarget = null)}
		oncancel={(event: Event) => {
			if (deleting) event.preventDefault();
			else deleteTarget = null;
		}}
	>
		<div class="p-2 text-center">
			<div
				class="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-red-100 dark:bg-red-900/20"
				aria-hidden="true"
			>
				<Trash2 size={28} class="text-red-600 dark:text-red-400" />
			</div>
			<h2 id="delete-user-title" class="mb-2 text-lg font-semibold text-gray-900 dark:text-white">
				¿Eliminar a {deleteTarget?.label}?
			</h2>
			<p class="mb-5 text-sm text-gray-500 dark:text-gray-400">
				Esta acción no se puede deshacer. El usuario será eliminado permanentemente.
			</p>
			{#if deleteError}
				<p
					role="alert"
					class="mb-4 rounded-lg bg-red-50 p-3 text-sm text-red-800 dark:bg-red-900/50 dark:text-red-300"
				>
					{deleteError}
				</p>
			{/if}
			<form
				action="?/deleteUser"
				method="POST"
				use:enhance={handleDeleteResult}
				class="flex justify-center gap-3"
			>
				<input type="hidden" name="userId" value={deleteTarget?.id ?? ''} />
				<Button
					type="button"
					color="alternative"
					data-autofocus
					disabled={deleting}
					onclick={() => (deleteTarget = null)}
				>
					Cancelar
				</Button>
				<Button color="red" type="submit" disabled={deleting} aria-busy={deleting}>
					{deleting ? 'Eliminando…' : 'Sí, eliminar'}
				</Button>
			</form>
		</div>
	</Modal>

	<!-- Confirmación de borrado masivo -->
	<Modal
		bind:open={showBulkDeleteModal}
		size="sm"
		outsideclose={false}
		aria-labelledby="bulk-delete-title"
		oncancel={(event: Event) => {
			if (deleting) event.preventDefault();
		}}
	>
		<div class="p-2 text-center">
			<h2 id="bulk-delete-title" class="mb-2 text-lg font-semibold text-gray-900 dark:text-white">
				¿Eliminar {visibleSelection.length} usuario(s)?
			</h2>
			<p class="mb-5 text-sm text-gray-500 dark:text-gray-400">Esta acción no se puede deshacer.</p>
			{#if deleteError}
				<p
					role="alert"
					class="mb-4 rounded-lg bg-red-50 p-3 text-sm text-red-800 dark:bg-red-900/50 dark:text-red-300"
				>
					{deleteError}
				</p>
			{/if}
			<form
				action="?/deleteBulk"
				method="POST"
				use:enhance={handleDeleteResult}
				class="flex justify-center gap-3"
			>
				{#each visibleSelection as id (id)}
					<input type="hidden" name="userIds" value={id} />
				{/each}
				<Button
					type="button"
					color="alternative"
					data-autofocus
					disabled={deleting}
					onclick={() => (showBulkDeleteModal = false)}
				>
					Cancelar
				</Button>
				<Button color="red" type="submit" disabled={deleting} aria-busy={deleting}>
					{deleting ? 'Eliminando…' : `Eliminar ${visibleSelection.length}`}
				</Button>
			</form>
		</div>
	</Modal>

	<!-- Región viva siempre presente para que los lectores de pantalla anuncien el resultado -->
	<div role="status" aria-live="polite" class="fixed end-4 bottom-4 z-50">
		{#if toastMessage}
			<Toast color={toastType === 'success' ? 'green' : 'red'} onclose={() => (toastMessage = '')}>
				{toastMessage}
			</Toast>
		{/if}
	</div>
</div>
