<script lang="ts">
	import type { Snippet } from 'svelte';
	import type { LayoutData } from './$types';
	import { page } from '$app/state';
	import { resolve } from '$app/paths';
	import {
		Bug,
		Boxes,
		ChevronLeft,
		Eye,
		History,
		LayoutDashboard,
		Paperclip,
		Route,
		SquarePen,
		UploadCloud
	} from 'lucide-svelte';
	import {
		lessonActivityHref,
		lessonDebuggerHref,
		lessonFlowHref,
		lessonResourcesHref,
		lessonStudioHref
	} from '$lib/lesson/lessonStudioNavigation';

	let { data, children }: { data: LayoutData; children: Snippet } = $props();

	const cid = $derived(page.params.cid ?? '');
	const ilid = $derived(page.params.ilid ?? '');
	const context = $derived({ cid, ilid });
	const activePath = $derived(page.url.pathname);
	const studioHref = $derived(lessonStudioHref(context));
	const flowHref = $derived(lessonFlowHref(context));
	const resourcesHref = $derived(lessonResourcesHref(context, { source: 'studio' }));
	const debugHref = $derived(lessonDebuggerHref(context, { source: 'studio' }));
	const versionsHref = $derived(`${studioHref}/versions`);
	const blocksHref = $derived(`${studioHref}/blocks/new`);
	const activityHref = $derived(lessonActivityHref(context));
	const isWorkspaceMode = $derived(
		activePath.startsWith(`${studioHref}/flow`) || activePath.startsWith(`${studioHref}/debug`)
	);
	const hasDraftChanges = $derived(
		data.revisionSummary.diff.totalChangedBlocks > 0 || data.revisionSummary.diff.entryBlockChanged
	);

	const navItems = $derived([
		{ label: 'Overview', href: studioHref, icon: LayoutDashboard, match: studioHref },
		{ label: 'Mapa', href: flowHref, icon: Route, match: `${studioHref}/flow` },
		{ label: 'Bloques', href: blocksHref, icon: Boxes, match: `${studioHref}/blocks` },
		{ label: 'Recursos', href: resourcesHref, icon: Paperclip, match: `${studioHref}/resources` },
		{ label: 'Debug', href: debugHref, icon: Bug, match: `${studioHref}/debug` },
		{ label: 'Versiones', href: versionsHref, icon: History, match: versionsHref }
	]);
	function isActive(match: string) {
		if (match === studioHref) return activePath === studioHref;
		return activePath.startsWith(match);
	}
</script>

<div
	class="flex h-dvh overflow-hidden bg-[#f2f6f9] text-[#0f2537] dark:bg-[#071423] dark:text-slate-100"
