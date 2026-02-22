<script lang="ts">
	import type { PageData } from './$types';
	import { breadcrumb } from '$lib/stores/breadcrumb';
	import { goto, invalidateAll } from '$app/navigation';
	import { page } from '$app/stores';
	import { Button, Badge, Select, Toggle, Spinner } from 'flowbite-svelte';
	import { Bell, CheckCheck, Trash2, Filter, ChevronLeft, ChevronRight } from 'lucide-svelte';
	import NotificationItem from '$lib/components/notifications/NotificationItem.svelte';
	import { SvelteURLSearchParams } from 'svelte/reactivity';	

	let { data }: { data: PageData } = $props();

	let isLoading = $state(false);
	let selectedType = $derived(data.filters.type || '');
	let unreadOnly = $derived(data.filters.unreadOnly);

	// Update breadcrumb
	$effect(() => {
		breadcrumb.set([{ label: 'Notificaciones', href: '/notifications' }]);
	});

	const typeOptions = [
		{ value: '', name: 'Todos los tipos' },
		{ value: 'activity_completed', name: 'Actividad completada' },
		{ value: 'enrollment', name: 'Inscripción' },
		{ value: 'new_activity', name: 'Nueva actividad' },
		{ value: 'course_update', name: 'Actualización de curso' },
		{ value: 'contact_form', name: 'Formulario de contacto' },
		{ value: 'system', name: 'Sistema' }
	];

	async function handleMarkRead(id: string) {
		try {
			const response = await fetch(`/api/notifications/${id}`, { method: 'PATCH' });
			if (response.ok) {
				await invalidateAll();
			}
		} catch (error) {
			console.error('Error marking notification as read:', error);
		}
	}

	async function handleDelete(id: string) {
		try {
			const response = await fetch(`/api/notifications/${id}`, { method: 'DELETE' });
			if (response.ok) {
				await invalidateAll();
			}
		} catch (error) {
			console.error('Error deleting notification:', error);
		}
	}

	async function handleMarkAllRead() {
		isLoading = true;
		try {
			const response = await fetch('/api/notifications/read-all', { method: 'POST' });
			if (response.ok) {
				await invalidateAll();
			}
		} catch (error) {
			console.error('Error marking all as read:', error);
		} finally {
			isLoading = false;
		}
	}

	function applyFilters() {
		const params = new SvelteURLSearchParams();
		if (selectedType) params.set('type', selectedType);
		if (unreadOnly) params.set('unreadOnly', 'true');
		params.set('page', '1');
		goto(`/notifications?${params.toString()}`);
	}

	function goToPage(pageNum: number) {
		const params = new SvelteURLSearchParams($page.url.searchParams);
		params.set('page', pageNum.toString());
		goto(`/notifications?${params.toString()}`);
	}

	const unreadCount = $derived(data.notifications.filter((n) => !n.read).length);
</script>

<div class="container mx-auto p-6 max-w-4xl">
	<!-- Header -->
	<div class="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-6">
		<div>
			<h1 class="text-2xl font-bold text-gray-900 dark:text-white flex items-center gap-3">
				<Bell class="h-7 w-7 text-primary-600 dark:text-primary-400" />
				Notificaciones
			</h1>
			<p class="text-sm text-gray-500 dark:text-gray-400 mt-1">
				{data.total} notificaciones en total
				{#if unreadCount > 0}
					<Badge color="blue" class="ml-2">{unreadCount} sin leer</Badge>
				{/if}
			</p>
		</div>

		{#if unreadCount > 0}
			<Button color="alternative" size="sm" onclick={handleMarkAllRead} disabled={isLoading}>
				{#if isLoading}
					<Spinner size="4" class="mr-2" />
				{:else}
					<CheckCheck class="w-4 h-4 mr-2" />
				{/if}
				Marcar todas como leídas
			</Button>
		{/if}
	</div>

	<!-- Filters -->
	<div class="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-4 mb-6">
		<div class="flex flex-col sm:flex-row gap-4 items-start sm:items-center">
			<div class="flex items-center gap-2">
				<Filter class="h-4 w-4 text-gray-500" />
				<span class="text-sm font-medium text-gray-700 dark:text-gray-300">Filtros:</span>
			</div>

			<div class="flex flex-wrap gap-4 flex-1">
				<Select
					size="sm"
					items={typeOptions}
					bind:value={selectedType}
					class="w-48"
				/>

				<label class="flex items-center gap-2 cursor-pointer">
					<input
						type="checkbox"
						bind:checked={unreadOnly}
						class="h-4 w-4 rounded border-gray-300 text-primary-600 focus:ring-primary-500"
					/>
					<span class="text-sm text-gray-700 dark:text-gray-300">Solo sin leer</span>
				</label>
			</div>

			<Button size="sm" color="primary" onclick={applyFilters}>
				Aplicar
			</Button>
		</div>
	</div>

	<!-- Notifications List -->
	<div class="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 overflow-hidden">
		{#if data.notifications.length === 0}
			<div class="flex flex-col items-center justify-center py-16 px-4">
				<div class="p-4 rounded-full bg-gray-100 dark:bg-gray-700 mb-4">
					<Bell class="h-10 w-10 text-gray-400 dark:text-gray-500" />
				</div>
				<h3 class="text-lg font-medium text-gray-900 dark:text-white mb-2">
					No hay notificaciones
				</h3>
				<p class="text-sm text-gray-500 dark:text-gray-400 text-center max-w-sm">
					{#if data.filters.unreadOnly || data.filters.type}
						No se encontraron notificaciones con los filtros aplicados.
					{:else}
						Cuando recibas notificaciones, aparecerán aquí.
					{/if}
				</p>
			</div>
		{:else}
			{#each data.notifications as notification (notification.id)}
				<NotificationItem
					{notification}
					onMarkRead={handleMarkRead}
					onDelete={handleDelete}
				/>
			{/each}
		{/if}
	</div>

	<!-- Pagination -->
	{#if data.totalPages > 1}
		<div class="flex items-center justify-between mt-6">
			<p class="text-sm text-gray-500 dark:text-gray-400">
				Página {data.page} de {data.totalPages}
			</p>

			<div class="flex gap-2">
				<Button
					size="sm"
					color="alternative"
					disabled={data.page <= 1}
					onclick={() => goToPage(data.page - 1)}
				>
					<ChevronLeft class="w-4 h-4 mr-1" />
					Anterior
				</Button>
				<Button
					size="sm"
					color="alternative"
					disabled={data.page >= data.totalPages}
					onclick={() => goToPage(data.page + 1)}
				>
					Siguiente
					<ChevronRight class="w-4 h-4 ml-1" />
				</Button>
			</div>
		</div>
	{/if}
</div>
