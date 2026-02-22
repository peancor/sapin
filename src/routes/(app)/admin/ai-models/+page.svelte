<script lang="ts">
	import type { PageData, ActionData } from './$types';
	import { breadcrumb } from '$lib/stores/breadcrumb';
	import { enhance } from '$app/forms';
	import { invalidateAll } from '$app/navigation';
	import {
		Button,
		Input,
		Label,
		Select,
		Toggle,
		Modal,
		Table,
		TableHead,
		TableHeadCell,
		TableBody,
		TableBodyRow,
		TableBodyCell,
		Badge,
		Card,
		Alert,
		Tabs,
		TabItem
	} from 'flowbite-svelte';
	import {
		Bot,
		Plus,
		Pencil,
		Trash2,
		Server,
		DollarSign,
		Activity,
		Users,
		Zap,
		TrendingUp,
		Clock,
		CheckCircle,
		XCircle,
		Star,
		RotateCcw
	} from 'lucide-svelte';

	let { data, form }: { data: PageData; form: ActionData } = $props();

	// Modals state
	let showProviderModal = $state(false);
	let showModelModal = $state(false);
	let showQuotaModal = $state(false);
	let editingProvider = $state<typeof data.providers[0] | null>(null);
	let editingModel = $state<typeof data.models[0] | null>(null);
	let editingQuota = $state<typeof data.quotas[0] | null>(null);

	// Messages
	let successMessage = $state('');
	let errorMessage = $state('');

	$effect(() => {
		if (form?.success && form?.message) {
			successMessage = form.message;
			setTimeout(() => (successMessage = ''), 4000);
		}
		if (form?.error) {
			errorMessage = form.error;
			setTimeout(() => (errorMessage = ''), 4000);
		}
	});

	// Breadcrumb
	$effect(() => {
		breadcrumb.set([
			{ label: 'Admin', href: '/admin' },
			{ label: 'Modelos IA', href: '/admin/ai-models' }
		]);
	});

	// Helpers
	function formatNumber(num: number): string {
		if (num >= 1_000_000) return (num / 1_000_000).toFixed(2) + 'M';
		if (num >= 1_000) return (num / 1_000).toFixed(1) + 'K';
		return num.toString();
	}

	function formatCurrency(amount: number): string {
		return new Intl.NumberFormat('en-US', {
			style: 'currency',
			currency: 'USD',
			minimumFractionDigits: 4
		}).format(amount);
	}

	function formatDate(date: Date | string): string {
		return new Date(date).toLocaleString('es-ES', {
			day: '2-digit',
			month: '2-digit',
			hour: '2-digit',
			minute: '2-digit'
		});
	}

	function openProviderModal(provider?: typeof data.providers[0]) {
		editingProvider = provider || null;
		showProviderModal = true;
	}

	function openModelModal(model?: typeof data.models[0]) {
		editingModel = model || null;
		showModelModal = true;
	}

	function openQuotaModal(quota?: typeof data.quotas[0]) {
		editingQuota = quota || null;
		showQuotaModal = true;
	}

	function closeModals() {
		showProviderModal = false;
		showModelModal = false;
		showQuotaModal = false;
		editingProvider = null;
		editingModel = null;
		editingQuota = null;
	}

	// Provider options for select
	let providerOptions = $derived(
		data.providers.map((p) => ({ value: p.id, name: p.displayName }))
	);

	let modelOptions = $derived([
		{ value: '', name: 'Todos los modelos' },
		...data.models.map((m) => ({ value: m.model.id, name: m.model.displayName }))
	]);
</script>