>
	<div class="flex min-w-0 flex-1 flex-col overflow-hidden">
		<header
			class="z-40 shrink-0 border-b border-[#d9e6dc] bg-white/92 px-3 py-2 shadow-[0_18px_42px_-34px_rgba(15,37,55,0.48)] backdrop-blur-xl sm:px-4 dark:border-slate-800 dark:bg-[#0b1b2b]/94"
		>
			<div class="flex min-h-11 items-center gap-3">
				<a
					href={resolve(activityHref as any)}
					class="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-[#d9e6dc] bg-white/90 text-[#0f2537] shadow-sm transition duration-150 hover:border-[#2e7d32]/35 hover:bg-[#f0faf0] hover:text-[#2e7d32] active:scale-95 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200 dark:hover:bg-slate-800"
					aria-label="Volver a la actividad"
					title="Volver a la actividad"
				>
					<ChevronLeft class="h-4 w-4" />
				</a>

				<div class="flex min-w-0 flex-1 items-center gap-3">
					<span
						class="flex h-10 w-10 shrink-0 items-center justify-center overflow-hidden rounded-lg border border-[#d9e6dc] bg-[#f6fbf3] shadow-sm dark:border-slate-700 dark:bg-slate-900"
					>
						<img src="/images/sapin-magic_128.webp" alt="" class="h-8 w-8 object-contain" />
					</span>

					<div class="min-w-0">
						<div class="flex min-w-0 items-center gap-2">
							<p
								class="hidden shrink-0 text-[10px] font-bold tracking-[0.18em] text-[#0f2537] uppercase sm:block dark:text-slate-200"
							>
								SAPIN
							</p>
							<p class="shrink-0 text-[11px] font-semibold text-[#2e7d32]">Lesson Studio</p>
							<span
								class="hidden shrink-0 rounded-full border border-[#2e7d32]/20 bg-[#eaf7e9] px-2 py-0.5 text-[10px] font-semibold text-[#2e7d32] sm:inline-flex dark:border-emerald-900/40 dark:bg-emerald-950/30 dark:text-emerald-200"
							>
								{data.activity.status}
							</span>
						</div>
						<div class="flex min-w-0 items-baseline gap-2">
							<h1 class="min-w-0 truncate text-base font-semibold text-slate-950 dark:text-white">
								{data.activity.name}
							</h1>
							{#if data.course?.name}
								<p
									class="hidden min-w-0 truncate text-xs font-medium text-[#60758a] lg:block dark:text-slate-400"
								>
									{data.course.name}
								</p>
							{/if}
						</div>
					</div>
				</div>

				<div class="flex shrink-0 items-center gap-1.5">
					<span
						class={`hidden h-9 items-center gap-1.5 rounded-lg border px-2.5 text-[11px] font-semibold xl:inline-flex ${
							hasDraftChanges
								? 'border-orange-200 bg-orange-50 text-orange-700 dark:border-orange-900/40 dark:bg-orange-950/30 dark:text-orange-200'
								: 'border-[#2e7d32]/25 bg-[#eaf7e9] text-[#2e7d32] dark:border-emerald-900/40 dark:bg-emerald-950/25 dark:text-emerald-200'
						}`}
					>
						<span
							class={`h-1.5 w-1.5 rounded-full ${hasDraftChanges ? 'bg-orange-500' : 'bg-[#2e7d32]'}`}
						></span>
						{hasDraftChanges
							? `${data.revisionSummary.diff.totalChangedBlocks} cambios`
							: 'Sin cambios'}
					</span>

					<a
						href={resolve(`/lesson/${ilid}?preview=published`)}
						target="_blank"
						rel="noreferrer"
						class="inline-flex h-9 items-center gap-1.5 rounded-lg border border-[#2e7d32]/25 bg-[#eaf7e9] px-2.5 text-xs font-semibold text-[#2e7d32] shadow-sm transition duration-150 hover:bg-[#dff2dc] active:scale-95 dark:border-emerald-900/40 dark:bg-emerald-950/30 dark:text-emerald-200 dark:hover:bg-emerald-950/50"
						title="Preview publicado"
					>
						<Eye class="h-3.5 w-3.5" />
						<span class="hidden md:inline">Publicado</span>
					</a>
					<a
						href={resolve(`/lesson/${ilid}?preview=draft`)}
						target="_blank"
						rel="noreferrer"
						class="inline-flex h-9 items-center gap-1.5 rounded-lg border border-[#c9d8e5] bg-[#f2f6f9] px-2.5 text-xs font-semibold text-[#0f2537] shadow-sm transition duration-150 hover:bg-white active:scale-95 dark:border-blue-900/40 dark:bg-blue-950/30 dark:text-blue-200 dark:hover:bg-blue-950/50"
						title="Preview borrador"
					>
						<SquarePen class="h-3.5 w-3.5" />
						<span class="hidden md:inline">Borrador</span>
					</a>
					<a
						href={resolve(debugHref as any)}
						class="hidden h-9 items-center gap-1.5 rounded-lg border border-[#c9d8e5] bg-white/80 px-2.5 text-xs font-semibold text-[#0f2537] shadow-sm transition duration-150 hover:border-[#2e7d32]/25 hover:bg-[#f6fbf3] active:scale-95 lg:inline-flex dark:border-blue-900/40 dark:bg-blue-950/30 dark:text-blue-200 dark:hover:bg-blue-950/50"
						title="Abrir debugger"
					>
						<Bug class="h-3.5 w-3.5" />
						Debug
					</a>
					<form method="POST" action={resolve(`${versionsHref}?/publishDraft` as any)}>
						<button
							type="submit"
							class="inline-flex h-9 items-center gap-1.5 rounded-lg bg-linear-to-r from-[#2e7d32] to-[#79bf45] px-3 text-xs font-semibold text-white shadow-[0_14px_28px_-18px_rgba(46,125,50,0.8)] transition duration-150 hover:from-[#279132] hover:to-[#8fcf4f] active:scale-95 disabled:cursor-not-allowed disabled:opacity-40"
							disabled={!hasDraftChanges}
							title="Publicar borrador"
						>
							<UploadCloud class="h-3.5 w-3.5" />
							<span class="hidden sm:inline">Publicar</span>
						</button>
					</form>
				</div>
			</div>

			<nav class="studio-tab-scroll mt-2 flex min-w-0 gap-1.5 overflow-x-auto">
				{#each navItems as item (item.label)}
					{@const Icon = item.icon}
					<a
						href={resolve(item.href as any)}
						class={`inline-flex h-9 shrink-0 items-center gap-1.5 rounded-lg px-3 text-xs font-semibold transition duration-150 ${
							isActive(item.match)
								? 'bg-linear-to-r from-[#2e7d32] to-[#79bf45] text-white shadow-[0_12px_24px_-18px_rgba(46,125,50,0.75)]'
								: 'border border-[#d9e6dc] bg-white/72 text-[#334e68] shadow-sm hover:border-[#2e7d32]/25 hover:bg-[#f6fbf3] dark:border-slate-700 dark:bg-slate-900/55 dark:text-slate-300 dark:hover:bg-slate-800'
						}`}
					>
						<Icon class="h-3.5 w-3.5" />
						<span>{item.label}</span>
					</a>
				{/each}
			</nav>
		</header>

		<main
			class={`min-h-0 flex-1 bg-[#f2f6f9] text-[#0f2537] dark:bg-[#0c1222] dark:text-slate-100 ${
				isWorkspaceMode ? 'overflow-hidden' : 'overflow-y-auto'
			}`}
		>
			{@render children()}
		</main>
	</div>
</div>

<style>
	.studio-tab-scroll {
		scrollbar-width: none;
		-ms-overflow-style: none;
	}

	.studio-tab-scroll::-webkit-scrollbar {
		display: none;
	}
</style>
