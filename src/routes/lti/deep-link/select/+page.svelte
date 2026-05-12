<script lang="ts">
	import { Link, Send } from 'lucide-svelte';

	let { data } = $props();
</script>

<svelte:head>
	<title>Seleccionar actividad LTI - Sapin</title>
</svelte:head>

<main class="min-h-screen bg-gray-50 px-4 py-6 text-gray-900">
	<div class="mx-auto max-w-4xl space-y-5">
		<header class="flex items-center justify-between border-b border-gray-200 pb-4">
			<div>
				<h1 class="text-2xl font-semibold">Seleccionar actividad Sapin</h1>
				<p class="mt-1 text-sm text-gray-600">
					Elige una actividad publicada para añadirla al curso de Moodle.
				</p>
			</div>
			<Link class="h-7 w-7 text-gray-500" aria-hidden="true" />
		</header>

		{#if data.courses.length === 0}
			<section class="rounded-lg border border-amber-200 bg-amber-50 p-5 text-sm text-amber-900">
				No tienes cursos Sapin con permisos docentes suficientes para publicar enlaces LTI.
			</section>
		{:else}
			<form method="GET" action="/lti/deep-link/select" class="flex flex-wrap items-end gap-3">
				<input type="hidden" name="session" value={data.sessionId} />
				<label class="min-w-64 flex-1 text-sm font-medium">
					Curso Sapin
					<select
						class="mt-1 w-full rounded-md border border-gray-300 bg-white px-3 py-2"
						name="courseId"
						value={data.selectedCourseId}
					>
						{#each data.courses as course (course.id)}
							<option value={course.id}>{course.name}</option>
						{/each}
					</select>
				</label>
				<button
					class="rounded-md border border-gray-300 bg-white px-4 py-2 text-sm font-medium"
					type="submit"
				>
					Cambiar
				</button>
			</form>

			<form method="POST" action="/lti/deep-link/respond" class="space-y-4">
				<input type="hidden" name="session" value={data.sessionId} />
				<input type="hidden" name="courseId" value={data.selectedCourseId ?? ''} />

				<section class="overflow-hidden rounded-lg border border-gray-200 bg-white">
					{#if data.activities.length === 0}
						<p class="p-5 text-sm text-gray-600">
							Este curso no tiene actividades publicadas disponibles.
						</p>
					{:else}
						<div class="divide-y divide-gray-200">
							{#each data.activities as activity, index (activity.id)}
								<label class="flex cursor-pointer items-center gap-4 p-4 hover:bg-gray-50">
									<input
										class="h-4 w-4"
										type="radio"
										name="activityId"
										value={activity.id}
										checked={index === 0}
									/>
									<span class="min-w-0 flex-1">
										<span class="block truncate text-sm font-medium">{activity.name}</span>
										<span class="text-xs tracking-wide text-gray-500 uppercase"
											>{activity.type}</span
										>
									</span>
								</label>
							{/each}
						</div>
					{/if}
				</section>

				<label class="flex items-center gap-3 text-sm">
					<input class="h-4 w-4" type="checkbox" name="enableGradebook" checked />
					Crear ítem de calificación en Moodle
				</label>

				<button
					class="inline-flex items-center gap-2 rounded-md bg-gray-900 px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
					type="submit"
					disabled={data.activities.length === 0}
				>
					<Send class="h-4 w-4" aria-hidden="true" />
					Añadir a Moodle
				</button>
			</form>
		{/if}
	</div>
</main>
