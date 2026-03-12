<script lang="ts">
	import { goto } from '$app/navigation';
	import { resolve } from '$app/paths';
	import { page } from '$app/state';
	import { Avatar, Pagination } from 'flowbite-svelte';
	import {
		ArrowDown,
		ArrowLeft,
		ArrowUp,
		Bot,
		CalendarRange,
		ChevronDown,
		ChevronUp,
		Filter,
		RefreshCw,
		Search,
		TriangleAlert,
		Wrench
	} from 'lucide-svelte';
	import { formatDate } from '$lib/helpers/dateUtils';
	import type { PageProps } from './$types';

	let { data }: PageProps = $props();

	let searchTerm = $state(page.data.filters?.search || '');
	let startDate = $state(page.data.filters?.startDate || '');
	let endDate = $state(page.data.filters?.endDate || '');
	let studentMessagesFilter = $state(page.data.filters?.studentMessages || 'all');
	let sortDirection = $state(page.data.sorting?.direction || 'desc');
	let showFilters = $state(false);
	let isLoading = $state(false);

	$effect(() => {
		searchTerm = page.data.filters?.search || '';
		startDate = page.data.filters?.startDate || '';
		endDate = page.data.filters?.endDate || '';
		studentMessagesFilter = page.data.filters?.studentMessages || 'all';
		sortDirection = page.data.sorting?.direction || 'desc';
		isLoading = false;
	});

	const paginationPages = $derived(
		Array.from({ length: data.pagination.totalPages }, (_, index) => {
			const nextPage = index + 1;
			const params = new URLSearchParams(page.url.search);
			params.set('page', String(nextPage));
			return {
				name: String(nextPage),
				href: `?${params.toString()}`,
				active: nextPage === data.pagination.currentPage
			};
		})
	);

	const startItem = $derived((data.pagination.currentPage - 1) * data.pagination.pageSize + 1);
	const endItem = $derived(
		Math.min(startItem + data.sessions.length - 1, data.pagination.totalCount)
	);

	function updateFilters() {
		isLoading = true;

		const params = new URLSearchParams(page.url.search);
		if (searchTerm) {
			params.set('search', searchTerm);
		} else {
			params.delete('search');
		}

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

		if (studentMessagesFilter !== 'all') {
			params.set('studentMessages', studentMessagesFilter);
		} else {
			params.delete('studentMessages');
		}

		params.set('sortDirection', sortDirection);
		params.set('page', '1');

		const targetUrl = new URL(page.url);
		targetUrl.search = params.toString();
		goto(targetUrl, { replaceState: true });
	}

	function resetFilters() {
		searchTerm = '';
		startDate = '';
		endDate = '';
		studentMessagesFilter = 'all';
		sortDirection = 'desc';
		updateFilters();
	}

	function toggleSortDirection() {
		sortDirection = sortDirection === 'asc' ? 'desc' : 'asc';
		updateFilters();
	}

	function navigateToPage(nextPage: number) {
		if (nextPage < 1 || nextPage > data.pagination.totalPages) return;
		isLoading = true;
		const params = new URLSearchParams(page.url.search);
		params.set('page', String(nextPage));
		const targetUrl = new URL(page.url);
		targetUrl.search = params.toString();
		goto(targetUrl, { replaceState: true });
	}

	function handleSubmit(event: SubmitEvent) {
		event.preventDefault();
		updateFilters();
	}

	function statusBadgeClasses(status: string): string {
		switch (status) {
			case 'attention':
				return 'border-rose-200 bg-rose-50 text-rose-700 dark:border-rose-900/60 dark:bg-rose-950/30 dark:text-rose-300';
			case 'pending':
				return 'border-amber-200 bg-amber-50 text-amber-700 dark:border-amber-900/60 dark:bg-amber-950/30 dark:text-amber-300';
			default:
				return 'border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-900/60 dark:bg-emerald-950/30 dark:text-emerald-300';
		}
	}

	function statusLabel(status: string): string {
		switch (status) {
			case 'attention':
				return 'Con incidencias';
			case 'pending':
				return 'En curso';
			default:
				return 'Finalizada';
		}
	}

	function formatTime(seconds: number): string {
		if (seconds < 60) return `${seconds} s`;
		const minutes = Math.floor(seconds / 60);
		const remainingSeconds = seconds % 60;
		return `${minutes} min ${remainingSeconds} s`;
	}
</script>