<div class="space-y-6">
	<!-- Header -->
	<div class="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
		<div>
			<h1 class="text-2xl font-bold text-gray-900 dark:text-white">Gestión de Modelos IA</h1>
			<p class="mt-1 text-sm text-gray-500 dark:text-gray-400">
				Administra proveedores, modelos, cuotas y supervisa el uso de IA
			</p>
		</div>
	</div>

	<!-- Messages -->
	{#if successMessage}
		<Alert color="green" dismissable onclose={() => (successMessage = '')}>
			<CheckCircle class="me-2 inline h-5 w-5" />
			{successMessage}
		</Alert>
	{/if}

	{#if errorMessage}
		<Alert color="red" dismissable onclose={() => (errorMessage = '')}>
			<XCircle class="me-2 inline h-5 w-5" />
			{errorMessage}
		</Alert>
	{/if}

	<!-- Stats Cards -->
	<div class="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
		<Card class="p-4">
			<div class="flex items-center gap-3">
				<div class="rounded-lg bg-blue-100 p-3 dark:bg-blue-900">
					<Zap class="h-6 w-6 text-blue-600 dark:text-blue-400" />
				</div>
				<div>
					<p class="text-sm text-gray-500 dark:text-gray-400">Peticiones (mes)</p>
					<p class="text-2xl font-bold text-gray-900 dark:text-white">
						{formatNumber(data.usageStats.totalRequests)}
					</p>
				</div>
			</div>
		</Card>

		<Card class="p-4">
			<div class="flex items-center gap-3">
				<div class="rounded-lg bg-green-100 p-3 dark:bg-green-900">
					<TrendingUp class="h-6 w-6 text-green-600 dark:text-green-400" />
				</div>
				<div>
					<p class="text-sm text-gray-500 dark:text-gray-400">Tokens (mes)</p>
					<p class="text-2xl font-bold text-gray-900 dark:text-white">
						{formatNumber(data.usageStats.totalTokens)}
					</p>
				</div>
			</div>
		</Card>

		<Card class="p-4">
			<div class="flex items-center gap-3">
				<div class="rounded-lg bg-yellow-100 p-3 dark:bg-yellow-900">
					<DollarSign class="h-6 w-6 text-yellow-600 dark:text-yellow-400" />
				</div>
				<div>
					<p class="text-sm text-gray-500 dark:text-gray-400">Costo (mes)</p>
					<p class="text-2xl font-bold text-gray-900 dark:text-white">
						{formatCurrency(data.usageStats.totalCost)}
					</p>
				</div>
			</div>
		</Card>

		<Card class="p-4">
			<div class="flex items-center gap-3">
				<div class="rounded-lg bg-purple-100 p-3 dark:bg-purple-900">
					<Clock class="h-6 w-6 text-purple-600 dark:text-purple-400" />
				</div>
				<div>
					<p class="text-sm text-gray-500 dark:text-gray-400">Latencia media</p>
					<p class="text-2xl font-bold text-gray-900 dark:text-white">
						{data.usageStats.avgDurationMs}ms
					</p>
				</div>
			</div>
		</Card>
	</div>

	<!-- Tabs -->
	<Tabs style="underline">
		<!-- Models Tab -->
		<TabItem open title="Modelos">
			{#snippet titleSlot()}
				<Bot class="me-2 inline h-4 w-4" />
				Modelos ({data.models.length})
			{/snippet}

			<div class="space-y-4">
				<div class="flex justify-end">
					<Button color="primary" size="sm" onclick={() => openModelModal()}>
						<Plus class="me-2 h-4 w-4" />
						Nuevo Modelo
					</Button>
				</div>

				<Table striped>
					<TableHead>
						<TableHeadCell>Modelo</TableHeadCell>
						<TableHeadCell>Proveedor</TableHeadCell>
						<TableHeadCell>Contexto</TableHeadCell>
						<TableHeadCell>Precio (Input/Output)</TableHeadCell>
						<TableHeadCell>Estado</TableHeadCell>
						<TableHeadCell>Acciones</TableHeadCell>
					</TableHead>
					<TableBody>
						{#each data.models as { model, provider } (model.id)}
							<TableBodyRow>
								<TableBodyCell>
									<div class="flex items-center gap-2">
										{#if model.isDefault}
											<Star class="h-4 w-4 text-yellow-500" />
										{/if}
										<div>
											<p class="font-medium text-gray-900 dark:text-white">{model.displayName}</p>
											<p class="text-xs text-gray-500">{model.name}</p>
										</div>
									</div>
								</TableBodyCell>
								<TableBodyCell>
									<Badge color="blue">{provider?.displayName || 'N/A'}</Badge>
								</TableBodyCell>
								<TableBodyCell>
									{model.contextWindow ? formatNumber(model.contextWindow) : '-'}
								</TableBodyCell>
								<TableBodyCell>
									<span class="text-xs">
										${model.inputPricePerMillion ?? 0}/M in<br />
										${model.outputPricePerMillion ?? 0}/M out
									</span>
								</TableBodyCell>
								<TableBodyCell>
									<form method="POST" action="?/toggleModelActive" use:enhance>
										<input type="hidden" name="id" value={model.id} />
										<input type="hidden" name="isActive" value={model.isActive.toString()} />
										<button type="submit">
											<Badge color={model.isActive ? 'green' : 'gray'}>
												{model.isActive ? 'Activo' : 'Inactivo'}
											</Badge>
										</button>
									</form>
								</TableBodyCell>
								<TableBodyCell>
									<div class="flex gap-2">
										{#if !model.isDefault}
											<form method="POST" action="?/setDefaultModel" use:enhance>
												<input type="hidden" name="id" value={model.id} />
												<Button size="xs" color="light" type="submit" title="Hacer predeterminado">
													<Star class="h-3 w-3" />
												</Button>
											</form>
										{/if}
										<Button
											size="xs"
											color="light"
											onclick={() => openModelModal({ model, provider })}
										>
											<Pencil class="h-3 w-3" />
										</Button>
										<form method="POST" action="?/deleteModel" use:enhance>
											<input type="hidden" name="id" value={model.id} />
											<Button size="xs" color="red" type="submit">
												<Trash2 class="h-3 w-3" />
											</Button>
										</form>
									</div>
								</TableBodyCell>
							</TableBodyRow>
						{/each}
					</TableBody>
				</Table>
			</div>
		</TabItem>

		<!-- Providers Tab -->
		<TabItem title="Proveedores">
			{#snippet titleSlot()}
				<Server class="me-2 inline h-4 w-4" />
				Proveedores ({data.providers.length})
			{/snippet}

			<div class="space-y-4">
				<div class="flex justify-end">
					<Button color="primary" size="sm" onclick={() => openProviderModal()}>
						<Plus class="me-2 h-4 w-4" />
						Nuevo Proveedor
					</Button>
				</div>

				<Table striped>
					<TableHead>
						<TableHeadCell>Proveedor</TableHeadCell>
						<TableHeadCell>Tipo</TableHeadCell>
						<TableHeadCell>URL Base</TableHeadCell>
						<TableHeadCell>API Key</TableHeadCell>
						<TableHeadCell>Estado</TableHeadCell>
						<TableHeadCell>Acciones</TableHeadCell>
					</TableHead>
					<TableBody>
						{#each data.providers as provider (provider.id)}
							<TableBodyRow>
								<TableBodyCell>
									<p class="font-medium text-gray-900 dark:text-white">{provider.displayName}</p>
									<p class="text-xs text-gray-500">{provider.name}</p>
								</TableBodyCell>
								<TableBodyCell>
									<Badge color="purple">{provider.type}</Badge>
								</TableBodyCell>
								<TableBodyCell>
									<span class="text-xs">{provider.baseUrl || '-'}</span>
								</TableBodyCell>
								<TableBodyCell>
									{#if provider.apiKey}
										<Badge color="green">Configurada</Badge>
									{:else}
										<Badge color="gray">No configurada</Badge>
									{/if}
								</TableBodyCell>
								<TableBodyCell>
									<Badge color={provider.isActive ? 'green' : 'gray'}>
										{provider.isActive ? 'Activo' : 'Inactivo'}
									</Badge>
								</TableBodyCell>
								<TableBodyCell>
									<div class="flex gap-2">
										<Button size="xs" color="light" onclick={() => openProviderModal(provider)}>
											<Pencil class="h-3 w-3" />
										</Button>
										<form method="POST" action="?/deleteProvider" use:enhance>
											<input type="hidden" name="id" value={provider.id} />
											<Button size="xs" color="red" type="submit">
												<Trash2 class="h-3 w-3" />
											</Button>
										</form>
									</div>
								</TableBodyCell>
							</TableBodyRow>
						{/each}
					</TableBody>
				</Table>
			</div>
		</TabItem>

		<!-- Quotas Tab -->
		<TabItem title="Cuotas">
			{#snippet titleSlot()}
				<Activity class="me-2 inline h-4 w-4" />
				Cuotas ({data.quotas.length})
			{/snippet}

			<div class="space-y-4">
				<div class="flex justify-end">
					<Button color="primary" size="sm" onclick={() => openQuotaModal()}>
						<Plus class="me-2 h-4 w-4" />
						Nueva Cuota
					</Button>
				</div>

				<Table striped>
					<TableHead>
						<TableHeadCell>Tipo</TableHeadCell>
						<TableHeadCell>Período</TableHeadCell>
						<TableHeadCell>Límites</TableHeadCell>
						<TableHeadCell>Uso Actual</TableHeadCell>
						<TableHeadCell>Estado</TableHeadCell>
						<TableHeadCell>Acciones</TableHeadCell>
					</TableHead>
					<TableBody>
						{#each data.quotas as quota (quota.id)}
							<TableBodyRow>
								<TableBodyCell>
									<Badge color="blue">{quota.type}</Badge>
									{#if quota.targetId}
										<p class="mt-1 text-xs text-gray-500">ID: {quota.targetId.slice(0, 8)}...</p>
									{/if}
								</TableBodyCell>
								<TableBodyCell>
									<Badge color="purple">{quota.period}</Badge>
								</TableBodyCell>
								<TableBodyCell>
									<div class="text-xs">
										{#if quota.maxTokens}
											<p>Tokens: {formatNumber(quota.maxTokens)}</p>
										{/if}
										{#if quota.maxRequests}
											<p>Peticiones: {quota.maxRequests}</p>
										{/if}
										{#if quota.maxCost}
											<p>Costo: {formatCurrency(quota.maxCost)}</p>
										{/if}
									</div>
								</TableBodyCell>
								<TableBodyCell>
									<div class="text-xs">
										<p>Tokens: {formatNumber(quota.currentTokens)}</p>
										<p>Peticiones: {quota.currentRequests}</p>
										<p>Costo: {formatCurrency(quota.currentCost)}</p>
									</div>
								</TableBodyCell>
								<TableBodyCell>
									<Badge color={quota.isActive ? 'green' : 'gray'}>
										{quota.isActive ? 'Activa' : 'Inactiva'}
									</Badge>
								</TableBodyCell>
								<TableBodyCell>
									<div class="flex gap-2">
										<form method="POST" action="?/resetQuota" use:enhance>
											<input type="hidden" name="id" value={quota.id} />
											<Button size="xs" color="light" type="submit" title="Resetear cuota">
												<RotateCcw class="h-3 w-3" />
											</Button>
										</form>
										<Button size="xs" color="light" onclick={() => openQuotaModal(quota)}>
											<Pencil class="h-3 w-3" />
										</Button>
										<form method="POST" action="?/deleteQuota" use:enhance>
											<input type="hidden" name="id" value={quota.id} />
											<Button size="xs" color="red" type="submit">
												<Trash2 class="h-3 w-3" />
											</Button>
										</form>
									</div>
								</TableBodyCell>
							</TableBodyRow>
						{/each}
					</TableBody>
				</Table>
			</div>
		</TabItem>

		<!-- Usage Tab -->
		<TabItem title="Uso Reciente">
			{#snippet titleSlot()}
				<Users class="me-2 inline h-4 w-4" />
				Uso
			{/snippet}

			<div class="space-y-6">
				<!-- Top Users -->
				<div>
					<h3 class="mb-3 text-lg font-medium text-gray-900 dark:text-white">
						Top Usuarios (este mes)
					</h3>
					<div class="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-5">
						{#each data.topUsers as userStat, i}
							<Card class="p-3">
								<div class="flex items-center gap-3">
									<div
										class="flex h-8 w-8 items-center justify-center rounded-full bg-primary-100 text-primary-600 dark:bg-primary-900 dark:text-primary-400"
									>
										{i + 1}
									</div>
									<div class="min-w-0 flex-1">
										<p class="truncate text-sm font-medium text-gray-900 dark:text-white">
											{userStat.user?.username || userStat.user?.email || 'Usuario'}
										</p>
										<p class="text-xs text-gray-500">
											{formatNumber(userStat.totalTokens)} tokens
										</p>
									</div>
								</div>
							</Card>
						{/each}
					</div>
				</div>

				<!-- Recent Logs -->
				<div>
					<h3 class="mb-3 text-lg font-medium text-gray-900 dark:text-white">
						Logs Recientes
					</h3>
					<Table striped>
						<TableHead>
							<TableHeadCell>Fecha</TableHeadCell>
							<TableHeadCell>Usuario</TableHeadCell>
							<TableHeadCell>Modelo</TableHeadCell>
							<TableHeadCell>Operación</TableHeadCell>
							<TableHeadCell>Tokens</TableHeadCell>
							<TableHeadCell>Costo</TableHeadCell>
							<TableHeadCell>Estado</TableHeadCell>
						</TableHead>
						<TableBody>
							{#each data.recentLogs as { log, model, user } (log.id)}
								<TableBodyRow>
									<TableBodyCell>
										<span class="text-xs">{formatDate(log.createdAt)}</span>
									</TableBodyCell>
									<TableBodyCell>
										<span class="text-sm">{user?.username || user?.email || '-'}</span>
									</TableBodyCell>
									<TableBodyCell>
										<Badge color="blue">{model?.displayName || 'N/A'}</Badge>
									</TableBodyCell>
									<TableBodyCell>
										<Badge color="purple">{log.operation}</Badge>
									</TableBodyCell>
									<TableBodyCell>
										<span class="text-xs">
											{log.inputTokens} in / {log.outputTokens} out
										</span>
									</TableBodyCell>
									<TableBodyCell>
										<span class="text-xs">{formatCurrency(log.estimatedCost ?? 0)}</span>
									</TableBodyCell>
									<TableBodyCell>
										{#if log.success}
											<Badge color="green">OK</Badge>
										{:else}
											<Badge color="red">Error</Badge>
										{/if}
									</TableBodyCell>
								</TableBodyRow>
							{/each}
						</TableBody>
					</Table>
				</div>
			</div>
		</TabItem>
	</Tabs>
</div>

<!-- Provider Modal -->
<Modal title={editingProvider ? 'Editar Proveedor' : 'Nuevo Proveedor'} bind:open={showProviderModal} size="md">
	<form
		method="POST"
		action={editingProvider ? '?/updateProvider' : '?/createProvider'}
		use:enhance={() => {
			return async ({ result }) => {
				if (result.type === 'success') {
					closeModals();
					await invalidateAll();
				}
			};
		}}
	>
		{#if editingProvider}
			<input type="hidden" name="id" value={editingProvider.id} />
		{/if}

		<div class="space-y-4">
			<div>
				<Label for="providerName">Nombre interno</Label>
				<Input
					id="providerName"
					name="name"
					placeholder="openai"
					value={editingProvider?.name || ''}
					required
				/>
			</div>

			<div>
				<Label for="providerDisplayName">Nombre a mostrar</Label>
				<Input
					id="providerDisplayName"
					name="displayName"
					placeholder="OpenAI"
					value={editingProvider?.displayName || ''}
					required
				/>
			</div>

			<div>
				<Label for="providerType">Tipo</Label>
				<Select
					id="providerType"
					name="type"
					items={data.providerTypes}
					value={editingProvider?.type || 'openai'}
				/>
			</div>

			<div>
				<Label for="providerBaseUrl">URL Base (para proveedores locales)</Label>
				<Input
					id="providerBaseUrl"
					name="baseUrl"
					placeholder="http://localhost:1234/v1"
					value={editingProvider?.baseUrl || ''}
				/>
			</div>

			<div>
				<Label for="providerApiKey">API Key</Label>
				<Input
					id="providerApiKey"
					name="apiKey"
					type="password"
					placeholder="sk-..."
					value={editingProvider?.apiKey || ''}
				/>
				<p class="mt-1 text-xs text-gray-500 dark:text-gray-400">
					La API key se almacena de forma segura en la base de datos
				</p>
			</div>

			{#if editingProvider}
				<div class="flex items-center gap-2">
					<Toggle name="isActive" checked={editingProvider?.isActive ?? true} />
					<Label>Activo</Label>
				</div>
			{/if}
		</div>

		<div class="mt-6 flex justify-end gap-3">
			<Button color="alternative" onclick={closeModals}>Cancelar</Button>
			<Button type="submit" color="primary">
				{editingProvider ? 'Guardar' : 'Crear'}
			</Button>
		</div>
	</form>
</Modal>

<!-- Model Modal -->
<Modal title={editingModel ? 'Editar Modelo' : 'Nuevo Modelo'} bind:open={showModelModal} size="lg">
	<form
		method="POST"
		action={editingModel ? '?/updateModel' : '?/createModel'}
		use:enhance={() => {
			return async ({ result }) => {
				if (result.type === 'success') {
					closeModals();
					await invalidateAll();
				}
			};
		}}
	>
		{#if editingModel}
			<input type="hidden" name="id" value={editingModel.model.id} />
		{/if}

		<div class="grid grid-cols-1 gap-4 md:grid-cols-2">
			<div>
				<Label for="modelProvider">Proveedor</Label>
				<Select
					id="modelProvider"
					name="providerId"
					items={providerOptions}
					value={editingModel?.model.providerId || ''}
					required
				/>
			</div>

			<div>
				<Label for="modelName">Nombre interno</Label>
				<Input
					id="modelName"
					name="name"
					placeholder="gpt-4"
					value={editingModel?.model.name || ''}
					required
				/>
			</div>

			<div>
				<Label for="modelDisplayName">Nombre a mostrar</Label>
				<Input
					id="modelDisplayName"
					name="displayName"
					placeholder="GPT-4"
					value={editingModel?.model.displayName || ''}
					required
				/>
			</div>

			<div>
				<Label for="modelCapabilities">Capacidades (separadas por coma)</Label>
				<Input
					id="modelCapabilities"
					name="capabilities"
					placeholder="text, vision, image"
					value={editingModel?.model.capabilities
						? JSON.parse(editingModel.model.capabilities).join(', ')
						: ''}
				/>
			</div>

			<div>
				<Label for="modelContext">Ventana de contexto</Label>
				<Input
					id="modelContext"
					name="contextWindow"
					type="number"
					placeholder="128000"
					value={editingModel?.model.contextWindow || ''}
				/>
			</div>

			<div>
				<Label for="modelMaxOutput">Tokens máximos de salida</Label>
				<Input
					id="modelMaxOutput"
					name="maxOutputTokens"
					type="number"
					placeholder="4096"
					value={editingModel?.model.maxOutputTokens || ''}
				/>
			</div>

			<div>
				<Label for="modelInputPrice">Precio input ($/millón tokens)</Label>
				<Input
					id="modelInputPrice"
					name="inputPricePerMillion"
					type="number"
					step="0.001"
					placeholder="0.50"
					value={editingModel?.model.inputPricePerMillion || ''}
				/>
			</div>

			<div>
				<Label for="modelOutputPrice">Precio output ($/millón tokens)</Label>
				<Input
					id="modelOutputPrice"
					name="outputPricePerMillion"
					type="number"
					step="0.001"
					placeholder="1.50"
					value={editingModel?.model.outputPricePerMillion || ''}
				/>
			</div>

			<div>
				<Label for="modelSortOrder">Orden</Label>
				<Input
					id="modelSortOrder"
					name="sortOrder"
					type="number"
					placeholder="0"
					value={editingModel?.model.sortOrder || '0'}
				/>
			</div>

			<div class="md:col-span-2">
				<Label for="modelDescription">Descripción</Label>
				<Input
					id="modelDescription"
					name="description"
					placeholder="Modelo de lenguaje avanzado..."
					value={editingModel?.model.description || ''}
				/>
			</div>

			<div class="flex items-center gap-4">
				<div class="flex items-center gap-2">
					<Toggle name="isDefault" checked={editingModel?.model.isDefault ?? false} />
					<Label>Predeterminado</Label>
				</div>
				<div class="flex items-center gap-2">
					<Toggle name="isActive" checked={editingModel?.model.isActive ?? true} />
					<Label>Activo</Label>
				</div>
			</div>
		</div>

		<div class="mt-6 flex justify-end gap-3">
			<Button color="alternative" onclick={closeModals}>Cancelar</Button>
			<Button type="submit" color="primary">
				{editingModel ? 'Guardar' : 'Crear'}
			</Button>
		</div>
	</form>
</Modal>

<!-- Quota Modal -->
<Modal title={editingQuota ? 'Editar Cuota' : 'Nueva Cuota'} bind:open={showQuotaModal} size="md">
	<form
		method="POST"
		action={editingQuota ? '?/updateQuota' : '?/createQuota'}
		use:enhance={() => {
			return async ({ result }) => {
				if (result.type === 'success') {
					closeModals();
					await invalidateAll();
				}
			};
		}}
	>
		{#if editingQuota}
			<input type="hidden" name="id" value={editingQuota.id} />
		{/if}

		<div class="space-y-4">
			<div>
				<Label for="quotaType">Tipo de cuota</Label>
				<Select
					id="quotaType"
					name="type"
					items={data.quotaTypes}
					value={editingQuota?.type || 'global'}
				/>
			</div>

			<div>
				<Label for="quotaTarget">ID del objetivo (vacío para global)</Label>
				<Input
					id="quotaTarget"
					name="targetId"
					placeholder="ID de usuario, curso o actividad"
					value={editingQuota?.targetId || ''}
				/>
			</div>

			<div>
				<Label for="quotaModel">Modelo específico (opcional)</Label>
				<Select
					id="quotaModel"
					name="modelId"
					items={modelOptions}
					value={editingQuota?.modelId || ''}
				/>
			</div>

			<div>
				<Label for="quotaPeriod">Período</Label>
				<Select
					id="quotaPeriod"
					name="period"
					items={data.quotaPeriods}
					value={editingQuota?.period || 'monthly'}
				/>
			</div>

			<div class="grid grid-cols-3 gap-4">
				<div>
					<Label for="quotaMaxTokens">Máx. tokens</Label>
					<Input
						id="quotaMaxTokens"
						name="maxTokens"
						type="number"
						placeholder="1000000"
						value={editingQuota?.maxTokens || ''}
					/>
				</div>

				<div>
					<Label for="quotaMaxRequests">Máx. peticiones</Label>
					<Input
						id="quotaMaxRequests"
						name="maxRequests"
						type="number"
						placeholder="1000"
						value={editingQuota?.maxRequests || ''}
					/>
				</div>

				<div>
					<Label for="quotaMaxCost">Máx. costo ($)</Label>
					<Input
						id="quotaMaxCost"
						name="maxCost"
						type="number"
						step="0.01"
						placeholder="100"
						value={editingQuota?.maxCost || ''}
					/>
				</div>
			</div>

			<p class="text-xs text-gray-500 dark:text-gray-400">
				Deja vacíos los campos que no quieras limitar.
			</p>
		</div>

		<div class="mt-6 flex justify-end gap-3">
			<Button color="alternative" onclick={closeModals}>Cancelar</Button>
			<Button type="submit" color="primary">
				{editingQuota ? 'Guardar' : 'Crear'}
			</Button>
		</div>
	</form>
</Modal>
