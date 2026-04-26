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
	const activeNavItem = $derived(
		navItems.find((item) => isActive(item.match)) ?? navItems[0]
	);
	const ActiveNavIcon = $derived(activeNavItem.icon);

	function isActive(match: string) {
		if (match === studioHref) return activePath === studioHref;
		return activePath.startsWith(match);
	}
</script>

<div class="flex h-dvh overflow-hidden bg-[#edf5ff] text-slate-950 dark:bg-[#0b1020] dark:text-slate-100">
	<div class="flex min-w-0 flex-1 flex-col overflow-hidden">
		<header
			class="z-40 flex h-12 shrink-0 items-center gap-2 border-b border-blue-100/80 bg-white/82 px-2 shadow-[0_12px_40px_-34px_rgba(37,99,235,0.55)] backdrop-blur-xl sm:px-3 dark:border-slate-800 dark:bg-[#10172a]/92"
		>
			<a
				href={resolve(activityHref as any)}
				class="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-blue-100 bg-white/88 text-slate-600 shadow-sm transition duration-150 hover:border-blue-200 hover:bg-blue-50 hover:text-blue-700 active:scale-95 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200 dark:hover:bg-slate-800"
				aria-label="Volver a la actividad"
				title="Volver a la actividad"
			>
				<ChevronLeft class="h-4 w-4" />
			</a>

			<div class="hidden min-w-0 shrink-0 basis-[190px] lg:block 2xl:basis-[260px]">
				<div class="flex items-center gap-2">
					<span class="rounded-md bg-fuchsia-500/10 p-1 text-fuchsia-600 dark:text-fuchsia-300">
						<ActiveNavIcon class="h-3.5 w-3.5" />
					</span>
					<p class="truncate text-[10px] font-semibold tracking-[0.22em] text-slate-500 uppercase dark:text-slate-400">
						Lesson Studio
					</p>
				</div>
				<div class="mt-0.5 flex min-w-0 items-center gap-2">
					<h1 class="truncate text-sm font-semibold text-slate-950 dark:text-white">
						{data.activity.name}
					</h1>
					<span
						class="shrink-0 rounded-full border border-blue-200 bg-blue-50 px-2 py-0.5 text-[10px] font-semibold text-blue-700 dark:border-blue-900/40 dark:bg-blue-950/30 dark:text-blue-200"
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
								? 'bg-linear-to-r from-blue-600 to-violet-600 text-white shadow-[0_12px_24px_-18px_rgba(79,70,229,0.75)]'
								: 'border border-blue-100 bg-white/66 text-slate-600 shadow-sm hover:border-blue-200 hover:bg-white dark:border-slate-700 dark:bg-slate-900/55 dark:text-slate-300 dark:hover:bg-slate-800'
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
							: 'border-cyan-200 bg-cyan-50 text-cyan-700 dark:border-cyan-900/40 dark:bg-cyan-950/25 dark:text-cyan-200'
					}`}
				>
					<span
						class={`h-1.5 w-1.5 rounded-full ${hasDraftChanges ? 'bg-orange-500' : 'bg-cyan-500'}`}
					></span>
					{hasDraftChanges
						? `${data.revisionSummary.diff.totalChangedBlocks} cambios`
						: 'Sin cambios'}
				</span>

				<a
					href={resolve(`/lesson/${ilid}?preview=published`)}
					target="_blank"
					rel="noreferrer"
					class="inline-flex h-8 items-center gap-1.5 rounded-lg border border-cyan-200 bg-cyan-50 px-2.5 text-xs font-semibold text-cyan-700 shadow-sm transition duration-150 hover:bg-cyan-100 active:scale-95 dark:border-cyan-900/40 dark:bg-cyan-950/30 dark:text-cyan-200 dark:hover:bg-cyan-950/50"
					title="Preview publicado"
				>
					<span class="hidden sm:inline">Publicado</span>
					<span class="sm:hidden">Pub</span>
				</a>
				<a
					href={resolve(`/lesson/${ilid}?preview=draft`)}
					target="_blank"
					rel="noreferrer"
					class="inline-flex h-8 items-center gap-1.5 rounded-lg border border-blue-200 bg-blue-50 px-2.5 text-xs font-semibold text-blue-700 shadow-sm transition duration-150 hover:bg-blue-100 active:scale-95 dark:border-blue-900/40 dark:bg-blue-950/30 dark:text-blue-200 dark:hover:bg-blue-950/50"
					title="Preview borrador"
				>
					<SquarePen class="h-3.5 w-3.5" />
					<span class="hidden sm:inline">Borrador</span>
				</a>
				<a
					href={resolve(debugHref as any)}
					class="hidden h-8 items-center gap-1.5 rounded-lg border border-blue-200 bg-blue-50 px-2.5 text-xs font-semibold text-blue-700 shadow-sm transition duration-150 hover:bg-blue-100 active:scale-95 md:inline-flex dark:border-blue-900/40 dark:bg-blue-950/30 dark:text-blue-200 dark:hover:bg-blue-950/50"
					title="Abrir debugger"
				>
					<Bug class="h-3.5 w-3.5" />
					Debug
				</a>
				<form method="POST" action={resolve(`${versionsHref}?/publishDraft` as any)}>
					<button
						type="submit"
						class="inline-flex h-8 items-center gap-1.5 rounded-lg bg-linear-to-r from-blue-600 to-violet-600 px-3 text-xs font-semibold text-white shadow-[0_14px_28px_-18px_rgba(79,70,229,0.8)] transition duration-150 hover:from-blue-500 hover:to-violet-500 active:scale-95 disabled:cursor-not-allowed disabled:opacity-40"
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
			class={`min-h-0 flex-1 bg-[#f3f7ff] text-slate-950 dark:bg-[#0c1222] dark:text-slate-100 ${
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
