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

<div class="flex h-dvh overflow-hidden bg-[#ebe7e0] text-stone-900 dark:bg-[#141516] dark:text-stone-100">
	<div class="flex min-w-0 flex-1 flex-col overflow-hidden">
		<header
			class="z-40 flex h-14 shrink-0 items-center gap-2 border-b border-stone-300/70 bg-[#f7f3ec]/95 px-2 backdrop-blur-xl sm:px-3 dark:border-stone-800 dark:bg-[#16181b]/95"
		>
			<a
				href={resolve(activityHref as any)}
				class="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-stone-300 bg-white text-stone-600 shadow-sm transition hover:bg-stone-50 active:scale-95 dark:border-stone-700 dark:bg-stone-900 dark:text-stone-200 dark:hover:bg-stone-800"
				aria-label="Volver a la actividad"
				title="Volver a la actividad"
			>
				<ChevronLeft class="h-4 w-4" />
			</a>

			<div class="hidden min-w-0 shrink-0 basis-[220px] lg:block xl:basis-[280px]">
				<div class="flex items-center gap-2">
					<span class="rounded-lg bg-amber-500/12 p-1.5 text-amber-700 dark:text-amber-300">
						<ActiveNavIcon class="h-3.5 w-3.5" />
					</span>
					<p class="truncate text-[10px] font-semibold tracking-[0.22em] text-stone-400 uppercase dark:text-stone-500">
						Lesson Studio
					</p>
				</div>
				<div class="mt-0.5 flex min-w-0 items-center gap-2">
					<h1 class="truncate text-sm font-semibold text-stone-950 dark:text-white">
						{data.activity.name}
					</h1>
					<span
						class="shrink-0 rounded-full border border-amber-300/40 bg-amber-100/70 px-2 py-0.5 text-[10px] font-semibold text-amber-800 dark:border-amber-900/40 dark:bg-amber-950/30 dark:text-amber-200"
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
						class={`inline-flex h-9 shrink-0 items-center gap-1.5 rounded-xl px-2.5 text-xs font-semibold transition ${
							isActive(item.match)
								? 'bg-stone-900 text-white shadow-sm dark:bg-stone-100 dark:text-stone-950'
								: 'border border-stone-300/70 bg-white/65 text-stone-600 hover:bg-white dark:border-stone-700 dark:bg-stone-900/55 dark:text-stone-300 dark:hover:bg-stone-800'
						}`}
					>
						<Icon class="h-3.5 w-3.5" />
						<span>{item.label}</span>
					</a>
				{/each}
			</nav>

			<div class="flex shrink-0 items-center gap-1">
				<span
					class={`hidden items-center gap-1.5 rounded-full border px-2.5 py-1 text-[10px] font-semibold 2xl:inline-flex ${
						hasDraftChanges
							? 'border-amber-300 bg-amber-100 text-amber-800 dark:border-amber-900/40 dark:bg-amber-950/30 dark:text-amber-200'
							: 'border-emerald-300 bg-emerald-50 text-emerald-800 dark:border-emerald-900/40 dark:bg-emerald-950/25 dark:text-emerald-200'
					}`}
				>
					<span
						class={`h-1.5 w-1.5 rounded-full ${hasDraftChanges ? 'bg-amber-500' : 'bg-emerald-500'}`}
					></span>
					{hasDraftChanges
						? `${data.revisionSummary.diff.totalChangedBlocks} cambios`
						: 'Sin cambios'}
				</span>

				<a
					href={resolve(`/lesson/${ilid}?preview=published`)}
					target="_blank"
					rel="noreferrer"
					class="inline-flex h-9 items-center gap-1.5 rounded-xl border border-emerald-300 bg-emerald-50 px-2.5 text-xs font-semibold text-emerald-800 shadow-sm transition hover:bg-emerald-100 active:scale-95 dark:border-emerald-900/40 dark:bg-emerald-950/30 dark:text-emerald-200 dark:hover:bg-emerald-950/50"
					title="Preview publicado"
				>
					<span class="hidden sm:inline">Publicado</span>
					<span class="sm:hidden">Pub</span>
				</a>
				<a
					href={resolve(`/lesson/${ilid}?preview=draft`)}
					target="_blank"
					rel="noreferrer"
					class="inline-flex h-9 items-center gap-1.5 rounded-xl border border-sky-300 bg-sky-50 px-2.5 text-xs font-semibold text-sky-800 shadow-sm transition hover:bg-sky-100 active:scale-95 dark:border-sky-900/40 dark:bg-sky-950/30 dark:text-sky-200 dark:hover:bg-sky-950/50"
					title="Preview borrador"
				>
					<SquarePen class="h-3.5 w-3.5" />
					<span class="hidden sm:inline">Borrador</span>
				</a>
				<a
					href={resolve(debugHref as any)}
					class="hidden h-9 items-center gap-1.5 rounded-xl border border-sky-300 bg-sky-50 px-2.5 text-xs font-semibold text-sky-800 shadow-sm transition hover:bg-sky-100 active:scale-95 md:inline-flex dark:border-sky-900/40 dark:bg-sky-950/30 dark:text-sky-200 dark:hover:bg-sky-950/50"
					title="Abrir debugger"
				>
					<Bug class="h-3.5 w-3.5" />
					Debug
				</a>
				<form method="POST" action={resolve(`${versionsHref}?/publishDraft` as any)}>
					<button
						type="submit"
						class="inline-flex h-9 items-center gap-1.5 rounded-xl bg-amber-500 px-3 text-xs font-semibold text-white shadow-sm transition hover:bg-amber-400 active:scale-95 disabled:cursor-not-allowed disabled:opacity-40"
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
			class={`min-h-0 flex-1 bg-stone-100 text-stone-950 dark:bg-[#101214] dark:text-stone-100 ${
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
