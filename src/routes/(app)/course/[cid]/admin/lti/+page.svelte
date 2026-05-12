<script lang="ts">
	import { BookOpen, CheckCircle2, CircleSlash, ExternalLink } from 'lucide-svelte';

	let { data } = $props();
</script>

<svelte:head>
	<title>Enlaces LTI - Sapin</title>
</svelte:head>

<div class="space-y-6 p-6">
	<header class="border-b border-gray-200 pb-4">
		<h1 class="text-2xl font-semibold text-gray-900">Enlaces LTI publicados</h1>
		<p class="mt-1 text-sm text-gray-600">
			Actividad de launches y sincronización de calificaciones para este curso.
		</p>
	</header>

	<section class="space-y-3">
		<div class="flex items-center gap-2">
			<BookOpen class="h-5 w-5 text-gray-500" aria-hidden="true" />
			<h2 class="text-lg font-semibold text-gray-900">Resource links</h2>
		</div>
		<div class="overflow-hidden rounded-lg border border-gray-200 bg-white">
			{#if data.resourceLinks.length === 0}
				<p class="p-5 text-sm text-gray-600">
					Todavía no hay enlaces LTI publicados para este curso.
				</p>
			{:else}
				<div class="divide-y divide-gray-200">
					{#each data.resourceLinks as row (row.link.id)}
						<article class="grid gap-3 p-4 lg:grid-cols-[minmax(0,1fr)_220px]">
							<div class="min-w-0">
								<h3 class="truncate font-medium text-gray-900">{row.activity.name}</h3>
								<p class="text-sm text-gray-600">{row.platform.name} · {row.deployment.name}</p>
								<p class="mt-1 text-xs break-all text-gray-500">
									Resource: {row.link.resourceLinkId}
								</p>
							</div>
							<div class="space-y-2 text-sm text-gray-700">
								<p class="flex items-center gap-2">
									{#if row.link.lineItemUrl}
										<CheckCircle2 class="h-4 w-4 text-emerald-600" aria-hidden="true" />
										Gradebook activo
									{:else}
										<CircleSlash class="h-4 w-4 text-gray-400" aria-hidden="true" />
										Sin line item
									{/if}
								</p>
								<p class="text-xs text-gray-500">
									Actualizado: {row.link.updatedAt.toLocaleString()}
								</p>
							</div>
						</article>
					{/each}
				</div>
			{/if}
		</div>
	</section>

	<section class="space-y-3">
		<div class="flex items-center gap-2">
			<ExternalLink class="h-5 w-5 text-gray-500" aria-hidden="true" />
			<h2 class="text-lg font-semibold text-gray-900">Últimos envíos AGS</h2>
		</div>
		<div class="overflow-hidden rounded-lg border border-gray-200 bg-white">
			{#if data.gradeSyncLogs.length === 0}
				<p class="p-5 text-sm text-gray-600">
					Aún no hay intentos de sincronización con el gradebook.
				</p>
			{:else}
				<table class="w-full text-left text-sm">
					<thead class="bg-gray-50 text-xs text-gray-500 uppercase">
						<tr>
							<th class="px-4 py-3">Fecha</th>
							<th class="px-4 py-3">Estado</th>
							<th class="px-4 py-3">HTTP</th>
							<th class="px-4 py-3">Detalle</th>
						</tr>
					</thead>
					<tbody class="divide-y divide-gray-200">
						{#each data.gradeSyncLogs as log (log.id)}
							<tr>
								<td class="px-4 py-3 text-gray-600">{log.createdAt.toLocaleString()}</td>
								<td class="px-4 py-3 font-medium text-gray-900">{log.status}</td>
								<td class="px-4 py-3 text-gray-600">{log.httpStatus ?? '-'}</td>
								<td class="px-4 py-3 text-gray-600">{log.errorMessage ?? log.lineItemUrl ?? '-'}</td
								>
							</tr>
						{/each}
					</tbody>
				</table>
			{/if}
		</div>
	</section>
</div>
