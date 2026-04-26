<script lang="ts">
	import type { Snippet } from 'svelte';
	import type { LayoutData } from './$types';
	import { page } from '$app/state';
	import { resolve } from '$app/paths';
	import {
		Bug,
		Boxes,
		ChevronLeft,
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

<div class="flex h-dvh overflow-hidden bg-[#f2f6f9] text-[#0f2537] dark:bg-[#071423] dark:text-slate-100">
	<div class="flex min-w-0 flex-1 flex-col overflow-hidden">
		<header
			class="z-40 flex h-12 shrink-0 items-center gap-2 border-b border-[#d9e6dc] bg-white/90 px-2 shadow-[0_14px_38px_-32px_rgba(15,37,55,0.42)] backdrop-blur-xl sm:px-3 dark:border-slate-800 dark:bg-[#0b1b2b]/94"
		>
			<a
				href={resolve(activityHref as any)}
				class="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-[#d9e6dc] bg-white/90 text-[#0f2537] shadow-sm transition duration-150 hover:border-[#2e7d32]/35 hover:bg-[#f0faf0] hover:text-[#2e7d32] active:scale-95 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200 dark:hover:bg-slate-800"
				aria-label="Volver a la actividad"
				title="Volver a la actividad"
			>
				<ChevronLeft class="h-4 w-4" />
			</a>

			<div class="hidden min-w-0 shrink-0 basis-[190px] lg:block 2xl:basis-[260px]">
				<div class="flex items-center gap-2">
					<span
						class="flex h-7 w-7 items-center justify-center overflow-hidden rounded-lg border border-[#d9e6dc] bg-[#f6fbf3] shadow-sm"
					>
						<img src="/images/sapin-magic_128.webp" alt="" class="h-6 w-6 object-contain" />
					</span>
					<div class="min-w-0">
						<p
							class="truncate text-[10px] font-bold tracking-[0.18em] text-[#0f2537] uppercase dark:text-slate-200"
						>
							SAPIN
						</p>
						<p class="-mt-0.5 truncate text-[10px] font-semibold text-[#2e7d32]">
							Lesson Studio
						</p>
					</div>
				</div>
				<div class="mt-0.5 flex min-w-0 items-center gap-2">
					<h1 class="truncate text-sm font-semibold text-slate-950 dark:text-white">
						{data.activity.name}
					</h1>
					<span
						class="shrink-0 rounded-full border border-[#2e7d32]/20 bg-[#eaf7e9] px-2 py-0.5 text-[10px] font-semibold text-[#2e7d32] dark:border-emerald-900/40 dark:bg-emerald-950/30 dark:text-emerald-200"
					>
						{data.activity.status}
					</span>
				</div>
			</div>

			<nav class="studio-tab-scroll flex min-w-0 flex-1 gap-1 overflow-x-auto px-1">
				{#each navItems as item (item.label)}
					{@const Icon = item.icon}
					<a
						href={resolve(item.href as any)}
						class={`inline-flex h-8 shrink-0 items-center gap-1.5 rounded-lg px-2.5 text-xs font-semibold transition duration-150 ${
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

			<div class="flex shrink-0 items-center gap-1">
				<span
					class={`hidden h-8 items-center gap-1.5 rounded-lg border px-2.5 text-[10px] font-semibold 2xl:inline-flex ${
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
					class="inline-flex h-8 items-center gap-1.5 rounded-lg border border-[#2e7d32]/25 bg-[#eaf7e9] px-2.5 text-xs font-semibold text-[#2e7d32] shadow-sm transition duration-150 hover:bg-[#dff2dc] active:scale-95 dark:border-emerald-900/40 dark:bg-emerald-950/30 dark:text-emerald-200 dark:hover:bg-emerald-950/50"
					title="Preview publicado"
				>
					<span class="hidden sm:inline">Publicado</span>
					<span class="sm:hidden">Pub</span>
				</a>
				<a
					href={resolve(`/lesson/${ilid}?preview=draft`)}
					target="_blank"
					rel="noreferrer"
					class="inline-flex h-8 items-center gap-1.5 rounded-lg border border-[#c9d8e5] bg-[#f2f6f9] px-2.5 text-xs font-semibold text-[#0f2537] shadow-sm transition duration-150 hover:bg-white active:scale-95 dark:border-blue-900/40 dark:bg-blue-950/30 dark:text-blue-200 dark:hover:bg-blue-950/50"
					title="Preview borrador"
				>
					<SquarePen class="h-3.5 w-3.5" />
					<span class="hidden sm:inline">Borrador</span>
				</a>
				<a
					href={resolve(debugHref as any)}
					class="hidden h-8 items-center gap-1.5 rounded-lg border border-[#c9d8e5] bg-white/80 px-2.5 text-xs font-semibold text-[#0f2537] shadow-sm transition duration-150 hover:border-[#2e7d32]/25 hover:bg-[#f6fbf3] active:scale-95 md:inline-flex dark:border-blue-900/40 dark:bg-blue-950/30 dark:text-blue-200 dark:hover:bg-blue-950/50"
					title="Abrir debugger"
				>
					<Bug class="h-3.5 w-3.5" />
					Debug
				</a>
				<form method="POST" action={resolve(`${versionsHref}?/publishDraft` as any)}>
					<button
						type="submit"
						class="inline-flex h-8 items-center gap-1.5 rounded-lg bg-linear-to-r from-[#2e7d32] to-[#79bf45] px-3 text-xs font-semibold text-white shadow-[0_14px_28px_-18px_rgba(46,125,50,0.8)] transition duration-150 hover:from-[#279132] hover:to-[#8fcf4f] active:scale-95 disabled:cursor-not-allowed disabled:opacity-40"
						disabled={!hasDraftChanges}
						title="Publicar borrador"
					>
						<UploadCloud class="h-3.5 w-3.5" />
						<span class="hidden sm:inline">Publicar</span>
					</button>
				</form>
			</div>
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
