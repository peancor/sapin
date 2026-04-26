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
		SquarePen
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

<div class="min-h-dvh bg-slate-950 text-slate-100">
	<header class="sticky top-0 z-40 border-b border-white/10 bg-slate-950/92 backdrop-blur-xl">
		<div class="flex w-full flex-col gap-4 px-4 py-4 sm:px-6 xl:px-8">
			<div class="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
				<div class="flex min-w-0 items-start gap-3">
					<a
						href={resolve(activityHref as any)}
						class="mt-1 inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-white/10 bg-white/5 text-slate-300 transition hover:border-amber-300/60 hover:text-amber-200"
						aria-label="Volver a la actividad"
					>
						<ChevronLeft class="h-4 w-4" />
					</a>

					<div class="min-w-0">
						<div class="flex flex-wrap items-center gap-2 text-[11px] font-semibold tracking-[0.18em] text-amber-300 uppercase">
							<span>Lesson Studio</span>
							<span class="text-slate-600">/</span>
							<span class="truncate text-slate-400">{data.course?.name ?? 'Curso'}</span>
						</div>
						<div class="mt-1 flex min-w-0 flex-wrap items-center gap-3">
							<h1 class="truncate text-xl font-semibold text-white sm:text-2xl">
								{data.activity.name}
							</h1>
							<span
								class="rounded-full border border-amber-300/25 bg-amber-300/10 px-3 py-1 text-xs font-medium text-amber-100"
							>
								{data.activity.status}
							</span>
						</div>
					</div>
				</div>

				<div class="flex flex-wrap gap-2">
					<a
						href={resolve(`/lesson/${ilid}?preview=published`)}
						target="_blank"
						rel="noreferrer"
						class="inline-flex items-center justify-center rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-sm font-medium text-slate-200 transition hover:bg-white/10"
					>
						Publicado
					</a>
					<a
						href={resolve(`/lesson/${ilid}?preview=draft`)}
						target="_blank"
						rel="noreferrer"
						class="inline-flex items-center justify-center rounded-xl bg-amber-400 px-3 py-2 text-sm font-semibold text-slate-950 transition hover:bg-amber-300"
					>
						<SquarePen class="mr-1.5 h-4 w-4" />
						Probar borrador
					</a>
				</div>
			</div>

			<nav class="flex gap-2 overflow-x-auto pb-1">
				{#each navItems as item (item.label)}
					{@const Icon = item.icon}
					<a
						href={resolve(item.href as any)}
						class={`inline-flex shrink-0 items-center gap-2 rounded-xl px-3 py-2 text-sm font-medium transition ${
							isActive(item.match)
								? 'bg-white text-slate-950'
								: 'border border-white/10 bg-white/5 text-slate-300 hover:bg-white/10 hover:text-white'
						}`}
					>
						<Icon class="h-4 w-4" />
						{item.label}
					</a>
				{/each}
			</nav>
		</div>
	</header>

	<main class="min-h-[calc(100dvh-9rem)] bg-slate-100 text-slate-950 dark:bg-slate-950 dark:text-slate-100">
		{@render children()}
	</main>
</div>
