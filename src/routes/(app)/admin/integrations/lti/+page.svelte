<script lang="ts">
	import { Copy, KeyRound, PlugZap } from 'lucide-svelte';

	let { data, form } = $props();
</script>

<svelte:head>
	<title>Integración LTI - Sapin</title>
</svelte:head>

<div class="space-y-6 p-6">
	<header class="flex flex-wrap items-start justify-between gap-4 border-b border-gray-200 pb-4">
		<div>
			<h1 class="text-2xl font-semibold text-gray-900">LTI Advantage</h1>
			<p class="mt-1 text-sm text-gray-600">
				Registro manual de Moodle y endpoints públicos de {data.toolName}.
			</p>
		</div>
		<form method="POST" action="?/ensureKey">
			<button
				class="inline-flex items-center gap-2 rounded-md bg-gray-900 px-4 py-2 text-sm font-medium text-white"
			>
				<KeyRound class="h-4 w-4" aria-hidden="true" />
				Asegurar clave JWKS
			</button>
		</form>
	</header>

	{#if form?.message}
		<p
			class="rounded-md border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-900"
		>
			{form.message}
		</p>
	{/if}

	<section class="space-y-3">
		<h2 class="text-lg font-semibold text-gray-900">URLs para Moodle</h2>
		<div class="grid gap-3 md:grid-cols-2">
			{#each Object.entries(data.urls) as [label, value] (label)}
				<div class="rounded-lg border border-gray-200 bg-white p-4">
					<div class="mb-2 flex items-center gap-2 text-sm font-medium text-gray-500 uppercase">
						<Copy class="h-4 w-4" aria-hidden="true" />
						{label}
					</div>
					<code class="text-sm break-all text-gray-900">{value}</code>
				</div>
			{/each}
		</div>
	</section>

	<section class="grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(360px,0.7fr)]">
		<div class="space-y-3">
			<h2 class="text-lg font-semibold text-gray-900">Plataformas registradas</h2>
			<div class="overflow-hidden rounded-lg border border-gray-200 bg-white">
				{#if data.platforms.length === 0}
					<p class="p-5 text-sm text-gray-600">Todavía no hay plataformas LTI registradas.</p>
				{:else}
					<div class="divide-y divide-gray-200">
						{#each data.platforms as platform (platform.id)}
							<article class="space-y-3 p-4">
								<div class="flex items-start justify-between gap-3">
									<div>
										<h3 class="font-medium text-gray-900">{platform.name}</h3>
										<p class="text-xs break-all text-gray-500">{platform.issuer}</p>
									</div>
									<span class="rounded bg-gray-100 px-2 py-1 text-xs font-medium text-gray-700"
										>{platform.status}</span
									>
								</div>
								<div class="grid gap-2 text-xs text-gray-600 md:grid-cols-2">
									<p><span class="font-medium">Client ID:</span> {platform.clientId}</p>
									<p><span class="font-medium">Token:</span> {platform.tokenUrl}</p>
								</div>
								<form method="POST" action="?/togglePlatform" class="flex items-center gap-2">
									<input type="hidden" name="id" value={platform.id} />
									<select
										class="rounded-md border border-gray-300 px-2 py-1 text-sm"
										name="status"
										value={platform.status}
									>
										<option value="active">active</option>
										<option value="paused">paused</option>
										<option value="disabled">disabled</option>
									</select>
									<button class="rounded-md border border-gray-300 px-3 py-1 text-sm" type="submit"
										>Guardar</button
									>
								</form>
							</article>
						{/each}
					</div>
				{/if}
			</div>
		</div>

		<form
			method="POST"
			action="?/createPlatform"
			class="space-y-4 rounded-lg border border-gray-200 bg-white p-5"
		>
			<div class="flex items-center gap-2">
				<PlugZap class="h-5 w-5 text-gray-500" aria-hidden="true" />
				<h2 class="text-lg font-semibold text-gray-900">Registrar Moodle</h2>
			</div>
			<label class="block text-sm font-medium">
				Nombre
				<input
					class="mt-1 w-full rounded-md border border-gray-300 px-3 py-2"
					name="name"
					required
				/>
			</label>
			<label class="block text-sm font-medium">
				Issuer
				<input
					class="mt-1 w-full rounded-md border border-gray-300 px-3 py-2"
					name="issuer"
					required
				/>
			</label>
			<label class="block text-sm font-medium">
				Client ID
				<input
					class="mt-1 w-full rounded-md border border-gray-300 px-3 py-2"
					name="clientId"
					required
				/>
			</label>
			<label class="block text-sm font-medium">
				Authentication request URL
				<input
					class="mt-1 w-full rounded-md border border-gray-300 px-3 py-2"
					name="authLoginUrl"
					required
				/>
			</label>
			<label class="block text-sm font-medium">
				Access token URL
				<input
					class="mt-1 w-full rounded-md border border-gray-300 px-3 py-2"
					name="tokenUrl"
					required
				/>
			</label>
			<label class="block text-sm font-medium">
				Public keyset URL de Moodle
				<input
					class="mt-1 w-full rounded-md border border-gray-300 px-3 py-2"
					name="jwksUrl"
					required
				/>
			</label>
			<label class="block text-sm font-medium">
				Deployment ID
				<input
					class="mt-1 w-full rounded-md border border-gray-300 px-3 py-2"
					name="deploymentId"
					required
				/>
			</label>
			<label class="block text-sm font-medium">
				Nombre del deployment
				<input
					class="mt-1 w-full rounded-md border border-gray-300 px-3 py-2"
					name="deploymentName"
				/>
			</label>
			<button
				class="w-full rounded-md bg-gray-900 px-4 py-2 text-sm font-medium text-white"
				type="submit"
			>
				Registrar
			</button>
		</form>
	</section>
</div>
