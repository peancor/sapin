<script lang="ts">
	import { Modal, Label, Input, Textarea, Button } from 'flowbite-svelte';
	import { invalidateAll } from '$app/navigation';
	import { BookOpen, Sparkles, Loader2, X } from 'lucide-svelte';

	interface Props {
		show?: boolean;
	}

	let { show = $bindable(false) }: Props = $props();

	let name = $state('');
	let description = $state('');
	let context = $state('');
	let isSubmitting = $state(false);

	// Available course banners
	const courseBanners = [
		'/images/course_banners/course_banner_1.webp',
		'/images/course_banners/course_banner_2.webp',
        '/images/course_banners/course_banner_3.webp',
        '/images/course_banners/course_banner_4.webp',
        '/images/course_banners/course_banner_5.webp'
	];

	function getRandomBanner(): string {
		return courseBanners[Math.floor(Math.random() * courseBanners.length)];
	}

	async function handleSubmit() {
		if (!name.trim()) return;

		isSubmitting = true;
		try {
			const response = await fetch('/api/courses', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({
					name,
					description,
					context,
					image: getRandomBanner()
				})
			});

			if (response.ok) {
				// Invalidate first to reload data
				await invalidateAll();
				// Then clean up and close
				name = '';
				description = '';
				context = '';
				show = false;
			}
		} finally {
			isSubmitting = false;
		}
	}

	function handleClose() {
		show = false;
		name = '';
		description = '';
		context = '';
	}
</script>

<Modal bind:open={show} size="lg" autoclose={false} class="w-full">
	<form onsubmit={(e) => { e.preventDefault(); handleSubmit(); }} class="space-y-6">
		<!-- Header -->
		<div class="flex items-center gap-4">
			<div class="flex h-12 w-12 items-center justify-center rounded-xl bg-gradient-to-br from-blue-500 to-indigo-600 shadow-lg">
				<BookOpen class="h-6 w-6 text-white" />
			</div>
			<div>
				<h3 class="text-xl font-bold text-gray-900 dark:text-white">Crear nuevo curso</h3>
				<p class="text-sm text-gray-500 dark:text-gray-400">
					Completa la información básica para empezar
				</p>
			</div>
		</div>

		<!-- Name Field -->
		<div>
			<Label for="course-name" class="mb-2 text-base font-semibold">
				Nombre del curso <span class="text-red-500">*</span>
			</Label>
			<Input
				id="course-name"
				required
				bind:value={name}
				placeholder="Ej: Introducción al Pensamiento Creativo"
				class="!rounded-xl border-2 !px-4 !py-3 !text-lg transition-all focus:!border-blue-500 focus:!ring-2 focus:!ring-blue-500/20"
			/>
		</div>

		<!-- Description Field -->
		<div>
			<Label for="course-description" class="mb-2 text-base font-semibold">Descripción</Label>
			<Textarea
				id="course-description"
				bind:value={description}
				rows={3}
				placeholder="Describe brevemente el contenido y objetivos del curso..."
				class="w-full resize-none !rounded-xl border-2 !px-4 !py-3 transition-all focus:!border-blue-500 focus:!ring-2 focus:!ring-blue-500/20"
			/>
		</div>

		<!-- AI Context Field -->
		<!-- <div class="rounded-xl border border-purple-200 bg-gradient-to-br from-purple-50 to-indigo-50/50 p-4 dark:border-purple-800 dark:from-purple-900/20 dark:to-indigo-900/10">
			<div class="mb-3 flex items-center gap-2">
				<Sparkles class="h-4 w-4 text-purple-600 dark:text-purple-400" />
				<Label for="course-context" class="!mb-0 font-semibold text-purple-700 dark:text-purple-300">
					Contexto para IA (opcional)
				</Label>
			</div>
			<Textarea
				id="course-context"
				bind:value={context}
				rows={3}
				placeholder="Información de contexto que la IA usará en las actividades interactivas..."
				class="w-full resize-none !rounded-lg border border-purple-200 !bg-white !px-3 !py-2 text-sm transition-all focus:!border-purple-500 focus:!ring-2 focus:!ring-purple-500/20 dark:border-purple-800 dark:!bg-gray-800"
			/>
		</div> -->

		<!-- Actions -->
		<div class="flex justify-end gap-3 pt-2">
			<Button color="alternative" onclick={handleClose} class="!rounded-xl">
				Cancelar
			</Button>
			<Button
				type="submit"
				disabled={isSubmitting || !name.trim()}
				color="blue"
				class="gap-2 !rounded-xl !px-6"
			>
				{#if isSubmitting}
					<Loader2 class="h-4 w-4 animate-spin" />
					Creando...
				{:else}
					Crear curso
				{/if}
			</Button>
		</div>
	</form>
</Modal>