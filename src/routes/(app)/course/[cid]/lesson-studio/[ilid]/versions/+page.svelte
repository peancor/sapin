<script lang="ts">
	import type { PageProps } from './$types';
	import { enhance } from '$app/forms';
	import { resolve } from '$app/paths';
	import { page } from '$app/state';
	import { lessonDebuggerHref, lessonFlowHref } from '$lib/lesson/lessonStudioNavigation';
	import {
		Archive,
		Bug,
		CheckCircle2,
		GitCompareArrows,
		History,
		Route,
		ShieldAlert,
		UploadCloud
	} from 'lucide-svelte';

	let { data, form }: PageProps = $props();
	let pendingAction = $state<string | null>(null);

	const cid = $derived(page.params.cid ?? '');
	const ilid = $derived(page.params.ilid ?? '');
	const diff = $derived(data.revisionSummary.diff);
	const impact = $derived(data.revisionSummary.impact);
	const hasDraftChanges = $derived(diff.totalChangedBlocks > 0 || diff.entryBlockChanged);
	const flowHref = $derived(lessonFlowHref({ cid, ilid }));
	const debugHref = $derived(lessonDebuggerHref({ cid, ilid }, { source: 'studio', mode: 'draft' }));
</script>

<div
	class="min-h-dvh bg-[linear-gradient(180deg,_#fff7ed_0%,_#f8fafc_42%,_#eef2f7_100%)] px-4 py-6 text-slate-950 sm:px-6 lg:px-8 dark:bg-[linear-gradient(180deg,_#1c1917_0%,_#0f172a_52%,_#020617_100%)] dark:text-slate-100"
