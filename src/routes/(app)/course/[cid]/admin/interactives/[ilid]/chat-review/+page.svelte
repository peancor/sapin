<script lang="ts">
	import { page } from '$app/state';
	import { goto } from '$app/navigation';
	import { resolve } from '$app/paths';
	import { SvelteURLSearchParams } from 'svelte/reactivity';
	import ChatCard from '$lib/components/ChatCard.svelte';
	import { Button, Pagination, Input, Select, ListPlaceholder, Search } from 'flowbite-svelte';
	import {
		ArrowUp,
		ArrowDown,
		Search as SearchIcon,
		Filter,
		RefreshCw,
		ChevronLeft,
		ChevronRight,
		ArrowLeft,
		Trash2
	} from 'lucide-svelte';
	import { formatDate } from '$lib/helpers/dateUtils';
	import type { PageProps } from './$types';

	type ReviewChat = PageProps['data']['chats'][number];

	let { form }: PageProps = $props();

	// Reactive variables for filters and sorting
	let searchTerm = $state(page.data.filters?.search || '');
	let startDate = $state(page.data.filters?.startDate || '');
	let endDate = $state(page.data.filters?.endDate || '');
	let sortField = $state(page.data.sorting?.field || 'createdAt');
	let sortDirection = $state(page.data.sorting?.direction || 'desc');
	let isLoading = $state(false);
	let showFilters = $state(false);
	let deleteTarget = $state<ReviewChat | null>(null);

	// Create pagination pages array with proper format for Flowbite Svelte Pagination
	let paginationPages = $derived(generatePaginationPages());

	// Calculate start and end item numbers for display
	let startItem = $derived(calculateStartItem());
	let endItem = $derived(calculateEndItem());

	function calculateStartItem() {
		return (page.data.pagination.currentPage - 1) * page.data.pagination.pageSize + 1;
	}

	function calculateEndItem() {
		const calculatedEnd = startItem + page.data.chats.length - 1;
		return Math.min(calculatedEnd, page.data.pagination.totalCount);
	}

	function generatePaginationPages() {
		const totalPages = page.data.pagination.totalPages;
		const currentPage = page.data.pagination.currentPage;

		return Array.from({ length: totalPages }, (_, i) => {
			const pageNum = i + 1;
			return {
				name: pageNum.toString(),
				href: createPageUrl(pageNum),
				active: pageNum === currentPage
			};
		});
	}

	function createPageUrl(pageNum: number) {
		// Use the page store from $app/state
		const params = new SvelteURLSearchParams(page.url.search);
		params.set('page', pageNum.toString());
		return `?${params.toString()}`;
	}

	// Function to update URL and reload data
	function updateFilters() {
		isLoading = true;

		// Use the page store from $app/state
		const params = new SvelteURLSearchParams(page.url.search);

		// Update search params
		if (searchTerm) {
			params.set('search', searchTerm);
		} else {
			params.delete('search');
		}

		// Update date filters
		if (startDate) {
			params.set('startDate', startDate);
		} else {
			params.delete('startDate');
		}

		if (endDate) {
			params.set('endDate', endDate);
		} else {
			params.delete('endDate');
		}

		// Update sorting
		params.set('sortField', sortField);
		params.set('sortDirection', sortDirection);

		// Reset to page 1 when filters change
		params.set('page', '1');

		// Navigate to the new URL
		// eslint-disable-next-line svelte/no-navigation-without-resolve
		goto(new URL(`${page.url.pathname}?${params.toString()}`, page.url.origin), {
			replaceState: true
		});
	}

	// Function to handle pagination navigation
	const handlePaginationPrevious = () => {
		if (page.data.pagination.currentPage > 1) {
			navigateToPage(page.data.pagination.currentPage - 1);
		}
	};

	const handlePaginationNext = () => {
		if (page.data.pagination.currentPage < page.data.pagination.totalPages) {
			navigateToPage(page.data.pagination.currentPage + 1);
		}
	};

	function navigateToPage(pageNum: number) {
		isLoading = true;
		// Use the page store from $app/state
		const params = new SvelteURLSearchParams(page.url.search);
		params.set('page', pageNum.toString());
		// eslint-disable-next-line svelte/no-navigation-without-resolve
		goto(new URL(`${page.url.pathname}?${params.toString()}`, page.url.origin), {
			replaceState: true
		});
	}

	// Function to toggle sort direction
	function toggleSortDirection() {
		sortDirection = sortDirection === 'asc' ? 'desc' : 'asc';
		updateFilters();
	}

	// Reset filters
	function resetFilters() {
		searchTerm = '';
		startDate = '';
		endDate = '';
		sortField = 'createdAt';
		sortDirection = 'desc';
		updateFilters();
	}

	// Handle form submission
	function handleSubmit(event: SubmitEvent) {
		event.preventDefault();
		updateFilters();
	}

	function closeDeleteModal() {
		deleteTarget = null;
	}

	// Update isLoading when page changes
	$effect(() => {
		if (page.url.searchParams.toString()) {
			isLoading = false;
		}
	});
