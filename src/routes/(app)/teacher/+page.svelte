<script lang="ts">
	import type { PageData } from './$types';
	import { Button } from 'flowbite-svelte';
	import { PlusCircle } from 'lucide-svelte';
	import CreateCourseModal from '$lib/components/CreateCourseModal.svelte';

	let { data }: { data: PageData } = $props();
	let showCreateModal = $state(false);

	const gradients = [
		'from-blue-300/60 via-indigo-200/60 to-violet-300/60',
		'from-teal-200/60 via-emerald-200/60 to-green-300/60',
		'from-rose-200/60 via-pink-200/60 to-purple-300/60',
		'from-sky-200/60 via-cyan-200/60 to-blue-300/60'
	];

	function truncateText(text: string | null | undefined, maxLength: number) {
		if (!text) return '-';
		return text.length > maxLength ? text.slice(0, maxLength) + '...' : text;
	}
</script>

<div class="mx-auto max-w-[2000px] p-4">
	<div class="mb-8 flex items-center justify-between">
		<h1 class="text-3xl font-bold dark:text-white">Mis cursos</h1>
		<Button color="blue" size="lg" onclick={() => (showCreateModal = true)}>
			<PlusCircle class="mr-2 h-5 w-5" />
			Crear curso
		</Button>
	</div>

	<div class="space-y-6">
		{#each data.courses as course, i (course.assignmentId)}
			<div
				class="group relative overflow-hidden rounded-xl bg-gradient-to-r {gradients[
					i % gradients.length
				]} shadow-lg backdrop-blur-sm transition-all duration-500 hover:-translate-y-1 hover:scale-[1.01] hover:shadow-2xl"
			>
				<!-- Efecto de brillo en hover -->
				<div
					class="absolute inset-0 opacity-0 transition-opacity duration-500 group-hover:opacity-100"
				>
					<div
						class="absolute inset-0 translate-x-[-100%] rotate-45 transform bg-gradient-to-r from-white/5 to-transparent transition-transform duration-1000 group-hover:translate-x-[200%]"
					></div>
				</div>

				<div class="relative z-10 flex flex-col items-center gap-8 p-8 lg:flex-row">
					<div
						class="aspect-video w-full overflow-hidden rounded-lg bg-black/5 transition-transform duration-500 group-hover:scale-105 group-hover:shadow-xl lg:w-1/3"
					>
						{#if course.image}
							<img
								src={course.image}
								alt={course.name}
								class="h-full w-full object-cover transition-transform duration-500 group-hover:scale-110"
							/>
						{:else}
							<div class="flex h-full w-full items-center justify-center">
								<span class="text-white/60">No image</span>
							</div>
						{/if}
					</div>
					<div class="flex-1 text-gray-800 dark:text-white">
						<h2
							class="mb-4 text-4xl font-bold transition-transform duration-500 group-hover:translate-x-2"
						>
							{course.name}
						</h2>
						<p
							class="mb-8 text-xl leading-relaxed text-gray-700/90 transition-all duration-500 group-hover:text-gray-900 dark:text-white/90 dark:group-hover:text-white"
						>
							{truncateText(course.description, 150) || 'No description available'}
						</p>
						<div class="flex justify-end">
							<Button
								href={`/course/${course.id}/admin`}
								size="xl"
								color="light"
								class="px-16 py-4 text-lg font-semibold shadow-lg transition-all duration-500 hover:-translate-y-1 hover:scale-105 hover:shadow-xl"
							>
								Administrar curso
							</Button>
						</div>
					</div>
				</div>
			</div>
		{/each}

		{#if data.courses.length === 0}
			<div
				class="rounded-xl bg-gradient-to-r from-gray-200/60 via-gray-300/60 to-gray-400/60 p-12 text-center transition-all duration-500 hover:scale-[1.01] hover:shadow-xl"
			>
				<p class="mb-2 text-xl text-gray-800 dark:text-white">You don't have any courses yet.</p>
				<p class="text-gray-600 dark:text-gray-200">
					Click the Create Course button to get started.
				</p>
			</div>
		{/if}
	</div>
</div>

<CreateCourseModal bind:show={showCreateModal} />

<style>
	@keyframes shine {
		from {
			transform: translateX(-100%) rotate(45deg);
		}
		to {
			transform: translateX(200%) rotate(45deg);
		}
	}
</style>
