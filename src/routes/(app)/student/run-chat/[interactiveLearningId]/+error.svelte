<script lang="ts">
	import { page } from '$app/stores';
	import { Button } from 'flowbite-svelte';
</script>

<div class="flex min-h-screen items-center justify-center bg-gray-100 p-4 dark:bg-gray-900">
	<div class="w-full max-w-md rounded-lg bg-white p-8 shadow-lg dark:bg-gray-800">
		{#if $page.status === 403}
			<!-- Actividad cerrada o acceso denegado -->
			<div class="text-center">
				<div
					class="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-orange-100"
				>
					<span class="text-3xl">🔒</span>
				</div>
				<h1 class="mb-2 text-2xl font-bold text-gray-800 dark:text-white">Actividad Cerrada</h1>
				<p class="mb-6 text-gray-600 dark:text-gray-400">
					{$page.error?.message || 'Esta actividad no está disponible para nuevas interacciones.'}
				</p>
				<div class="flex flex-col gap-3">
					<Button color="blue" href="/" class="w-full">Ir al Inicio</Button>
					<p class="text-sm text-gray-500">
						Si ya participaste anteriormente, puedes consultar tu historial desde el panel del
						curso.
					</p>
				</div>
			</div>
		{:else if $page.status === 401}
			<!-- No autorizado -->
			<div class="text-center">
				<div
					class="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-red-100"
				>
					<span class="text-3xl">🚫</span>
				</div>
				<h1 class="mb-2 text-2xl font-bold text-gray-800 dark:text-white">Acceso No Autorizado</h1>
				<p class="mb-6 text-gray-600 dark:text-gray-400">
					{$page.error?.message || 'Necesitas iniciar sesión para acceder a esta actividad.'}
				</p>
				<Button color="blue" href="/login" class="w-full">Iniciar Sesión</Button>
			</div>
		{:else if $page.status === 404}
			<!-- No encontrado -->
			<div class="text-center">
				<div
					class="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-gray-100"
				>
					<span class="text-3xl">🔍</span>
				</div>
				<h1 class="mb-2 text-2xl font-bold text-gray-800 dark:text-white">
					Actividad No Encontrada
				</h1>
				<p class="mb-6 text-gray-600 dark:text-gray-400">
					{$page.error?.message || 'La actividad que buscas no existe o fue eliminada.'}
				</p>
				<Button color="blue" href="/" class="w-full">Ir al Inicio</Button>
			</div>
		{:else}
			<!-- Error genérico -->
			<div class="text-center">
				<div
					class="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-red-100"
				>
					<span class="text-3xl">⚠️</span>
				</div>
				<h1 class="mb-2 text-2xl font-bold text-gray-800 dark:text-white">
					Error {$page.status}
				</h1>
				<p class="mb-6 text-gray-600 dark:text-gray-400">
					{$page.error?.message || 'Ha ocurrido un error inesperado.'}
				</p>
				<div class="flex flex-col gap-3">
					<Button color="blue" href="/" class="w-full">Ir al Inicio</Button>
					<button
						type="button"
						onclick={() => window.history.back()}
						class="w-full rounded-lg border border-gray-300 bg-white px-5 py-2.5 text-sm font-medium text-gray-900 hover:bg-gray-100 focus:ring-4 focus:ring-gray-200 focus:outline-none dark:border-gray-600 dark:bg-gray-800 dark:text-white dark:hover:border-gray-600 dark:hover:bg-gray-700 dark:focus:ring-gray-700"
					>
						Volver Atrás
					</button>
				</div>
			</div>
		{/if}
	</div>
</div>