</script>

<div class="min-h-screen bg-gray-50 dark:bg-gray-900">
	<!-- Header with back arrow -->
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
						Revisión de Chats: {page.data.interactiveChat?.interactive_learning?.name ||
							'Actividad'}
					</h1>
				</div>
			</div>
		</div>
	</div>

	<!-- Content Area -->
	<div class="container mx-auto max-w-screen-xl px-4 py-6">
		<!-- Toolbar for filtering and sorting -->
		<div class="mb-6 rounded-lg bg-white p-5 shadow-lg dark:bg-gray-800">
			<!-- Search and filters section -->
			<div class="mb-4 flex flex-col gap-4 md:flex-row">
				<div class="flex-1">
					<form onsubmit={handleSubmit} class="h-full">
						<div class="relative flex h-full items-center">
							<Search
								size="md"
								placeholder="Buscar chats..."
								bind:value={searchTerm}
								class="w-full"
							/>
							<Button
								color="blue"
								type="submit"
								size="sm"
								class="absolute top-0 right-0 bottom-0 flex h-full items-center justify-center rounded-l-none"
							>
								<SearchIcon class="h-4 w-4" />
							</Button>
						</div>
					</form>
				</div>

				<div class="flex flex-wrap items-center justify-end gap-2">
					<Button
						color={showFilters ? 'light' : 'blue'}
						size="sm"
						onclick={() => (showFilters = !showFilters)}
						class="flex h-10 items-center"
					>
						<Filter class="mr-2 h-4 w-4" />
						{showFilters ? 'Ocultar Filtros' : 'Mostrar Filtros'}
					</Button>

					<div class="flex h-10 items-center rounded-lg bg-gray-50 p-2 dark:bg-gray-700">
						<span class="mr-2 text-sm text-gray-600 dark:text-gray-400">Ordenar:</span>
						<Select
							size="sm"
							class="w-40 bg-transparent"
							bind:value={sortField}
							onchange={updateFilters}
						>
							<option value="createdAt">Fecha</option>
							<option value="username">Usuario</option>
							<option value="messageCount">Cantidad de mensajes</option>
						</Select>

						<Button color="light" size="sm" class="ml-2 h-full" onclick={toggleSortDirection}>
							{#if sortDirection === 'asc'}
								<ArrowUp class="h-4 w-4" />
							{:else}
								<ArrowDown class="h-4 w-4" />
							{/if}
						</Button>
					</div>

					<Button color="red" size="sm" onclick={resetFilters} class="flex h-10 items-center">
						<RefreshCw class="mr-2 h-4 w-4" />
						Restablecer
					</Button>
				</div>
			</div>

			<!-- Advanced filters (collapsible) -->
			{#if showFilters}
				<div
					class="mt-4 rounded-lg border-t border-gray-200 bg-gray-50 p-4 dark:border-gray-700 dark:bg-gray-700"
				>
					<div class="grid grid-cols-1 gap-4 md:grid-cols-3">
						<div>
							<label
								for="startDate"
								class="mb-2 block text-sm font-medium text-gray-900 dark:text-white"
							>
								Fecha de inicio
							</label>
							<Input id="startDate" type="date" bind:value={startDate} class="w-full" />
						</div>

						<div>
							<label
								for="endDate"
								class="mb-2 block text-sm font-medium text-gray-900 dark:text-white"
							>
								Fecha de fin
							</label>
							<Input id="endDate" type="date" bind:value={endDate} class="w-full" />
						</div>

						<div class="flex items-end">
							<Button color="blue" onclick={updateFilters} class="h-10 w-full">
								<Filter class="mr-2 h-4 w-4" />
								Aplicar Filtros
							</Button>
						</div>
					</div>
				</div>
			{/if}
		</div>

		<!-- Results summary -->
		<div
			class="mb-4 flex items-center justify-between rounded-lg bg-white p-3 shadow dark:bg-gray-800"
		>
			<p class="text-sm text-gray-600 dark:text-gray-400">
				Mostrando chats del {startItem} al {endItem} de un total de {page.data.pagination
					.totalCount}
				{#if page.data.filters?.search}
					que coinciden con "{page.data.filters.search}"
				{/if}
				{#if page.data.filters?.startDate || page.data.filters?.endDate}
					desde {page.data.filters?.startDate || 'cualquier fecha'} hasta {page.data.filters
						?.endDate || 'el presente'}
				{/if}
			</p>

			<div class="text-sm text-gray-600 dark:text-gray-400">
				Página {page.data.pagination.currentPage} de {page.data.pagination.totalPages}
			</div>
		</div>

		<!-- Loading indicator -->
		{#if isLoading}
			<div class="my-8">
				<ListPlaceholder
					class="max-w-full animate-pulse space-y-4 divide-y divide-gray-200 rounded border border-gray-200 p-4 shadow md:p-6 dark:divide-gray-700 dark:border-gray-700"
				/>
			</div>
		{:else}
			<!-- Chat list -->
			{#if page.data.chats.length > 0}
				<div class="space-y-4">
					{#each page.data.chats as chat (chat.chat.id)}
						<div class="space-y-2">
							<ChatCard chatInstance={chat} interactiveChat={page.data.interactiveChat} />
							<div class="flex justify-end px-1">
								<button
									type="button"
									class="inline-flex items-center gap-2 rounded-xl border border-transparent px-3 py-1.5 text-xs font-medium text-gray-500 transition-colors hover:border-rose-200 hover:bg-rose-50 hover:text-rose-700 focus-visible:ring-2 focus-visible:ring-rose-500 focus-visible:ring-offset-2 focus-visible:outline-none dark:text-gray-400 dark:hover:border-rose-900/60 dark:hover:bg-rose-950/25 dark:hover:text-rose-300 dark:focus-visible:ring-offset-gray-900"
									aria-label={`Borrar intento de ${chat.user.username} creado el ${formatDate(chat.chat.createdAt)}`}
									onclick={() => (deleteTarget = chat)}
								>
									<Trash2 class="h-3.5 w-3.5" />
									Borrar este intento
								</button>
							</div>
						</div>
					{/each}
				</div>
			{:else}
				<div class="rounded-lg bg-white p-6 text-center shadow-md dark:bg-gray-800">
					<p class="text-gray-600 dark:text-gray-400">
						No se encontraron chats para esta actividad.
					</p>
					{#if Object.values(page.data.filters || {}).some((v) => v)}
						<Button color="blue" class="mt-4" onclick={resetFilters}>
							<RefreshCw class="mr-2 h-4 w-4" />
							Restablecer Filtros
						</Button>
					{/if}
				</div>
			{/if}

			<!-- Pagination -->
			{#if page.data.pagination.totalPages > 1}
				<div class="mt-6 flex justify-center">
					<Pagination
						pages={paginationPages}
						previous={handlePaginationPrevious}
						next={handlePaginationNext}
					>
						{#snippet prevContent()}
							<span class="sr-only">Previous</span>
							<ChevronLeft class="h-5 w-5" />
						{/snippet}
						{#snippet nextContent()}
							<span class="sr-only">Next</span>
							<ChevronRight class="h-5 w-5" />
						{/snippet}
					</Pagination>
				</div>
			{/if}
		{/if}
		{#if form?.deleteError}
			<div
				class="mt-4 rounded-lg border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-800 dark:border-rose-900/60 dark:bg-rose-950/25 dark:text-rose-200"
			>
				{form.deleteError}
			</div>
		{/if}
	</div>
</div>

{#if deleteTarget}
	<div
		class="fixed inset-0 z-50 flex items-center justify-center bg-gray-950/50 px-4 py-6 backdrop-blur-sm"
		role="presentation"
		onclick={closeDeleteModal}
	>
		<div
			class="w-full max-w-lg rounded-2xl border border-rose-200 bg-white p-5 shadow-2xl dark:border-rose-900/60 dark:bg-gray-900"
			role="dialog"
			aria-modal="true"
			aria-labelledby="delete-chat-attempt-title"
			tabindex="-1"
			onclick={(event) => event.stopPropagation()}
			onkeydown={(event) => event.key === 'Escape' && closeDeleteModal()}
		>
			<div class="flex items-start gap-4">
				<div
					class="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-rose-100 text-rose-700 dark:bg-rose-950/40 dark:text-rose-300"
				>
					<Trash2 class="h-5 w-5" />
				</div>
				<div class="min-w-0 flex-1">
					<h2
						id="delete-chat-attempt-title"
						class="text-lg font-semibold text-gray-900 dark:text-white"
					>
						Borrar intento de chat
					</h2>
					<p class="mt-1 text-sm text-gray-600 dark:text-gray-300">
						{deleteTarget.user.username} · {page.data.interactiveChat?.interactive_learning?.name ||
							'Actividad'} · {formatDate(deleteTarget.chat.createdAt)}
					</p>
				</div>
			</div>

			<p
				class="mt-5 rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-800 dark:border-rose-900/60 dark:bg-rose-950/25 dark:text-rose-200"
			>
				Se borrará el transcript, las métricas de este intento y se recalculará el progreso agregado
				del alumno. Esta acción no se puede deshacer.
			</p>

			<form method="POST" action="?/deleteAttempt" class="mt-5 space-y-3">
				<input type="hidden" name="chatId" value={deleteTarget.chat.id} />
				<label class="block">
					<span class="text-sm font-medium text-gray-700 dark:text-gray-200">
						Escribe BORRAR para confirmar
					</span>
					<input
						name="confirm"
						placeholder="BORRAR"
						autocomplete="off"
						class="mt-2 h-11 w-full rounded-2xl border border-rose-200 bg-rose-50 px-3 text-sm text-gray-900 outline-none focus:border-rose-500 dark:border-rose-900/60 dark:bg-rose-950/20 dark:text-gray-100"
					/>
				</label>
				<label class="block">
					<span class="text-sm font-medium text-gray-700 dark:text-gray-200">
						Motivo opcional
					</span>
					<input
						name="reason"
						class="mt-2 h-11 w-full rounded-2xl border border-gray-200 bg-white px-3 text-sm text-gray-900 outline-none focus:border-rose-400 dark:border-gray-700 dark:bg-gray-950 dark:text-gray-100"
					/>
				</label>
				{#if form?.deleteError}
					<p class="text-sm text-rose-700 dark:text-rose-300">{form.deleteError}</p>
				{/if}
				<div class="flex flex-col-reverse gap-2 pt-2 sm:flex-row sm:justify-end">
					<button
						type="button"
						class="inline-flex h-11 items-center justify-center rounded-2xl border border-gray-200 bg-white px-4 text-sm font-medium text-gray-700 transition-colors hover:bg-gray-50 dark:border-gray-700 dark:bg-gray-950 dark:text-gray-200 dark:hover:bg-gray-800"
						onclick={closeDeleteModal}
					>
						Cancelar
					</button>
					<button
						type="submit"
						class="inline-flex h-11 items-center justify-center gap-2 rounded-2xl bg-rose-600 px-4 text-sm font-medium text-white transition-colors hover:bg-rose-700"
					>
						<Trash2 class="h-4 w-4" />
						Borrar intento
					</button>
				</div>
			</form>
		</div>
	</div>
{/if}

<style>
	/* Add any custom styles here */
	/* @reference "../../../../../../../../app.css";
    :global(.toolbar-group) {
        @apply flex flex-wrap items-center gap-2;
    }
    
    @media (max-width: 768px) {
        :global(.toolbar-group) {
            @apply w-full justify-between mb-2;
        }
    } */
</style>
