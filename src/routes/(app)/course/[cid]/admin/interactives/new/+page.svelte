<script lang="ts">
	import type { PageData } from './$types';
	import { enhance } from '$app/forms';
	import { beforeNavigate, goto } from '$app/navigation';
	import { ArrowLeft, Bot, MessageSquare, Route } from 'lucide-svelte';
	import { onMount } from 'svelte';
	import { page } from '$app/stores';
	import { breadcrumb } from '$lib/stores/breadcrumb';

	let { data }: { data: PageData } = $props();

	let selectedType = $state<'chat' | 'agent' | 'lesson'>('chat');
	let name = $state('');
	let description = $state('');
	let status = $state<'hidden' | 'published' | 'closed' | 'archived'>('hidden');
	let isDirty = $state(false);

	const nextStepCopy = $derived.by(() => {
		if (selectedType === 'chat') {
			return 'Despues de crearla abriremos el editor conversacional para configurar rol, instrucciones, modelo y recursos.';
		}
		if (selectedType === 'agent') {
			return 'Despues de crearla abriremos el editor agéntico para ajustar herramientas, finalizacion, prompts y memoria.';
		}
		return 'Despues de crearla abriremos el editor de leccion para diseñar bloques, branching, recursos y pasos con IA.';
	});

	function markDirty() {
		isDirty = true;
	}

	breadcrumb.set([
		{ label: 'Inicio', href: '/' },
		{ label: 'Cursos', href: '/course' },
		{ label: 'Curso', href: `/course/${$page.params.cid}` },
		{ label: 'Interactivos', href: `/course/${$page.params.cid}/admin/interactives` },
		{ label: 'Nuevo' }
	]);

	onMount(() => {
		const handleBeforeUnload = (e: BeforeUnloadEvent) => {
			if (isDirty) {
				e.preventDefault();
				e.returnValue = '';
			}
		};

		window.addEventListener('beforeunload', handleBeforeUnload);

		return () => {
			window.removeEventListener('beforeunload', handleBeforeUnload);
		};
	});

	beforeNavigate((navigation) => {
		if (isDirty && !window.confirm('Hay cambios sin guardar. ¿Deseas salir de todas formas?')) {
			navigation.cancel();
		}
	});
</script>

