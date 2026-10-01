<script lang="ts">
	import { goto, invalidateAll } from '$app/navigation';
	import { page } from '$app/state';
	import { ArrowRight, MessageSquarePlus, Settings2, Trash2, PencilLine } from 'lucide-svelte';
	import AgentChatComponent from '$lib/components/agent/AgentChatComponent.svelte';

	interface ThreadSummary {
		id: string;
		workspaceId: string;
		chatId: string;
		createdByUserId: string;
		title: string | null;
		status: 'draft' | 'active' | 'paused' | 'completed';
		summary: string | null;
		lastMessageAt: string | null;
		createdAt: string;
		updatedAt: string;
	}

	interface SelectedThread extends ThreadSummary {
		messages: import('$lib/types/agent').AgentDisplayMessage[];
	}

	interface WorkspaceConfig {
		id: string;
	}

	interface Props {
		title: string;
		description: string;
		workspace: WorkspaceConfig;
		threads: ThreadSummary[];
		selectedThread: SelectedThread | null;
		apiBasePath: string;
		settingsHref: string;
		newThreadLabel: string;
		viewerUser: { username?: string | undefined; alias?: string | undefined };
	}

	let {
		title,
		description,
		workspace,
		threads,
		selectedThread,
		apiBasePath,
		settingsHref,
		newThreadLabel,
		viewerUser
	}: Props = $props();

	let actionError = $state('');
	let isCreating = $state(false);
	let pendingThreadId = $state<string | null>(null);

	function buildThreadUrl(threadId?: string | null): URL {
		const target =
			typeof window !== 'undefined' ? new URL(window.location.href) : new URL(page.url);

		if (threadId) {
			target.searchParams.set('thread', threadId);
		} else {
			target.searchParams.delete('thread');
		}

		return target;
	}

	function formatDate(value: string | null): string {
		if (!value) return 'Sin actividad';

		try {
			return new Intl.DateTimeFormat('es-ES', {
				dateStyle: 'medium',
				timeStyle: 'short'
			}).format(new Date(value));
		} catch {
			return value;
		}
	}

	async function selectThread(threadId: string) {
		await goto(buildThreadUrl(threadId), {
			keepFocus: true,
			noScroll: true,
			invalidateAll: true
		});
	}

	async function createThread() {
		if (isCreating) return;
		actionError = '';
		isCreating = true;

		try {
			const response = await fetch(`${apiBasePath}/workspaces/${workspace.id}/threads`, {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ title: null })
			});
			const payload = await response.json().catch(() => ({}));
			if (!response.ok) {
				throw new Error(payload?.error ?? `Error ${response.status}`);
			}

			await goto(buildThreadUrl(payload.thread.id), {
				keepFocus: true,
				noScroll: true,
				invalidateAll: true
			});
		} catch (error) {
			actionError = error instanceof Error ? error.message : 'No se pudo crear el hilo.';
		} finally {
			isCreating = false;
		}
	}

	async function renameThread(thread: ThreadSummary) {
		const current = thread.title?.trim() || 'Nuevo hilo';
		const nextTitle = window.prompt('Nuevo nombre del hilo', current);
		if (nextTitle === null) return;

		actionError = '';
		pendingThreadId = thread.id;

		try {
			const response = await fetch(`${apiBasePath}/threads/${thread.id}`, {
				method: 'PATCH',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ title: nextTitle })
			});
			const payload = await response.json().catch(() => ({}));
			if (!response.ok) {
				throw new Error(payload?.error ?? `Error ${response.status}`);
			}
			await invalidateAll();
		} catch (error) {
			actionError = error instanceof Error ? error.message : 'No se pudo renombrar el hilo.';
		} finally {
			pendingThreadId = null;
		}
	}

	async function deleteThread(thread: ThreadSummary) {
		const confirmed = window.confirm('Este hilo se ocultara para el staff. ¿Quieres borrarlo?');
		if (!confirmed) return;

		actionError = '';
		pendingThreadId = thread.id;

		try {
			const response = await fetch(`${apiBasePath}/threads/${thread.id}`, {
				method: 'DELETE'
			});
			const payload = await response.json().catch(() => ({}));
			if (!response.ok) {
				throw new Error(payload?.error ?? `Error ${response.status}`);
			}

			if (selectedThread?.id === thread.id) {
				const remaining = threads.filter((item) => item.id !== thread.id);
				await goto(buildThreadUrl(remaining[0]?.id ?? null), {
					keepFocus: true,
					noScroll: true,
					invalidateAll: true
				});
				return;
			}

			await invalidateAll();
		} catch (error) {
			actionError = error instanceof Error ? error.message : 'No se pudo borrar el hilo.';
		} finally {
			pendingThreadId = null;
		}
	}

	async function handleChatComplete() {
		await invalidateAll();
	}
