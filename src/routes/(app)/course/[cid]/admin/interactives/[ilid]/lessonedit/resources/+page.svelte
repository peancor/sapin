<script lang="ts">
	import type { PageProps } from './$types';
	import { page } from '$app/state';
	import { resolve } from '$app/paths';
	import { breadcrumb } from '$lib/stores/breadcrumb';
	import InteractiveFilesSection from '$lib/components/InteractiveFilesSection.svelte';
	import { MoveLeft, Paperclip } from 'lucide-svelte';

	let { data }: PageProps = $props();
	const getActivityName = () => data.activity.name;

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
			href: `/course/${page.params.cid}/admin/interactives/${page.params.ilid}/lessonedit`
		},
		{ label: 'Recursos' }
	]);
</script>

<div class="space-y-6">
	<div class="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
		<div>
			<div class="mb-3 flex items-center gap-3">
				<div class="rounded-2xl bg-sky-100 p-3 text-sky-700 dark:bg-sky-950/30 dark:text-sky-300">
					<Paperclip class="h-5 w-5" />
				</div>
				<div>
					<p class="text-sm uppercase tracking-[0.18em] text-gray-500 dark:text-gray-400">Lesson</p>
					<h1 class="text-2xl font-semibold text-gray-900 dark:text-white">Recursos compartidos</h1>
				</div>
			</div>
			<p class="max-w-3xl text-sm leading-6 text-gray-600 dark:text-gray-300">
				Las imágenes y documentos de la lesson viven aquí. Los bloques `content` pueden
				adjuntarlos como recursos externos y, además, las imágenes pegadas inline desde el
				editor se almacenan en esta misma bolsa global.
			</p>
		</div>

		<a
			href={resolve(`/course/${page.params.cid}/admin/interactives/${page.params.ilid}/lessonedit`)}
			class="rounded-xl border border-gray-300 px-4 py-2.5 text-sm font-medium text-gray-700 hover:bg-gray-50 dark:border-gray-700 dark:text-gray-200 dark:hover:bg-gray-800"
		>
			<MoveLeft class="mr-1 inline h-4 w-4" />
			Volver a la portada
		</a>
	</div>

	<InteractiveFilesSection
		files={data.files}
		title="Recursos de la lección"
		description="Sube y organiza documentos o imágenes reutilizables para cualquier bloque."
		copyHint="Puedes copiarlos o reutilizarlos desde los bloques de contenido."
		emptyMessage="Todavía no hay recursos compartidos en esta lesson."
	/>
</div>