>
	<div class="mx-auto max-w-7xl space-y-6">
		<section class="rounded-[28px] border border-amber-200/70 bg-white/92 p-6 shadow-sm dark:border-amber-900/40 dark:bg-slate-900/86">
			<div class="flex flex-col gap-5 lg:flex-row lg:items-start lg:justify-between">
				<div class="max-w-3xl">
					<div class="flex items-center gap-3">
						<div class="rounded-2xl bg-amber-100 p-3 text-amber-700 dark:bg-amber-950/40 dark:text-amber-300">
							<History class="h-5 w-5" />
						</div>
						<div>
							<p class="text-[11px] font-semibold tracking-[0.2em] text-amber-700 uppercase dark:text-amber-300">
								Versiones
							</p>
							<h1 class="text-2xl font-semibold text-slate-950 dark:text-white">
								Publicación de {data.activity.name}
							</h1>
						</div>
					</div>
					<p class="mt-4 text-sm leading-6 text-slate-600 dark:text-slate-300">
						El borrador y la revisión publicada conviven. Publicar no migra intentos ya iniciados:
						los intentos existentes quedan ligados a su revisión original.
					</p>
				</div>

				<div class="flex flex-wrap gap-2">
					<a
						href={resolve(flowHref as any)}
						class="inline-flex items-center justify-center rounded-2xl border border-slate-300 bg-white px-4 py-2.5 text-sm font-medium text-slate-700 transition hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200 dark:hover:bg-slate-800"
					>
						<Route class="mr-2 h-4 w-4" />
						Abrir mapa
					</a>
					<a
						href={resolve(debugHref as any)}
						class="inline-flex items-center justify-center rounded-2xl border border-sky-300 bg-sky-50 px-4 py-2.5 text-sm font-medium text-sky-800 transition hover:bg-sky-100 dark:border-sky-900/40 dark:bg-sky-950/30 dark:text-sky-200"
					>
						<Bug class="mr-2 h-4 w-4" />
						Probar borrador
					</a>
				</div>
			</div>
		</section>

		{#if form?.error}
			<div class="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-800 dark:border-rose-900/50 dark:bg-rose-950/30 dark:text-rose-200">
				{form.error}
			</div>
		{/if}

		{#if form?.success && form?.message}
			<div class="rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800 dark:border-emerald-900/50 dark:bg-emerald-950/30 dark:text-emerald-200">
				<CheckCircle2 class="mr-1 inline h-4 w-4" />
				{form.message}
			</div>
		{/if}

		<section class="grid gap-4 lg:grid-cols-2">
			<article class="rounded-[28px] border border-slate-200/80 bg-white/92 p-5 shadow-sm dark:border-slate-800 dark:bg-slate-900/88">
				<div class="flex items-start justify-between gap-4">
					<div>
						<p class="text-[11px] font-semibold tracking-[0.18em] text-slate-500 uppercase dark:text-slate-400">
							Publicado
						</p>
						<h2 class="mt-2 text-3xl font-semibold text-slate-950 dark:text-white">
							Rev #{data.revisionSummary.published.revisionNumber}
						</h2>
					</div>
					<div class="rounded-2xl bg-emerald-100 p-3 text-emerald-700 dark:bg-emerald-950/35 dark:text-emerald-300">
						<UploadCloud class="h-5 w-5" />
					</div>
				</div>
				<p class="mt-4 text-sm text-slate-600 dark:text-slate-300">
					Publicado el {data.revisionSummary.published.publishedAt?.toLocaleString('es-ES') ?? 'sin fecha registrada'}.
				</p>
			</article>

			<article class="rounded-[28px] border border-slate-200/80 bg-white/92 p-5 shadow-sm dark:border-slate-800 dark:bg-slate-900/88">
				<div class="flex items-start justify-between gap-4">
					<div>
						<p class="text-[11px] font-semibold tracking-[0.18em] text-slate-500 uppercase dark:text-slate-400">
							Borrador
						</p>
						<h2 class="mt-2 text-3xl font-semibold text-slate-950 dark:text-white">
							Rev #{data.revisionSummary.draft.revisionNumber}
						</h2>
					</div>
					<div class="rounded-2xl bg-amber-100 p-3 text-amber-700 dark:bg-amber-950/35 dark:text-amber-300">
						<Archive class="h-5 w-5" />
					</div>
				</div>
				<p class="mt-4 text-sm text-slate-600 dark:text-slate-300">
					Actualizado el {data.revisionSummary.draft.updatedAt.toLocaleString('es-ES')}.
				</p>
			</article>
		</section>

		<section class="grid gap-4 xl:grid-cols-[minmax(0,1.25fr)_minmax(320px,0.75fr)]">
			<div class="rounded-[30px] border border-slate-200/80 bg-white/92 p-6 shadow-sm dark:border-slate-800 dark:bg-slate-900/88">
				<div class="flex items-center gap-3">
					<div class="rounded-2xl bg-sky-100 p-3 text-sky-700 dark:bg-sky-950/40 dark:text-sky-300">
						<GitCompareArrows class="h-5 w-5" />
					</div>
					<div>
						<h2 class="text-lg font-semibold text-slate-950 dark:text-white">Diff visible</h2>
						<p class="text-sm text-slate-500 dark:text-slate-400">
							Cambios entre publicado y borrador.
						</p>
					</div>
				</div>

				<div class="mt-6 grid gap-3 sm:grid-cols-4">
					<div class="rounded-2xl bg-slate-100 px-4 py-3 dark:bg-slate-800/80">
						<p class="text-xs text-slate-500 dark:text-slate-400">Añadidos</p>
						<p class="mt-1 text-2xl font-semibold">{diff.addedBlockIds.length}</p>
					</div>
					<div class="rounded-2xl bg-slate-100 px-4 py-3 dark:bg-slate-800/80">
						<p class="text-xs text-slate-500 dark:text-slate-400">Eliminados</p>
						<p class="mt-1 text-2xl font-semibold">{diff.removedBlockIds.length}</p>
					</div>
					<div class="rounded-2xl bg-slate-100 px-4 py-3 dark:bg-slate-800/80">
						<p class="text-xs text-slate-500 dark:text-slate-400">Editados</p>
						<p class="mt-1 text-2xl font-semibold">{diff.changedBlockIds.length}</p>
					</div>
					<div class="rounded-2xl bg-slate-100 px-4 py-3 dark:bg-slate-800/80">
						<p class="text-xs text-slate-500 dark:text-slate-400">Entrada</p>
						<p class="mt-1 text-sm font-semibold">
							{diff.entryBlockChanged ? 'Cambia' : 'Igual'}
						</p>
					</div>
				</div>

				<div class="mt-5 rounded-2xl border border-slate-200 px-4 py-4 dark:border-slate-800">
					<p class="text-sm font-medium text-slate-950 dark:text-white">
						{hasDraftChanges
							? `${diff.totalChangedBlocks} bloque${diff.totalChangedBlocks === 1 ? '' : 's'} con cambios visibles.`
							: 'El borrador coincide con la revisión publicada.'}
					</p>
					<p class="mt-2 text-sm text-slate-600 dark:text-slate-300">
						{diff.entryBlockChanged
							? 'El bloque de entrada cambiará al publicar.'
							: 'El bloque de entrada se mantiene.'}
					</p>
				</div>
			</div>

			<aside class="space-y-4">
				<div class="rounded-[30px] border border-slate-200/80 bg-white/92 p-5 shadow-sm dark:border-slate-800 dark:bg-slate-900/88">
					<div class="flex items-center gap-3">
						<div class="rounded-2xl bg-rose-100 p-3 text-rose-700 dark:bg-rose-950/35 dark:text-rose-300">
							<ShieldAlert class="h-5 w-5" />
						</div>
						<div>
							<h2 class="font-semibold text-slate-950 dark:text-white">Impacto</h2>
							<p class="text-sm text-slate-500 dark:text-slate-400">Intentos y assets afectados.</p>
						</div>
					</div>

					<div class="mt-5 space-y-3 text-sm text-slate-700 dark:text-slate-200">
						<p>{impact.activeAttemptsOnCurrentPublishedRevision} intento(s) activos en la revisión publicada.</p>
						<p>{impact.activeAttemptsOnOlderRevisions} intento(s) activos en revisiones anteriores.</p>
						<p>{impact.completedAttemptsOnHistoricalRevisions} intento(s) completados ya quedarán históricos.</p>
						<p>{impact.referencedAssetFileIds.length} asset(s) referenciados por revisiones o intentos.</p>
					</div>
				</div>

				<div class="rounded-[30px] border border-slate-200/80 bg-white/92 p-5 shadow-sm dark:border-slate-800 dark:bg-slate-900/88">
					<form
						method="POST"
						action="?/publishDraft"
						use:enhance={() => {
							pendingAction = 'publish';
							return async ({ update }) => {
								await update();
								pendingAction = null;
							};
						}}
						class="grid gap-2"
					>
						<button
							class="inline-flex items-center justify-center rounded-2xl bg-amber-500 px-4 py-3 text-sm font-semibold text-slate-950 transition hover:bg-amber-400 disabled:cursor-not-allowed disabled:opacity-50"
							disabled={!hasDraftChanges || pendingAction !== null}
						>
							Publicar borrador
						</button>
					</form>

					<form
						method="POST"
						action="?/discardDraft"
						use:enhance={() => {
							pendingAction = 'discard';
							return async ({ update }) => {
								await update();
								pendingAction = null;
							};
						}}
						class="mt-2 grid"
					>
						<button
							class="inline-flex items-center justify-center rounded-2xl border border-slate-300 px-4 py-3 text-sm font-medium text-slate-700 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-800"
							disabled={!hasDraftChanges || pendingAction !== null}
						>
							Descartar borrador
						</button>
					</form>
				</div>
			</aside>
		</section>
	</div>
</div>
