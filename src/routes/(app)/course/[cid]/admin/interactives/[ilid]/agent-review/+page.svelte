<script lang="ts">
	import { page } from '$app/state';
	import { goto } from '$app/navigation';
	import { SvelteSet } from 'svelte/reactivity';
	import type { PageData } from './$types';
	import { Avatar, Badge, Button, Input, Pagination } from 'flowbite-svelte';
	import {
		ArrowLeft,
		ArrowUp,
		ArrowDown,
		Bot,
		User,
		Wrench,
		ChevronDown,
		ChevronUp,
		Filter,
		RefreshCw,
		Search as SearchIcon,
		XCircle,
		Clock
	} from 'lucide-svelte';
	import { formatDate } from '$lib/helpers/dateUtils';
	import { marked } from 'marked';

	let { data }: { data: PageData } = $props();

	// Filters state — initialise from page.data so the values update on navigation
	let searchTerm = $state(page.data.filters?.search || '');
	let startDate = $state(page.data.filters?.startDate || '');
	let endDate = $state(page.data.filters?.endDate || '');
	let sortDirection = $state(page.data.sorting?.direction || 'desc');
	let showFilters = $state(false);
	let isLoading = $state(false);

	// Expanded sessions tracking — SvelteSet for proper Svelte 5 reactivity
	let expandedSessions = new SvelteSet<string>();

	function toggleSession(sessionId: string) {
		if (expandedSessions.has(sessionId)) {
			expandedSessions.delete(sessionId);
		} else {
			expandedSessions.add(sessionId);
		}
	}

	// Pagination
	let paginationPages = $derived(
		Array.from({ length: data.pagination.totalPages }, (_, i) => {
			const p = i + 1;
			const qs = new URLSearchParams(page.url.search);
			qs.set('page', String(p));
			return { name: String(p), href: `?${qs.toString()}`, active: p === data.pagination.currentPage };
		})
	);

	function navigateToPage(p: number) {
		isLoading = true;
		const qs = new URLSearchParams(page.url.search);
		qs.set('page', String(p));
		goto(`?${qs.toString()}`, { replaceState: true });
	}

	function updateFilters() {
		isLoading = true;
		const qs = new URLSearchParams(page.url.search);
		if (searchTerm) { qs.set('search', searchTerm); } else { qs.delete('search'); }
		if (startDate) { qs.set('startDate', startDate); } else { qs.delete('startDate'); }
		if (endDate) { qs.set('endDate', endDate); } else { qs.delete('endDate'); }
		qs.set('sortDirection', sortDirection);
		qs.set('page', '1');
		goto(`?${qs.toString()}`, { replaceState: true });
	}

	function resetFilters() {
		searchTerm = '';
		startDate = '';
		endDate = '';
		sortDirection = 'desc';
		updateFilters();
	}

	function toggleSort() {
		sortDirection = sortDirection === 'asc' ? 'desc' : 'asc';
		updateFilters();
	}

	$effect(() => {
		if (page.url.searchParams.toString()) isLoading = false;
	});

	// Tool call status helpers
	type BadgeColor = 'green' | 'red' | 'orange' | 'yellow' | 'gray';
	function toolStatusColor(status: string): BadgeColor {
		switch (status) {
			case 'completed': return 'green';
			case 'failed': return 'red';
			case 'rejected': return 'orange';
			case 'awaiting_confirmation': return 'yellow';
			case 'awaiting_ui_response': return 'yellow';
			default: return 'gray';
		}
	}

	function toolStatusLabel(status: string): string {
		switch (status) {
			case 'completed': return 'Completada';
			case 'failed': return 'Fallida';
			case 'rejected': return 'Rechazada';
			case 'awaiting_confirmation': return 'Pendiente';
			case 'awaiting_ui_response': return 'Esperando respuesta UI';
			case 'executing': return 'Ejecutando';
			default: return status;
		}
	}

	function formatJson(raw: string | null | undefined): string {
		if (!raw) return '';
		try {
			return JSON.stringify(JSON.parse(raw), null, 2);
		} catch {
			return raw;
		}
	}

	function renderMarkdown(text: string | null | undefined): string {
		if (!text) return '';
		return marked(text) as string;
	}

	// Pagination range for display
	let startItem = $derived((data.pagination.currentPage - 1) * data.pagination.pageSize + 1);
	let endItem = $derived(
		Math.min(startItem + data.sessions.length - 1, data.pagination.totalCount)
	);
</script>

