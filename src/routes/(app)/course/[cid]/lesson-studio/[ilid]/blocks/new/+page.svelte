<script lang="ts">
	import type { PageProps } from './$types';
	import { page } from '$app/state';
	import { resolve } from '$app/paths';
	import { breadcrumb } from '$lib/stores/breadcrumb';
	import {
		BookOpenText,
		Bot,
		CircleCheck,
		Flag,
		ListChecks,
		MoveLeft,
		Plus,
		Route
	} from 'lucide-svelte';

	let { data, form }: PageProps = $props();
	const getActivityName = () => data.activity.name;

	const blockKinds = [
		{
			kind: 'content',
			label: 'Bloque de contenido',
			description: 'Markdown rico, imágenes inline y recursos adjuntos.',
			icon: BookOpenText
		},
		{
			kind: 'choice',
			label: 'Bloque de decisión',
			description: 'Opciones con branching explícito y salida estructurada.',
			icon: ListChecks
		},
		{
			kind: 'check',
			label: 'Bloque de evaluación',
			description: 'Corrección automática breve con score, feedback y branching pedagógico.',
			icon: CircleCheck
		},
		{
			kind: 'agent',
			label: 'Bloque IA',
			description: 'Paso guiado o mini chat con prompts reutilizables.',
			icon: Bot
		},
		{
			kind: 'end',
			label: 'Bloque final',
			description: 'Cierre terminal para completar la lesson.',
			icon: Flag
		}
	] as const;

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
			href: `/course/${page.params.cid}/lesson-studio/${page.params.ilid}`
		},
		{ label: 'Nuevo bloque' }
	]);
</script>

<div class="space-y-6">
	<div class="flex items-center justify-between gap-4">
		<div>
			<p class="text-sm uppercase tracking-[0.18em] text-gray-500 dark:text-gray-400">Lesson</p>
			<h1 class="text-2xl font-semibold text-gray-900 dark:text-white">Crear nuevo bloque</h1>
			<p class="mt-2 text-sm text-gray-600 dark:text-gray-300">
				Se creará un bloque válido dentro de la definición y te llevaremos directamente a su
				editor detallado.
			</p>
		</div>

		<a
			href={resolve(`/course/${page.params.cid}/lesson-studio/${page.params.ilid}`)}
			class="rounded-xl border border-gray-300 px-4 py-2.5 text-sm font-medium text-gray-700 hover:bg-gray-50 dark:border-gray-700 dark:text-gray-200 dark:hover:bg-gray-800"
		>
			<MoveLeft class="mr-1 inline h-4 w-4" />
			Volver a la portada
		</a>
	</div>

	{#if form?.error}
		<div class="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800 dark:border-red-900/40 dark:bg-red-950/20 dark:text-red-200">
			{form.error}
		</div>
	{/if}

	<div class="grid gap-4 lg:grid-cols-2">
		{#each blockKinds as option (option.kind)}
			{@const Icon = option.icon}
			<form
				method="POST"
				action="?/createBlock"
				class="rounded-2xl bg-white p-6 shadow-sm ring-1 ring-gray-200/80 transition-shadow hover:shadow-md dark:bg-gray-900/40 dark:ring-gray-800"
			>
				<input type="hidden" name="kind" value={option.kind} />
				<div class="mb-4 flex items-start gap-4">
					<div
						class="rounded-2xl p-3 {data.selectedKind === option.kind
							? 'bg-primary-100 text-primary-700 dark:bg-primary-950/30 dark:text-primary-300'
							: 'bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-200'}"
					>
						<Icon class="h-5 w-5" />
					</div>
					<div class="min-w-0">
						<div class="flex flex-wrap items-center gap-2">
							<h2 class="text-lg font-semibold text-gray-900 dark:text-white">{option.label}</h2>
							{#if data.selectedKind === option.kind}
								<span class="rounded-full bg-primary-100 px-2.5 py-1 text-xs font-medium text-primary-700 dark:bg-primary-950/30 dark:text-primary-300">
									Sugerido
								</span>
							{/if}
						</div>
						<p class="mt-2 text-sm leading-6 text-gray-600 dark:text-gray-300">
							{option.description}
						</p>
					</div>
				</div>

				<button class="inline-flex items-center rounded-xl bg-gray-900 px-4 py-2.5 text-sm font-medium text-white hover:bg-gray-800 dark:bg-white dark:text-gray-900 dark:hover:bg-gray-100">
					<Plus class="mr-1 h-4 w-4" />
					Crear {option.kind === 'end' ? 'final' : 'bloque'}
				</button>
			</form>
		{/each}
	</div>

	<div class="rounded-2xl border border-dashed border-gray-300 px-5 py-4 text-sm text-gray-600 dark:border-gray-700 dark:text-gray-300">
		<Route class="mr-2 inline h-4 w-4" />
		Los bloques nuevos se crean apuntando a un destino válido por defecto para que la lesson
		siga siendo consistente desde el primer momento.
	</div>
</div>