<div class="min-h-screen bg-[radial-gradient(circle_at_top_left,_rgba(56,189,248,0.08),_transparent_24%),radial-gradient(circle_at_top_right,_rgba(16,185,129,0.1),_transparent_22%),linear-gradient(180deg,_#f8fafc_0%,_#eef2f7_100%)] dark:bg-[radial-gradient(circle_at_top_left,_rgba(56,189,248,0.09),_transparent_24%),radial-gradient(circle_at_top_right,_rgba(16,185,129,0.08),_transparent_22%),linear-gradient(180deg,_#020617_0%,_#111827_100%)]">
	<div class="sticky top-0 z-20 border-b border-white/70 bg-white/85 backdrop-blur-xl dark:border-slate-800 dark:bg-slate-950/85">
		<div class="mx-auto flex max-w-7xl items-center gap-4 px-4 py-4 sm:px-6">
			<a
				href={resolve(`/course/${page.params.cid}/admin/interactives/${page.params.ilid}`)}
				class="inline-flex h-10 w-10 items-center justify-center rounded-2xl border border-slate-200 bg-white text-slate-600 transition-colors hover:border-sky-300 hover:text-sky-700 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300 dark:hover:border-sky-700 dark:hover:text-sky-200"
				aria-label="Volver a la actividad"
			>
				<ArrowLeft class="h-4 w-4" />
			</a>

			<div class="min-w-0 flex-1">
				<p class="text-[11px] font-semibold uppercase tracking-[0.24em] text-sky-700 dark:text-sky-300">
					Revision de sesiones
				</p>
				<h1 class="truncate text-lg font-semibold text-slate-900 dark:text-white sm:text-xl">
					{data.interactive.name}
				</h1>
			</div>
		</div>
	</div>

	<div class="mx-auto max-w-7xl space-y-6 px-4 py-6 sm:px-6">
		<section class="rounded-[30px] border border-slate-200/80 bg-white/92 p-5 shadow-sm dark:border-slate-800 dark:bg-slate-900/88">
			<div class="flex flex-col gap-4 lg:flex-row lg:items-center">
				<form class="flex-1" onsubmit={handleSubmit}>
					<div class="relative">
						<input
							bind:value={searchTerm}
							type="search"
							placeholder="Buscar por nombre de estudiante..."
							class="h-12 w-full rounded-2xl border border-slate-200 bg-slate-50 pl-12 pr-12 text-sm text-slate-900 shadow-sm outline-none transition focus:border-sky-400 focus:bg-white dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100 dark:focus:border-sky-700"
						/>
						<Search class="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
						<button
							type="submit"
							class="absolute right-1.5 top-1.5 inline-flex h-9 items-center justify-center rounded-xl bg-sky-600 px-3 text-white transition-colors hover:bg-sky-700"
						>
							Buscar
						</button>
					</div>
				</form>

				<div class="flex flex-wrap items-center gap-2">
					<button
						type="button"
						onclick={() => (showFilters = !showFilters)}
						class="inline-flex h-11 items-center gap-2 rounded-2xl border border-slate-200 bg-white px-4 text-sm font-medium text-slate-700 transition-colors hover:border-sky-300 hover:text-sky-700 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200 dark:hover:border-sky-700 dark:hover:text-sky-200"
					>
						<Filter class="h-4 w-4" />
						Filtros
						{#if showFilters}
							<ChevronUp class="h-4 w-4" />
						{:else}
							<ChevronDown class="h-4 w-4" />
						{/if}
					</button>

					<button
						type="button"
						onclick={toggleSortDirection}
						class="inline-flex h-11 items-center gap-2 rounded-2xl border border-slate-200 bg-white px-4 text-sm font-medium text-slate-700 transition-colors hover:border-sky-300 hover:text-sky-700 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200 dark:hover:border-sky-700 dark:hover:text-sky-200"
					>
						{#if sortDirection === 'asc'}
							<ArrowUp class="h-4 w-4" />
							Más antiguas primero
						{:else}
							<ArrowDown class="h-4 w-4" />
							Más recientes primero
						{/if}
					</button>

					<button
						type="button"
						onclick={resetFilters}
						class="inline-flex h-11 items-center gap-2 rounded-2xl border border-rose-200 bg-rose-50 px-4 text-sm font-medium text-rose-700 transition-colors hover:bg-rose-100 dark:border-rose-900/60 dark:bg-rose-950/20 dark:text-rose-300 dark:hover:bg-rose-950/35"
					>
						<RefreshCw class="h-4 w-4" />
						Restablecer
					</button>
				</div>
			</div>

			{#if showFilters}
				<div class="mt-4 grid gap-4 rounded-[26px] border border-slate-200/80 bg-slate-50/90 p-4 dark:border-slate-800 dark:bg-slate-950/60 md:grid-cols-2 xl:grid-cols-[1fr_1fr_280px_auto]">
					<label class="block">
						<span class="mb-2 flex items-center gap-2 text-sm font-medium text-slate-700 dark:text-slate-200">
							<CalendarRange class="h-4 w-4" />
							Fecha de inicio
						</span>
						<input
							bind:value={startDate}
							type="date"
							class="h-11 w-full rounded-2xl border border-slate-200 bg-white px-4 text-sm text-slate-900 outline-none transition focus:border-sky-400 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100 dark:focus:border-sky-700"
						/>
					</label>

					<label class="block">
						<span class="mb-2 flex items-center gap-2 text-sm font-medium text-slate-700 dark:text-slate-200">
							<CalendarRange class="h-4 w-4" />
							Fecha de fin
						</span>
						<input
							bind:value={endDate}
							type="date"
							class="h-11 w-full rounded-2xl border border-slate-200 bg-white px-4 text-sm text-slate-900 outline-none transition focus:border-sky-400 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100 dark:focus:border-sky-700"
						/>
					</label>

					<label class="block">
						<span class="mb-2 flex items-center gap-2 text-sm font-medium text-slate-700 dark:text-slate-200">
							<Bot class="h-4 w-4" />
							Mensajes del alumno
						</span>
						<select
							bind:value={studentMessagesFilter}
							class="h-11 w-full rounded-2xl border border-slate-200 bg-white px-4 text-sm text-slate-900 outline-none transition focus:border-sky-400 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100 dark:focus:border-sky-700"
						>
							<option value="all">Todas las sesiones</option>
							<option value="with">Con mensajes del alumno</option>
							<option value="without">Sin mensajes del alumno</option>
						</select>
					</label>

					<div class="flex items-end">
						<button
							type="button"
							onclick={updateFilters}
							class="inline-flex h-11 w-full items-center justify-center gap-2 rounded-2xl bg-sky-600 px-4 text-sm font-medium text-white transition-colors hover:bg-sky-700 md:w-auto"
						>
							<Filter class="h-4 w-4" />
							Aplicar
						</button>
					</div>
				</div>
			{/if}
		</section>

		<section class="flex flex-col gap-3 rounded-[28px] border border-slate-200/80 bg-white/92 px-5 py-4 shadow-sm dark:border-slate-800 dark:bg-slate-900/88 sm:flex-row sm:items-center sm:justify-between">
			<p class="text-sm text-slate-600 dark:text-slate-300">
				{#if data.pagination.totalCount === 0}
					No hay sesiones registradas para esta actividad.
				{:else}
					Mostrando {startItem}-{endItem} de {data.pagination.totalCount} sesiones
					{#if data.filters?.search}
						para "{data.filters.search}"
					{/if}
				{/if}
			</p>
			<p class="text-sm text-slate-500 dark:text-slate-400">
				Página {data.pagination.currentPage} de {data.pagination.totalPages}
			</p>
		</section>

		{#if isLoading}
			<div class="space-y-4">
				{#each [1, 2, 3] as skeleton (skeleton)}
					<div class="h-52 animate-pulse rounded-[28px] bg-slate-200/70 dark:bg-slate-800/80"></div>
				{/each}
			</div>
		{:else if data.sessions.length === 0}
			<section class="rounded-[30px] border border-slate-200/80 bg-white/92 px-6 py-16 text-center shadow-sm dark:border-slate-800 dark:bg-slate-900/88">
				<div class="mx-auto flex h-16 w-16 items-center justify-center rounded-3xl bg-slate-100 text-slate-400 dark:bg-slate-800 dark:text-slate-500">
					<Bot class="h-8 w-8" />
				</div>
				<h2 class="mt-4 text-lg font-semibold text-slate-900 dark:text-white">
					Aún no hay sesiones que revisar
				</h2>
				<p class="mt-2 text-sm text-slate-600 dark:text-slate-300">
					Cuando los estudiantes interactúen con el agente, aparecerán aquí con sus métricas de resumen.
				</p>
			</section>
		{:else}
			<div class="space-y-4">
				{#each data.sessions as session (session.sessionId)}
					<article class="rounded-[32px] border border-slate-200/80 bg-white/95 p-5 shadow-sm transition-shadow hover:shadow-md dark:border-slate-800 dark:bg-slate-900/90">
						<div class="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
							<div class="flex min-w-0 gap-4">
								<Avatar
									src={session.image || '/images/default_avatar.png'}
									cornerStyle="rounded"
									size="lg"
									class="mt-1 hidden shrink-0 sm:block"
								/>

								<div class="min-w-0 flex-1">
									<div class="flex flex-wrap items-center gap-2">
										<h2 class="text-lg font-semibold text-slate-900 dark:text-white">
											{session.username ?? 'Usuario'}
										</h2>
										{#if session.alias}
											<span class="text-sm italic text-slate-500 dark:text-slate-400">
												({session.alias})
											</span>
										{/if}
										<span
											class={`rounded-full border px-2.5 py-1 text-[11px] font-semibold uppercase tracking-[0.16em] ${statusBadgeClasses(session.status)}`}
										>
											{statusLabel(session.status)}
										</span>
									</div>

									<div class="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-slate-500 dark:text-slate-400">
										{#if session.email}
											<span class="break-all">{session.email}</span>
										{/if}
										<span>
											Ultima actividad: {formatDate(session.lastActivityAt ?? session.chatCreatedAt)}
										</span>
									</div>
								</div>
							</div>

							<a
								href={resolve(`/agent-chat/${page.params.ilid}/view/${session.chatId}`)}
								class="inline-flex items-center justify-center rounded-2xl bg-slate-900 px-4 py-2.5 text-sm font-medium text-white transition-colors hover:bg-slate-700 dark:bg-white dark:text-slate-900 dark:hover:bg-slate-200"
							>
								Ver actividad
							</a>
						</div>

						<div class="mt-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
							<div class="rounded-3xl bg-slate-100/90 px-4 py-3 dark:bg-slate-800/80">
								<p class="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500 dark:text-slate-400">
									Mensajes alumno
								</p>
								<p class="mt-1 text-2xl font-semibold text-slate-900 dark:text-white">
									{session.stats.userMessages}
								</p>
							</div>
							<div class="rounded-3xl bg-slate-100/90 px-4 py-3 dark:bg-slate-800/80">
								<p class="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500 dark:text-slate-400">
									Mensajes agente
								</p>
								<p class="mt-1 text-2xl font-semibold text-slate-900 dark:text-white">
									{session.stats.assistantMessages}
								</p>
							</div>
							<div class="rounded-3xl bg-slate-100/90 px-4 py-3 dark:bg-slate-800/80">
								<p class="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500 dark:text-slate-400">
									Tool calls
								</p>
								<p class="mt-1 text-2xl font-semibold text-slate-900 dark:text-white">
									{session.stats.totalToolCalls}
								</p>
							</div>
							<div class="rounded-3xl bg-slate-100/90 px-4 py-3 dark:bg-slate-800/80">
								<p class="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500 dark:text-slate-400">
									Componentes UI
								</p>
								<p class="mt-1 text-2xl font-semibold text-slate-900 dark:text-white">
									{session.stats.totalUiComponents}
								</p>
							</div>
							<div class="rounded-3xl bg-slate-100/90 px-4 py-3 dark:bg-slate-800/80">
								<p class="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500 dark:text-slate-400">
									Tiempo total
								</p>
								<p class="mt-1 text-2xl font-semibold text-slate-900 dark:text-white">
									{formatTime(session.globalStats.totalTimeSpentSeconds)}
								</p>
							</div>
						</div>

						<div class="mt-5 grid gap-4 xl:grid-cols-[minmax(0,1fr)_auto]">
							<div class="rounded-[28px] border border-slate-200/80 bg-slate-50/80 px-4 py-4 dark:border-slate-800 dark:bg-slate-950/50">
								{#if session.finalization?.payload.summary}
									<p class="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500 dark:text-slate-400">
										Resumen de finalización
									</p>
									<p class="mt-2 text-sm leading-6 text-slate-700 dark:text-slate-200">
										{session.finalization.payload.summary}
									</p>

									{#if session.finalization.payload.feedback}
										<div class="mt-4 border-t border-slate-200/80 pt-4 dark:border-slate-800">
											<p class="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500 dark:text-slate-400">
												Feedback final
											</p>
											<p class="mt-2 text-sm leading-6 text-slate-600 dark:text-slate-300">
												{session.finalization.payload.feedback}
											</p>
										</div>
									{/if}

									{#if session.finalization.payload.result || session.finalization.payload.score !== undefined}
										<div class="mt-4 grid gap-3 sm:grid-cols-2">
											{#if session.finalization.payload.result}
												<div class="rounded-2xl bg-white/80 px-4 py-3 dark:bg-slate-900/70">
													<p class="text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-500 dark:text-slate-400">
														Resultado
													</p>
													<p class="mt-1 text-sm font-medium text-slate-800 dark:text-slate-100">
														{session.finalization.payload.result}
													</p>
												</div>
											{/if}

											{#if session.finalization.payload.score !== undefined}
												<div class="rounded-2xl bg-white/80 px-4 py-3 dark:bg-slate-900/70">
													<p class="text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-500 dark:text-slate-400">
														Score
													</p>
													<p class="mt-1 text-sm font-medium text-slate-800 dark:text-slate-100">
														{Math.round(session.finalization.payload.score * 100)}%
													</p>
												</div>
											{/if}
										</div>
									{/if}
								{:else}
									<p class="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500 dark:text-slate-400">
										Apertura de la sesion
									</p>
									<p class="mt-2 text-sm leading-6 text-slate-700 dark:text-slate-200">
										{session.previewText || 'Sin contenido textual util registrado.'}
									</p>

									{#if session.latestText}
										<div class="mt-4 border-t border-slate-200/80 pt-4 dark:border-slate-800">
										<p class="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500 dark:text-slate-400">
											Ultimo contenido util
										</p>
										<p class="mt-2 text-sm leading-6 text-slate-600 dark:text-slate-300">
											{session.latestText}
										</p>
									</div>
									{/if}
								{/if}
							</div>

							<div class="flex flex-wrap content-start gap-2 xl:w-56">
								{#if session.finalization}
									<span class="inline-flex items-center gap-1 rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1.5 text-xs font-medium text-emerald-700 dark:border-emerald-900/60 dark:bg-emerald-950/25 dark:text-emerald-300">
										<Bot class="h-3.5 w-3.5" />
										Finalizada
									</span>
								{/if}

								{#if session.stats.failedToolCalls > 0}
									<span class="inline-flex items-center gap-1 rounded-full border border-rose-200 bg-rose-50 px-3 py-1.5 text-xs font-medium text-rose-700 dark:border-rose-900/60 dark:bg-rose-950/25 dark:text-rose-300">
										<TriangleAlert class="h-3.5 w-3.5" />
										{session.stats.failedToolCalls} fallidas
									</span>
								{/if}

								{#if session.stats.pendingToolCalls > 0}
									<span class="inline-flex items-center gap-1 rounded-full border border-amber-200 bg-amber-50 px-3 py-1.5 text-xs font-medium text-amber-700 dark:border-amber-900/60 dark:bg-amber-950/25 dark:text-amber-300">
										<Wrench class="h-3.5 w-3.5" />
										{session.stats.pendingToolCalls} pendientes
									</span>
								{/if}

								{#if !session.hasStudentMessages}
									<span class="inline-flex items-center gap-1 rounded-full border border-slate-200 bg-slate-50 px-3 py-1.5 text-xs font-medium text-slate-700 dark:border-slate-700 dark:bg-slate-800/70 dark:text-slate-300">
										<Bot class="h-3.5 w-3.5" />
										Sin mensajes del alumno
									</span>
								{/if}

								{#if session.globalStats.totalPasteCount > 0}
									<span class="inline-flex items-center gap-1 rounded-full border border-sky-200 bg-sky-50 px-3 py-1.5 text-xs font-medium text-sky-700 dark:border-sky-900/60 dark:bg-sky-950/25 dark:text-sky-300">
										<Bot class="h-3.5 w-3.5" />
										{session.globalStats.totalPasteCount} pegados
									</span>
								{/if}
							</div>
						</div>
					</article>
				{/each}
			</div>

			{#if data.pagination.totalPages > 1}
				<div class="mt-6 flex justify-center">
					<Pagination
						pages={paginationPages}
						previous={() => navigateToPage(data.pagination.currentPage - 1)}
						next={() => navigateToPage(data.pagination.currentPage + 1)}
					/>
				</div>
			{/if}
		{/if}
	</div>
</div>