<div class="min-h-screen bg-gray-50 dark:bg-gray-900">
	<!-- Sticky header -->
	<div class="sticky top-0 z-10 bg-white shadow-sm dark:bg-gray-800">
		<div class="container mx-auto max-w-screen-xl px-4">
			<div class="flex items-center gap-4 py-4">
				<a
					href="/course/{page.params.cid}/admin/interactives/{page.params.ilid}"
					class="-ml-2 rounded-lg p-2 transition-colors hover:bg-gray-100 dark:hover:bg-gray-700"
					title="Volver a la actividad"
				>
					<ArrowLeft size={20} class="text-gray-500 dark:text-gray-400" />
				</a>
				<div class="min-w-0 flex-1">
					<h1 class="truncate text-lg font-semibold text-gray-900 dark:text-white">
						Revisión de sesiones: {data.interactive.name}
					</h1>
				</div>
			</div>
		</div>
	</div>

	<div class="container mx-auto max-w-screen-xl space-y-6 px-4 py-6">

		<!-- Toolbar -->
		<div class="rounded-lg bg-white p-5 shadow dark:bg-gray-800">
			<div class="flex flex-col gap-4 md:flex-row">
				<!-- Search -->
				<div class="flex-1">
					<form onsubmit={(e) => { e.preventDefault(); updateFilters(); }}>
						<div class="relative flex items-center">
							<Input
								placeholder="Buscar por nombre de estudiante..."
								bind:value={searchTerm}
								class="w-full pr-10"
							/>
							<button
								type="submit"
								class="absolute right-0 flex h-full items-center justify-center rounded-r-lg bg-blue-600 px-3 text-white hover:bg-blue-700"
							>
								<SearchIcon class="h-4 w-4" />
							</button>
						</div>
					</form>
				</div>

				<!-- Controls -->
				<div class="flex flex-wrap items-center gap-2">
					<Button
						color={showFilters ? 'light' : 'blue'}
						size="sm"
						onclick={() => (showFilters = !showFilters)}
						class="flex h-10 items-center"
					>
						<Filter class="mr-2 h-4 w-4" />
						{showFilters ? 'Ocultar filtros' : 'Filtros de fecha'}
					</Button>

					<div class="flex h-10 items-center rounded-lg bg-gray-50 px-3 dark:bg-gray-700">
						<span class="mr-2 text-sm text-gray-600 dark:text-gray-400">Ordenar:</span>
						<Button color="light" size="sm" onclick={toggleSort}>
							{#if sortDirection === 'asc'}
								<ArrowUp class="mr-1 h-4 w-4" /> Más antiguo
							{:else}
								<ArrowDown class="mr-1 h-4 w-4" /> Más reciente
							{/if}
						</Button>
					</div>

					<Button color="red" size="sm" onclick={resetFilters} class="flex h-10 items-center">
						<RefreshCw class="mr-2 h-4 w-4" />
						Restablecer
					</Button>
				</div>
			</div>

			<!-- Date filters -->
			{#if showFilters}
				<div class="mt-4 rounded-lg border-t border-gray-200 bg-gray-50 p-4 dark:border-gray-700 dark:bg-gray-700">
					<div class="grid grid-cols-1 gap-4 md:grid-cols-3">
						<div>
							<label for="startDate" class="mb-2 block text-sm font-medium text-gray-900 dark:text-white">
								Fecha de inicio
							</label>
							<Input id="startDate" type="date" bind:value={startDate} class="w-full" />
						</div>
						<div>
							<label for="endDate" class="mb-2 block text-sm font-medium text-gray-900 dark:text-white">
								Fecha de fin
							</label>
							<Input id="endDate" type="date" bind:value={endDate} class="w-full" />
						</div>
						<div class="flex items-end">
							<Button color="blue" onclick={updateFilters} class="h-10 w-full">
								<Filter class="mr-2 h-4 w-4" />
								Aplicar
							</Button>
						</div>
					</div>
				</div>
			{/if}
		</div>

		<!-- Results summary -->
		<div class="flex items-center justify-between rounded-lg bg-white p-3 shadow dark:bg-gray-800">
			<p class="text-sm text-gray-600 dark:text-gray-400">
				{#if data.pagination.totalCount === 0}
					No hay sesiones registradas
				{:else}
					Mostrando {startItem}–{endItem} de {data.pagination.totalCount} sesiones
					{#if data.filters?.search}(filtradas por "{data.filters.search}"){/if}
				{/if}
			</p>
			<span class="text-sm text-gray-500 dark:text-gray-400">
				Página {data.pagination.currentPage} / {data.pagination.totalPages}
			</span>
		</div>

		<!-- Sessions -->
		{#if isLoading}
			<div class="space-y-4">
				{#each [1, 2, 3] as i (i)}
					<div class="h-24 animate-pulse rounded-xl bg-gray-200 dark:bg-gray-700"></div>
				{/each}
			</div>
		{:else if data.sessions.length === 0}
			<div class="rounded-xl bg-white p-10 text-center shadow dark:bg-gray-800">
				<Bot class="mx-auto mb-4 h-12 w-12 text-gray-300 dark:text-gray-600" />
				<p class="text-gray-500 dark:text-gray-400">No hay sesiones para esta actividad aún.</p>
			</div>
		{:else}
			<div class="space-y-4">
				{#each data.sessions as session (session.sessionId)}
					{@const isExpanded = expandedSessions.has(session.sessionId)}
					<div class="overflow-hidden rounded-xl bg-white shadow transition-shadow hover:shadow-md dark:bg-gray-800">
						<!-- Session header (clickable) -->
						<button
							class="flex w-full items-start gap-4 p-4 text-left"
							onclick={() => toggleSession(session.sessionId)}
						>
							<Avatar
								src={session.image || '/images/default_avatar.png'}
								cornerStyle="rounded"
								size="md"
								class="hidden shrink-0 sm:block"
							/>
							<div class="min-w-0 flex-1">
								<div class="mb-1.5 flex flex-wrap items-center gap-2">
									<span class="font-semibold text-gray-900 dark:text-white">
										{session.username ?? 'Usuario'}
									</span>
									{#if session.alias}
										<span class="text-sm italic text-gray-500 dark:text-gray-400">({session.alias})</span>
									{/if}
									{#if session.email}
										<span class="hidden text-sm text-gray-400 sm:inline">{session.email}</span>
									{/if}
								</div>
								<div class="mb-2 flex flex-wrap items-center gap-2">
									<Badge color="blue" class="text-xs">
										<User class="mr-1 h-3 w-3" />
										{session.stats.userMessages} mensajes
									</Badge>
									<Badge color="gray" class="text-xs">
										<Bot class="mr-1 h-3 w-3" />
										{session.stats.assistantMessages} resp. agente
									</Badge>
									{#if session.stats.totalToolCalls > 0}
										<Badge color="purple" class="text-xs">
											<Wrench class="mr-1 h-3 w-3" />
											{session.stats.totalToolCalls} llamadas a herramienta
										</Badge>
									{/if}
									<span class="text-xs text-gray-400 dark:text-gray-500">
										{#if session.chatCreatedAt}
											{formatDate(session.chatCreatedAt)}
										{/if}
									</span>
								</div>
								{#if !isExpanded && session.messages.length > 0}
									{@const firstUserMsg = session.messages.find(m => m.role === 'user')}
									{#if firstUserMsg?.textContent}
										<p class="line-clamp-2 text-sm text-gray-500 dark:text-gray-400">
											{firstUserMsg.textContent}
										</p>
									{/if}
								{/if}
							</div>
							<div class="shrink-0 self-start p-1">
								{#if isExpanded}
									<ChevronUp class="h-5 w-5 text-gray-400" />
								{:else}
									<ChevronDown class="h-5 w-5 text-gray-400" />
								{/if}
							</div>
						</button>

						<!-- Expanded messages -->
						{#if isExpanded}
							<div class="border-t border-gray-100 px-4 pb-4 pt-2 dark:border-gray-700">
								{#if session.messages.length === 0}
									<p class="py-4 text-center text-sm text-gray-400">Sin mensajes en esta sesión.</p>
								{:else}
									<div class="space-y-3">
										{#each session.messages as msg (msg.id)}
											{#if msg.role === 'system'}
												<!-- Skip system messages silently, they're configuration noise -->
											{:else if msg.role === 'user'}
												<div class="flex items-start gap-3">
													<div class="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-blue-100 dark:bg-blue-900/50">
														<User class="h-4 w-4 text-blue-600 dark:text-blue-400" />
													</div>
													<div class="min-w-0 flex-1 rounded-lg bg-blue-50 px-3 py-2 dark:bg-blue-900/20">
														<p class="mb-1 text-xs font-semibold text-blue-600 dark:text-blue-400">Estudiante</p>
														<div class="prose prose-sm dark:prose-invert max-w-none text-gray-800 dark:text-gray-200">
															{@html renderMarkdown(msg.textContent)}
														</div>
													</div>
												</div>
											{:else if msg.role === 'assistant'}
												<div class="flex items-start gap-3">
													<div class="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-green-100 dark:bg-green-900/50">
														<Bot class="h-4 w-4 text-green-600 dark:text-green-400" />
													</div>
													<div class="min-w-0 flex-1">
														{#if msg.textContent}
															<div class="rounded-lg bg-gray-50 px-3 py-2 dark:bg-gray-700/40">
																<p class="mb-1 text-xs font-semibold text-green-600 dark:text-green-400">Agente</p>
																<div class="prose prose-sm dark:prose-invert max-w-none text-gray-800 dark:text-gray-200">
																	{@html renderMarkdown(msg.textContent)}
																</div>
															</div>
														{/if}
														<!-- Tool calls embedded in this assistant turn -->
														{#if msg.toolCalls && msg.toolCalls.length > 0}
															<div class="mt-1 space-y-1">
																{#each msg.toolCalls as tc (tc.id)}
																	<details class="rounded-lg border border-amber-200 bg-amber-50 dark:border-amber-800/50 dark:bg-amber-900/10">
																		<summary class="flex cursor-pointer items-center gap-2 px-3 py-2">
																			<Wrench class="h-3.5 w-3.5 shrink-0 text-amber-600 dark:text-amber-400" />
																			<span class="text-xs font-medium text-amber-700 dark:text-amber-300">
																				{tc.toolDisplayName ?? tc.toolName}
																			</span>
																			<Badge color={toolStatusColor(tc.status)} class="ml-auto text-xs">
																				{toolStatusLabel(tc.status)}
																			</Badge>
																			{#if tc.durationMs}
																				<span class="text-xs text-gray-400">
																					<Clock class="inline h-3 w-3 mr-0.5" />
																					{tc.durationMs}ms
																				</span>
																			{/if}
																		</summary>
																		<div class="border-t border-amber-200 px-3 py-2 dark:border-amber-800/50">
																			{#if tc.arguments && tc.arguments !== '{}'}
																				<p class="mb-1 text-xs font-medium text-gray-500 dark:text-gray-400">Argumentos</p>
																				<pre class="overflow-x-auto rounded bg-gray-100 p-2 text-xs text-gray-700 dark:bg-gray-800 dark:text-gray-300">{formatJson(tc.arguments)}</pre>
																			{/if}
																			{#if tc.result}
																				<p class="mb-1 mt-2 text-xs font-medium text-gray-500 dark:text-gray-400">Resultado</p>
																				<pre class="overflow-x-auto rounded bg-gray-100 p-2 text-xs text-gray-700 dark:bg-gray-800 dark:text-gray-300">{formatJson(tc.result)}</pre>
																			{/if}
																			{#if tc.errorMessage}
																				<p class="mt-2 flex items-center gap-1 text-xs text-red-600 dark:text-red-400">
																					<XCircle class="h-3 w-3" />
																					{tc.errorMessage}
																				</p>
																			{/if}
																		</div>
																	</details>
																{/each}
															</div>
														{/if}
													</div>
												</div>
											{:else if msg.role === 'tool'}
												<!-- Tool results are already shown inline in the assistant turn above; skip standalone tool-role messages -->
											{/if}
										{/each}
									</div>
								{/if}
								<div class="mt-3 flex justify-end">
									<button
										class="flex items-center gap-1 text-xs text-gray-400 hover:text-gray-600 dark:hover:text-gray-300"
										onclick={() => toggleSession(session.sessionId)}
									>
										<ChevronUp class="h-4 w-4" />
										Contraer
									</button>
								</div>
							</div>
						{/if}
					</div>
				{/each}
			</div>

			<!-- Pagination -->
			{#if data.pagination.totalPages > 1}
				<div class="mt-4 flex justify-center">
					<Pagination
						pages={paginationPages}
						previous={() => navigateToPage(data.pagination.currentPage - 1)}
						next={() => navigateToPage(data.pagination.currentPage + 1)}
					>
						{#snippet prevContent()}
							<span class="sr-only">Anterior</span>
							<ChevronUp class="h-5 w-5 -rotate-90" />
						{/snippet}
						{#snippet nextContent()}
							<span class="sr-only">Siguiente</span>
							<ChevronDown class="h-5 w-5 -rotate-90" />
						{/snippet}
					</Pagination>
				</div>
			{/if}
		{/if}
	</div>
</div>
