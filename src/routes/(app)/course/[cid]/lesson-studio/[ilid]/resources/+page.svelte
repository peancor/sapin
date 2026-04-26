<script lang="ts">
	/* eslint-disable svelte/no-navigation-without-resolve */
	import type { PageProps } from './$types';
	import { page } from '$app/state';
	import { breadcrumb } from '$lib/stores/breadcrumb';
	import InteractiveFilesSection from '$lib/components/InteractiveFilesSection.svelte';
	import {
		lessonFlowHref,
		lessonStudioHref,
		lessonStudioReturnTarget
	} from '$lib/lesson/lessonStudioNavigation';
	import { MoveLeft, Paperclip, Route, Settings2 } from 'lucide-svelte';

	let { data }: PageProps = $props();
	const getActivityName = () => data.activity.name;
	const cid = $derived(page.params.cid ?? '');
	const ilid = $derived(page.params.ilid ?? '');
	const source = $derived(page.url.searchParams.get('source'));
	const blockId = $derived(page.url.searchParams.get('blockId'));
	const returnTarget = $derived(lessonStudioReturnTarget({ cid, ilid }, source, blockId));
	const flowHref = $derived(lessonFlowHref({ cid, ilid }, blockId));
	const studioHref = $derived(lessonStudioHref({ cid, ilid }));

	breadcrumb.set([
		{ label: 'Inicio', href: '/' },
		{ label: 'Cursos', href: '/course' },
		{ label: 'Curso', href: `/course/${page.params.cid}` },
		{ label: 'Interactivos', href: `/course/${page.params.cid}/admin/interactives` },
		{
			label: getActivityName(),
			href: `/course/${page.params.cid}/admin/interactives/${page.params.ilid}`
		},
		{
			label: 'Editor lesson',
			href: lessonStudioHref({ cid: page.params.cid ?? '', ilid: page.params.ilid ?? '' })
		},
		{ label: 'Recursos' }
	]);
</script>

<div
	class="min-h-full bg-[radial-gradient(circle_at_top_left,_rgba(14,165,233,0.12),_transparent_26%),linear-gradient(180deg,_#f8fafc_0%,_#eef2ff_100%)] p-4 text-slate-900 sm:p-6 dark:bg-[radial-gradient(circle_at_top_left,_rgba(14,165,233,0.11),_transparent_24%),linear-gradient(180deg,_#020617_0%,_#111827_100%)] dark:text-slate-100"
>
	<div class="mx-auto max-w-[1480px] space-y-5">
		<div
			class="rounded-2xl bg-white/95 p-4 shadow-sm ring-1 ring-slate-200/80 dark:bg-slate-900/88 dark:ring-slate-800"
		>
			<div class="flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between">
				<div class="flex min-w-0 items-start gap-3">
					<div
						class="shrink-0 rounded-2xl bg-sky-100 p-3 text-sky-700 dark:bg-sky-950/50 dark:text-sky-300"
					>
						<Paperclip class="h-5 w-5" />
					</div>
					<div class="min-w-0">
						<div class="flex flex-wrap items-center gap-2 text-xs font-semibold">
							<a class="text-slate-500 hover:text-sky-700 dark:text-slate-400" href={studioHref}>
								Studio
							</a>
							<span class="text-slate-300 dark:text-slate-700">/</span>
							<a class="text-slate-500 hover:text-sky-700 dark:text-slate-400" href={flowHref}>
								Mapa
							</a>
							{#if blockId}
								<span class="text-slate-300 dark:text-slate-700">/</span>
								<span class="font-mono text-slate-500 dark:text-slate-400">{blockId}</span>
							{/if}
						</div>
						<p class="mt-2 text-xs tracking-[0.2em] text-sky-700 uppercase dark:text-sky-300">
							Lesson Studio
						</p>
						<h1 class="mt-1 text-2xl font-semibold text-slate-900 dark:text-white">
							Recursos compartidos
						</h1>
					</div>
				</div>

				<div class="flex flex-wrap gap-2">
					<a
						href={returnTarget.href}
						class="inline-flex items-center justify-center rounded-xl border border-slate-300 bg-white px-4 py-2.5 text-sm font-medium text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200 dark:hover:bg-slate-800"
					>
						<MoveLeft class="mr-1 h-4 w-4" />
						{returnTarget.label}
					</a>
					<a
						href={studioHref}
						class="inline-flex items-center justify-center rounded-xl border border-slate-300 px-3 py-2.5 text-sm font-medium text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-800"
					>
						<Settings2 class="mr-1 h-4 w-4" />
						Studio
					</a>
					<a
						href={flowHref}
						class="inline-flex items-center justify-center rounded-xl border border-sky-300 bg-sky-50 px-3 py-2.5 text-sm font-medium text-sky-800 hover:bg-sky-100 dark:border-sky-900/40 dark:bg-sky-950/30 dark:text-sky-200"
					>
						<Route class="mr-1 h-4 w-4" />
						Mapa
					</a>
				</div>
			</div>
		</div>

		<div
			class="rounded-2xl bg-white/95 p-6 shadow-sm ring-1 ring-slate-200/80 dark:bg-slate-900/88 dark:ring-slate-800"
		>
			<p class="max-w-3xl text-sm leading-6 text-slate-600 dark:text-slate-300">
				Las imágenes y documentos de la lesson viven aquí. Los bloques `content` pueden adjuntarlos
				como recursos externos y, además, las imágenes pegadas inline desde el editor se almacenan
				en esta misma bolsa global.
			</p>

			<InteractiveFilesSection
				files={data.files}
				title="Recursos de la lección"
				description="Sube y organiza documentos o imágenes reutilizables para cualquier bloque."
				copyHint="Puedes copiarlos o reutilizarlos desde los bloques de contenido."
				emptyMessage="Todavía no hay recursos compartidos en esta lesson."
			/>
		</div>
	</div>
</div>