<div class="min-h-screen bg-gray-50 dark:bg-gray-900">
	<div class="sticky top-0 z-10 bg-white shadow-sm dark:bg-gray-800">
		<div class="container mx-auto max-w-screen-xl px-4">
			<div class="flex items-center gap-4 py-4">
				<a
					href="/course/{$page.params.cid}/admin"
					class="-ml-2 rounded-lg p-2 transition-colors hover:bg-gray-100 dark:hover:bg-gray-700"
					title="Volver al curso"
				>
					<ArrowLeft size={20} class="text-gray-500 dark:text-gray-400" />
				</a>
				<div class="min-w-0 flex-1">
					<h1 class="truncate text-lg font-semibold text-gray-900 dark:text-white">
						Crear actividad interactiva
					</h1>
					<p class="text-sm text-gray-500 dark:text-gray-400">
						Aqui definimos lo comun. La configuracion especifica se hace en el editor de cada tipo.
					</p>
				</div>
			</div>
		</div>
	</div>

	<div class="container mx-auto max-w-screen-xl px-4 py-6">
		<form
			method="POST"
			action="?/create"
			use:enhance={() => {
				return async ({ result }) => {
					if (result.type === 'redirect') {
						isDirty = false;
						await goto(result.location, { invalidateAll: true });
					}
				};
			}}
			class="space-y-6 rounded-xl bg-white p-6 shadow-sm dark:bg-gray-800"
		>
			<input type="hidden" name="type" value={selectedType} />

			<section class="space-y-4">
				<div>
					<h2 class="text-base font-semibold text-gray-900 dark:text-white">Tipo de actividad</h2>
					<p class="text-sm text-gray-500 dark:text-gray-400">
						Escoge el formato base. Luego entraremos en su editor especializado.
					</p>
				</div>

				<div class="grid gap-3 md:grid-cols-3">
					<button
						type="button"
						onclick={() => {
							selectedType = 'chat';
							markDirty();
						}}
						class="flex items-start gap-3 rounded-xl border-2 p-4 text-left transition-colors {selectedType === 'chat'
							? 'border-blue-500 bg-blue-50 dark:border-blue-400 dark:bg-blue-900/20'
							: 'border-gray-200 hover:border-gray-300 dark:border-gray-700 dark:hover:border-gray-600'}"
					>
						<div class="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-blue-100 dark:bg-blue-900/40">
							<MessageSquare class="h-5 w-5 text-blue-600 dark:text-blue-400" />
						</div>
						<div>
							<p class="font-medium text-gray-900 dark:text-white">Chat</p>
							<p class="text-xs text-gray-500 dark:text-gray-400">
								Actividad conversacional con un rol IA.
							</p>
						</div>
					</button>

					<button
						type="button"
						onclick={() => {
							selectedType = 'agent';
							markDirty();
						}}
						class="flex items-start gap-3 rounded-xl border-2 p-4 text-left transition-colors {selectedType === 'agent'
							? 'border-green-500 bg-green-50 dark:border-green-400 dark:bg-green-900/20'
							: 'border-gray-200 hover:border-gray-300 dark:border-gray-700 dark:hover:border-gray-600'}"
					>
						<div class="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-green-100 dark:bg-green-900/40">
							<Bot class="h-5 w-5 text-green-600 dark:text-green-400" />
						</div>
						<div>
							<p class="font-medium text-gray-900 dark:text-white">Agente</p>
							<p class="text-xs text-gray-500 dark:text-gray-400">
								Agente con herramientas, finalizacion y memoria.
							</p>
						</div>
					</button>

					<button
						type="button"
						onclick={() => {
							selectedType = 'lesson';
							markDirty();
						}}
						class="flex items-start gap-3 rounded-xl border-2 p-4 text-left transition-colors {selectedType === 'lesson'
							? 'border-amber-500 bg-amber-50 dark:border-amber-400 dark:bg-amber-900/20'
							: 'border-gray-200 hover:border-gray-300 dark:border-gray-700 dark:hover:border-gray-600'}"
					>
						<div class="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-amber-100 dark:bg-amber-900/40">
							<Route class="h-5 w-5 text-amber-600 dark:text-amber-400" />
						</div>
						<div>
							<p class="font-medium text-gray-900 dark:text-white">Lección viva</p>
							<p class="text-xs text-gray-500 dark:text-gray-400">
								Secuencia por bloques con branching, recursos e IA.
							</p>
						</div>
					</button>
				</div>
			</section>

			<section class="grid gap-6 lg:grid-cols-[minmax(0,1fr)_320px]">
				<div class="space-y-4">
					<div class="grid gap-4 md:grid-cols-2">
						<label class="block">
							<span class="mb-2 block text-sm font-medium text-gray-700 dark:text-gray-300">Nombre</span>
							<input
								name="name"
								bind:value={name}
								oninput={markDirty}
								required
								class="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm dark:border-gray-600 dark:bg-gray-800 dark:text-white"
								placeholder="Ej. Introduccion a la fotosintesis"
							/>
						</label>

						<label class="block">
							<span class="mb-2 block text-sm font-medium text-gray-700 dark:text-gray-300">Estado inicial</span>
							<select
								name="status"
								bind:value={status}
								onchange={markDirty}
								class="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm dark:border-gray-600 dark:bg-gray-800 dark:text-white"
							>
								<option value="hidden">Oculta</option>
								<option value="published">Publicada</option>
								<option value="closed">Cerrada</option>
								<option value="archived">Archivada</option>
							</select>
						</label>
					</div>

					<label class="block">
						<span class="mb-2 block text-sm font-medium text-gray-700 dark:text-gray-300">Descripción</span>
						<textarea
							name="description"
							bind:value={description}
							oninput={markDirty}
							rows="4"
							class="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm dark:border-gray-600 dark:bg-gray-800 dark:text-white"
							placeholder="Contexto breve para identificar la actividad dentro del curso"
						></textarea>
					</label>
				</div>

				<aside class="rounded-xl border border-gray-200 bg-gray-50 p-4 dark:border-gray-700 dark:bg-gray-900/40">
					<h3 class="text-sm font-semibold text-gray-900 dark:text-white">Siguiente paso</h3>
					<p class="mt-2 text-sm text-gray-600 dark:text-gray-300">{nextStepCopy}</p>
					<p class="mt-4 text-xs text-gray-500 dark:text-gray-400">
						La actividad se crea con una configuracion minima valida para que el editor especifico pueda completarla despues.
					</p>
				</aside>
			</section>

			<div class="flex items-center gap-4">
				<button
					type="submit"
					class="rounded-lg bg-blue-600 px-5 py-2.5 text-sm font-medium text-white transition-colors hover:bg-blue-700"
				>
					Crear y configurar
				</button>
				<a
					href={`/course/${data.courseId}/admin`}
					class="rounded-lg border border-gray-300 px-5 py-2.5 text-sm font-medium text-gray-700 transition-colors hover:bg-gray-100 dark:border-gray-600 dark:text-gray-300 dark:hover:bg-gray-700"
				>
					Cancelar
				</a>
			</div>
		</form>
	</div>
</div>