</script>

<div class="space-y-6">
	<section class="rounded-[2rem] border border-slate-200 bg-white p-6 shadow-sm dark:border-slate-700 dark:bg-slate-900">
		<div class="flex flex-col gap-5 lg:flex-row lg:items-start lg:justify-between">
			<div class="max-w-3xl">
				<div class="inline-flex items-center gap-2 rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1 text-xs font-semibold uppercase tracking-wide text-emerald-700 dark:border-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-300">
					Staff agent
				</div>
				<h1 class="mt-4 text-3xl font-semibold tracking-tight text-slate-900 dark:text-white">
					{title}
				</h1>
				<p class="mt-3 max-w-2xl text-sm leading-6 text-slate-600 dark:text-slate-300">
					{description}
				</p>
			</div>

			<div class="flex flex-wrap gap-3">
				<a
					href={settingsHref}
					class="inline-flex items-center justify-center gap-2 rounded-2xl border border-slate-300 bg-white px-4 py-2.5 text-sm font-medium text-slate-700 transition hover:border-slate-400 hover:text-slate-900 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200 dark:hover:border-slate-600 dark:hover:text-white"
				>
					<Settings2 class="h-4 w-4" />
					Ajustes
				</a>
				<button
					type="button"
					class="inline-flex items-center justify-center gap-2 rounded-2xl bg-slate-900 px-4 py-2.5 text-sm font-medium text-white transition hover:bg-slate-700 disabled:opacity-50 dark:bg-white dark:text-slate-900 dark:hover:bg-slate-200"
					onclick={createThread}
					disabled={isCreating}
				>
					<MessageSquarePlus class="h-4 w-4" />
					{isCreating ? 'Creando...' : newThreadLabel}
				</button>
			</div>
		</div>
	</section>

	{#if actionError}
		<div class="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700 dark:border-red-800 dark:bg-red-950/30 dark:text-red-300">
			{actionError}
		</div>
	{/if}

	<div class="grid gap-6 xl:grid-cols-[320px_minmax(0,1fr)]">
		<aside class="rounded-[2rem] border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-700 dark:bg-slate-900">
			<div class="mb-3 flex items-center justify-between px-2">
				<div>
					<p class="text-sm font-semibold text-slate-900 dark:text-white">Hilos compartidos</p>
					<p class="text-xs text-slate-500 dark:text-slate-400">
						{threads.length} hilo(s) visibles para el staff
					</p>
				</div>
			</div>

			<div class="space-y-2">
				{#if threads.length > 0}
					{#each threads as thread (thread.id)}
						<div
							class:text-white={selectedThread?.id === thread.id}
							class:bg-slate-900={selectedThread?.id === thread.id}
							class:border-slate-900={selectedThread?.id === thread.id}
							class:text-slate-900={selectedThread?.id !== thread.id}
							class:bg-slate-50={selectedThread?.id !== thread.id}
							class:border-slate-200={selectedThread?.id !== thread.id}
							class="group rounded-2xl border px-4 py-3 text-left transition hover:border-slate-300 hover:bg-slate-100 dark:border-slate-700 dark:bg-slate-800/60 dark:text-slate-100 dark:hover:border-slate-600 dark:hover:bg-slate-800"
						>
							<button
								type="button"
								class="block w-full text-left"
								onclick={() => selectThread(thread.id)}
							>
								<div class="flex items-start justify-between gap-3">
									<div class="min-w-0">
										<div class="truncate text-sm font-semibold">
											{thread.title?.trim() || 'Nuevo hilo'}
										</div>
										<div
											class:text-slate-300={selectedThread?.id === thread.id}
											class:text-slate-500={selectedThread?.id !== thread.id}
											class="mt-1 line-clamp-2 text-xs"
										>
											{thread.summary?.trim() || 'Sin resumen todavía.'}
										</div>
									</div>

									<ArrowRight class="mt-0.5 h-4 w-4 shrink-0 opacity-60" />
								</div>

								<div
									class:text-slate-300={selectedThread?.id === thread.id}
									class:text-slate-400={selectedThread?.id !== thread.id}
									class="mt-3 flex items-center justify-between text-[11px] uppercase tracking-wide"
								>
									<span>{thread.status}</span>
									<span>{formatDate(thread.lastMessageAt ?? thread.updatedAt)}</span>
								</div>
							</button>

							<div class="mt-3 flex items-center gap-2">
								<button
									type="button"
									class="inline-flex items-center gap-1 rounded-xl border border-transparent px-2 py-1 text-xs transition hover:border-white/20 hover:bg-white/10"
									onclick={(event) => {
										event.stopPropagation();
										void renameThread(thread);
									}}
									disabled={pendingThreadId === thread.id}
								>
									<PencilLine class="h-3.5 w-3.5" />
									Renombrar
								</button>
								<button
									type="button"
									class="inline-flex items-center gap-1 rounded-xl border border-transparent px-2 py-1 text-xs text-red-600 transition hover:border-red-200 hover:bg-red-50 dark:text-red-300 dark:hover:border-red-900 dark:hover:bg-red-950/40"
									onclick={(event) => {
										event.stopPropagation();
										void deleteThread(thread);
									}}
									disabled={pendingThreadId === thread.id}
								>
									<Trash2 class="h-3.5 w-3.5" />
									Borrar
								</button>
							</div>
						</div>
					{/each}
				{:else}
					<div class="rounded-2xl border border-dashed border-slate-300 bg-slate-50 px-4 py-6 text-sm text-slate-600 dark:border-slate-700 dark:bg-slate-800/40 dark:text-slate-300">
						Todavia no hay hilos. Crea uno nuevo para empezar a consultar este espacio.
					</div>
				{/if}
			</div>
		</aside>

		<section class="rounded-[2rem] border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-700 dark:bg-slate-900">
			{#if selectedThread}
				<div class="mb-4 flex flex-col gap-1 px-2">
					<div class="text-sm font-semibold text-slate-900 dark:text-white">
						{selectedThread.title?.trim() || 'Nuevo hilo'}
					</div>
					<div class="text-xs text-slate-500 dark:text-slate-400">
						Hilo compartido del staff. Lo que preguntes aqui queda disponible para el resto del equipo docente.
					</div>
				</div>

				{#key selectedThread.id}
					<AgentChatComponent
						initialMessages={selectedThread.messages}
						apiEndpoint={`${apiBasePath}/threads/${selectedThread.id}/ask`}
						user={viewerUser}
						onComplete={handleChatComplete}
					/>
				{/key}
			{:else}
				<div class="flex min-h-[28rem] items-center justify-center px-6 py-12">
					<div class="max-w-md text-center">
						<h2 class="text-xl font-semibold text-slate-900 dark:text-white">
							No hay ningun hilo seleccionado
						</h2>
						<p class="mt-3 text-sm leading-6 text-slate-600 dark:text-slate-300">
							Crea un hilo nuevo para empezar a preguntar por el curso o la actividad. El chat usara las herramientas habilitadas en este workspace.
						</p>
						<button
							type="button"
							class="mt-6 inline-flex items-center justify-center gap-2 rounded-2xl bg-slate-900 px-4 py-2.5 text-sm font-medium text-white transition hover:bg-slate-700 dark:bg-white dark:text-slate-900 dark:hover:bg-slate-200"
							onclick={createThread}
							disabled={isCreating}
						>
							<MessageSquarePlus class="h-4 w-4" />
							{isCreating ? 'Creando...' : newThreadLabel}
						</button>
					</div>
				</div>
			{/if}
		</section>
	</div>
</div>
