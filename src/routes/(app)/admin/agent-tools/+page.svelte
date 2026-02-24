<script lang="ts">
	import type { PageData } from './$types';
	import { breadcrumb } from '$lib/stores/breadcrumb';
	import {
		Table,
		TableHead,
		TableHeadCell,
		TableBody,
		TableBodyRow,
		TableBodyCell,
		Badge,
		Card,
		Alert,
		Button,
		Toggle
	} from 'flowbite-svelte';
	import {
		Wrench,
		Plus,
		Search,
		Shield,
		ShieldAlert,
		ShieldCheck,
		CheckCircle,
		XCircle,
		Edit,
		Trash2,
		Lock,
		Cpu,
		Globe,
		Code,
		Package
	} from 'lucide-svelte';

	let { data }: { data: PageData } = $props();

	// Local copy so we can mutate it without refetching
	let tools = $state(data.tools.slice());

	// Filters
	let searchQuery = $state('');
	let categoryFilter = $state('all');
	let executorFilter = $state('all');

	// Feedback
	let successMessage = $state('');
	let errorMessage = $state('');

	// Modal
	let isModalOpen = $state(false);
	let editingTool = $state<(typeof data.tools)[0] | null>(null);
	let isSaving = $state(false);

	// Form fields
	let formDisplayName = $state('');
	let formDescription = $state('');
	let formCategory = $state<string>('knowledge');
	let formExecutorType = $state<string>('builtin');
	let formRiskLevel = $state<string>('low');
	let formRequiresConfirmation = $state(false);
	let formIsActive = $state(true);
	let formVersion = $state('1.0.0');
	let formParametersSchema = $state('{\n  "type": "object",\n  "properties": {},\n  "required": []\n}');
	let formResponseSchema = $state('');
	let formExecutorConfig = $state('{}');

	$effect(() => {
		breadcrumb.set([
			{ label: 'Admin', href: '/admin' },
			{ label: 'Herramientas Agénticas', href: '/admin/agent-tools' }
		]);
	});

	// Derived stats
	let totalTools = $derived(tools.length);
	let activeTools = $derived(tools.filter((t) => t.isActive).length);
	let hitlTools = $derived(tools.filter((t) => t.requiresConfirmation).length);
	let systemTools = $derived(tools.filter((t) => t.isSystem).length);

	// Filtered list
	let filteredTools = $derived(
		tools.filter(
			(t) =>
				(searchQuery === '' ||
					t.displayName.toLowerCase().includes(searchQuery.toLowerCase()) ||
					t.name.toLowerCase().includes(searchQuery.toLowerCase())) &&
				(categoryFilter === 'all' || t.category === categoryFilter) &&
				(executorFilter === 'all' || t.executorType === executorFilter)
		)
	);

	// Helpers
	function categoryLabel(cat: string): string {
		const labels: Record<string, string> = {
			knowledge: 'Conocimiento',
			evaluation: 'Evaluación',
			communication: 'Comunicación',
			data: 'Datos',
			custom: 'Personalizado',
			ui: 'UI'
		};
		return labels[cat] ?? cat;
	}

	function categoryColor(cat: string): 'blue' | 'green' | 'yellow' | 'purple' | 'gray' | 'indigo' {
		const colors: Record<string, 'blue' | 'green' | 'yellow' | 'purple' | 'gray' | 'indigo'> = {
			knowledge: 'blue',
			evaluation: 'green',
			communication: 'yellow',
			data: 'purple',
			custom: 'indigo',
			ui: 'gray'
		};
		return colors[cat] ?? 'gray';
	}

	function riskColor(risk: string): 'green' | 'yellow' | 'red' {
		if (risk === 'low') return 'green';
		if (risk === 'medium') return 'yellow';
		return 'red';
	}

	function riskLabel(risk: string): string {
		if (risk === 'low') return 'Bajo';
		if (risk === 'medium') return 'Medio';
		return 'Alto';
	}

	function truncate(str: string, n: number): string {
		return str.length > n ? str.slice(0, n) + '…' : str;
	}

	function showSuccess(msg: string) {
		successMessage = msg;
		errorMessage = '';
		setTimeout(() => (successMessage = ''), 4000);
	}

	function showError(msg: string) {
		errorMessage = msg;
		successMessage = '';
		setTimeout(() => (errorMessage = ''), 6000);
	}

	// Modal open/close
	function openCreateModal() {
		editingTool = null;
		formDisplayName = '';
		formDescription = '';
		formCategory = 'knowledge';
		formExecutorType = 'builtin';
		formRiskLevel = 'low';
		formRequiresConfirmation = false;
		formIsActive = true;
		formVersion = '1.0.0';
		formParametersSchema = '{\n  "type": "object",\n  "properties": {},\n  "required": []\n}';
		formResponseSchema = '';
		formExecutorConfig = '{}';
		isModalOpen = true;
	}

	function openEditModal(tool: (typeof data.tools)[0]) {
		editingTool = tool;
		formDisplayName = tool.displayName;
		formDescription = tool.description;
		formCategory = tool.category;
		formExecutorType = tool.executorType;
		formRiskLevel = tool.riskLevel;
		formRequiresConfirmation = tool.requiresConfirmation;
		formIsActive = tool.isActive;
		formVersion = tool.version;
		formParametersSchema = tool.parametersSchema;
		formResponseSchema = tool.responseSchema ?? '';
		formExecutorConfig = tool.executorConfig;
		isModalOpen = true;
	}

	function closeModal() {
		isModalOpen = false;
		editingTool = null;
	}

	async function saveTool() {
		if (!formDisplayName.trim() || !formDescription.trim()) {
			showError('El nombre y la descripción son obligatorios.');
			return;
		}

		// Basic JSON validation
		for (const [label, val] of [
			['Esquema de parámetros', formParametersSchema],
			['Configuración del ejecutor', formExecutorConfig]
		] as [string, string][]) {
			try {
				JSON.parse(val);
			} catch {
				showError(`${label}: JSON inválido.`);
				return;
			}
		}
		if (formResponseSchema.trim()) {
			try {
				JSON.parse(formResponseSchema);
			} catch {
				showError('Esquema de respuesta: JSON inválido.');
				return;
			}
		}

		isSaving = true;
		try {
			const payload: Record<string, unknown> = {
				displayName: formDisplayName.trim(),
				description: formDescription.trim(),
				category: formCategory,
				executorType: formExecutorType,
				riskLevel: formRiskLevel,
				requiresConfirmation: formRequiresConfirmation,
				isActive: formIsActive,
				version: formVersion.trim() || '1.0.0',
				parametersSchema: formParametersSchema.trim(),
				responseSchema: formResponseSchema.trim() || null,
				executorConfig: formExecutorConfig.trim()
			};

			let res: Response;
			if (editingTool) {
				res = await fetch(`/api/admin/agent-tools/${editingTool.id}`, {
					method: 'PUT',
					headers: { 'Content-Type': 'application/json' },
					body: JSON.stringify(payload)
				});
			} else {
				res = await fetch('/api/admin/agent-tools', {
					method: 'POST',
					headers: { 'Content-Type': 'application/json' },
					body: JSON.stringify(payload)
				});
			}

			if (!res.ok) {
				const body = await res.json().catch(() => ({}));
				throw new Error(body?.error ?? `Error ${res.status}`);
			}

			showSuccess(editingTool ? 'Herramienta actualizada.' : 'Herramienta creada.');
			closeModal();
			window.location.reload();
		} catch (err) {
			showError(err instanceof Error ? err.message : 'Error desconocido.');
		} finally {
			isSaving = false;
		}
	}

	async function deleteTool(id: string, isSystem: boolean) {
		if (isSystem) return;
		if (!confirm('¿Eliminar esta herramienta? Esta acción no se puede deshacer.')) return;

		try {
			const res = await fetch(`/api/admin/agent-tools/${id}`, { method: 'DELETE' });
			if (!res.ok) {
				const body = await res.json().catch(() => ({}));
				throw new Error(body?.error ?? `Error ${res.status}`);
			}
			tools = tools.filter((t) => t.id !== id);
			showSuccess('Herramienta eliminada.');
		} catch (err) {
			showError(err instanceof Error ? err.message : 'Error al eliminar.');
		}
	}

	async function toggleActive(tool: (typeof data.tools)[0]) {
		const newValue = !tool.isActive;
		try {
			const res = await fetch(`/api/admin/agent-tools/${tool.id}`, {
				method: 'PUT',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ isActive: newValue })
			});
			if (!res.ok) {
				const body = await res.json().catch(() => ({}));
				throw new Error(body?.error ?? `Error ${res.status}`);
			}
			tools = tools.map((t) => (t.id === tool.id ? { ...t, isActive: newValue } : t));
		} catch (err) {
			showError(err instanceof Error ? err.message : 'Error al cambiar estado.');
		}
	}
</script>

<div class="space-y-6">
	<!-- Header -->
	<div class="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
		<div>
			<h1 class="text-2xl font-bold text-gray-900 dark:text-white">
				Catálogo de Herramientas Agénticas
			</h1>
			<p class="mt-1 text-sm text-gray-500 dark:text-gray-400">
				Gestiona las herramientas disponibles para los agentes de IA
			</p>
		</div>
		<Button color="primary" onclick={openCreateModal} class="flex items-center gap-2">
			<Plus size={18} />
			Nueva Herramienta
		</Button>
	</div>

	<!-- Feedback alerts -->
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

	<!-- Stats row -->
	<div class="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
		<Card class="p-4">
			<div class="flex items-center gap-3">
				<div class="rounded-lg bg-blue-100 p-3 dark:bg-blue-900">
					<Package class="h-6 w-6 text-blue-600 dark:text-blue-400" />
				</div>
				<div>
					<p class="text-sm text-gray-500 dark:text-gray-400">Total herramientas</p>
					<p class="text-2xl font-bold text-gray-900 dark:text-white">{totalTools}</p>
				</div>
			</div>
		</Card>

		<Card class="p-4">
			<div class="flex items-center gap-3">
				<div class="rounded-lg bg-green-100 p-3 dark:bg-green-900">
					<CheckCircle class="h-6 w-6 text-green-600 dark:text-green-400" />
				</div>
				<div>
					<p class="text-sm text-gray-500 dark:text-gray-400">Herramientas activas</p>
					<p class="text-2xl font-bold text-gray-900 dark:text-white">{activeTools}</p>
				</div>
			</div>
		</Card>

		<Card class="p-4">
			<div class="flex items-center gap-3">
				<div class="rounded-lg bg-yellow-100 p-3 dark:bg-yellow-900">
					<ShieldAlert class="h-6 w-6 text-yellow-600 dark:text-yellow-400" />
				</div>
				<div>
					<p class="text-sm text-gray-500 dark:text-gray-400">Requieren confirmación (HITL)</p>
					<p class="text-2xl font-bold text-gray-900 dark:text-white">{hitlTools}</p>
				</div>
			</div>
		</Card>

		<Card class="p-4">
			<div class="flex items-center gap-3">
				<div class="rounded-lg bg-purple-100 p-3 dark:bg-purple-900">
					<Lock class="h-6 w-6 text-purple-600 dark:text-purple-400" />
				</div>
				<div>
					<p class="text-sm text-gray-500 dark:text-gray-400">Herramientas del sistema</p>
					<p class="text-2xl font-bold text-gray-900 dark:text-white">{systemTools}</p>
				</div>
			</div>
		</Card>
	</div>

	<!-- Filters -->
	<div class="rounded-xl border border-gray-200 bg-white p-4 dark:border-gray-700 dark:bg-gray-800">
		<div class="flex flex-col gap-4 md:flex-row md:items-end">
			<!-- Search -->
			<div class="flex-1">
				<label
					for="search"
					class="mb-2 block text-sm font-medium text-gray-700 dark:text-gray-300"
				>
					Buscar
				</label>
				<div class="relative">
					<div class="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-3">
						<Search size={16} class="text-gray-400" />
					</div>
					<input
						id="search"
						type="text"
						bind:value={searchQuery}
						placeholder="Buscar por nombre o display name..."
						class="block w-full rounded-lg border border-gray-300 bg-gray-50 p-2.5 pl-10 text-sm text-gray-900 focus:border-primary-500 focus:ring-primary-500 dark:border-gray-600 dark:bg-gray-700 dark:text-white dark:placeholder-gray-400"
					/>
				</div>
			</div>

			<!-- Category filter -->
			<div class="w-full md:w-52">
				<label
					for="categoryFilter"
					class="mb-2 block text-sm font-medium text-gray-700 dark:text-gray-300"
				>
					Categoría
				</label>
				<select
					id="categoryFilter"
					bind:value={categoryFilter}
					class="block w-full rounded-lg border border-gray-300 bg-gray-50 p-2.5 text-sm text-gray-900 focus:border-primary-500 focus:ring-primary-500 dark:border-gray-600 dark:bg-gray-700 dark:text-white"
				>
					<option value="all">Todas las categorías</option>
					<option value="knowledge">Conocimiento</option>
					<option value="evaluation">Evaluación</option>
					<option value="communication">Comunicación</option>
					<option value="data">Datos</option>
					<option value="custom">Personalizado</option>
					<option value="ui">UI</option>
				</select>
			</div>

			<!-- Executor filter -->
			<div class="w-full md:w-44">
				<label
					for="executorFilter"
					class="mb-2 block text-sm font-medium text-gray-700 dark:text-gray-300"
				>
					Ejecutor
				</label>
				<select
					id="executorFilter"
					bind:value={executorFilter}
					class="block w-full rounded-lg border border-gray-300 bg-gray-50 p-2.5 text-sm text-gray-900 focus:border-primary-500 focus:ring-primary-500 dark:border-gray-600 dark:bg-gray-700 dark:text-white"
				>
					<option value="all">Todos</option>
					<option value="builtin">Builtin</option>
					<option value="http">HTTP</option>
					<option value="script">Script</option>
				</select>
			</div>
		</div>
	</div>

	<!-- Tools table -->
	<div class="rounded-xl border border-gray-200 bg-white dark:border-gray-700 dark:bg-gray-800">
		<div class="overflow-x-auto">
			<Table hoverable striped class="w-full">
				<TableHead class="bg-gray-50 dark:bg-gray-700">
					<TableHeadCell>Herramienta</TableHeadCell>
					<TableHeadCell>Categoría</TableHeadCell>
					<TableHeadCell>Ejecutor</TableHeadCell>
					<TableHeadCell>Riesgo</TableHeadCell>
					<TableHeadCell>Confirmación</TableHeadCell>
					<TableHeadCell>Estado</TableHeadCell>
					<TableHeadCell class="text-right">Acciones</TableHeadCell>
				</TableHead>
				<TableBody>
					{#each filteredTools as tool (tool.id)}
						<TableBodyRow class="transition-colors">
							<!-- Herramienta -->
							<TableBodyCell>
								<div class="flex items-center gap-2">
									{#if tool.isSystem}
										<Lock size={14} class="shrink-0 text-gray-400" aria-label="Herramienta del sistema" />
									{/if}
									<div>
										<p class="font-medium text-gray-900 dark:text-white">{tool.displayName}</p>
										<p class="font-mono text-xs text-gray-500 dark:text-gray-400">{tool.name}</p>
										<p class="mt-0.5 text-xs text-gray-400 dark:text-gray-500">
											{truncate(tool.description, 80)}
										</p>
									</div>
								</div>
							</TableBodyCell>

							<!-- Categoría -->
							<TableBodyCell>
								<Badge color={categoryColor(tool.category)}>
									{categoryLabel(tool.category)}
								</Badge>
							</TableBodyCell>

							<!-- Ejecutor -->
							<TableBodyCell>
								{#if tool.executorType === 'builtin'}
									<Badge color="blue" class="flex w-fit items-center gap-1">
										<Cpu size={12} />
										Builtin
									</Badge>
								{:else if tool.executorType === 'http'}
									<Badge color="purple" class="flex w-fit items-center gap-1">
										<Globe size={12} />
										HTTP
									</Badge>
								{:else}
									<Badge color="gray" class="flex w-fit items-center gap-1">
										<Code size={12} />
										Script
									</Badge>
								{/if}
							</TableBodyCell>

							<!-- Riesgo -->
							<TableBodyCell>
								{#if tool.riskLevel === 'low'}
									<Badge color="green" class="flex w-fit items-center gap-1">
										<ShieldCheck size={12} />
										{riskLabel(tool.riskLevel)}
									</Badge>
								{:else if tool.riskLevel === 'medium'}
									<Badge color="yellow" class="flex w-fit items-center gap-1">
										<Shield size={12} />
										{riskLabel(tool.riskLevel)}
									</Badge>
								{:else}
									<Badge color="red" class="flex w-fit items-center gap-1">
										<ShieldAlert size={12} />
										{riskLabel(tool.riskLevel)}
									</Badge>
								{/if}
							</TableBodyCell>

							<!-- Confirmación HITL -->
							<TableBodyCell>
								{#if tool.requiresConfirmation}
									<span
										class="flex items-center gap-1 text-sm font-medium text-amber-600 dark:text-amber-400"
										title="Requiere confirmación humana"
									>
										<Shield size={16} />
										HITL
									</span>
								{:else}
									<span class="text-sm text-gray-400">—</span>
								{/if}
							</TableBodyCell>

							<!-- Estado (toggle) -->
							<TableBodyCell>
								<Toggle
									checked={tool.isActive}
									onchange={() => toggleActive(tool)}
									size="small"
									title={tool.isActive ? 'Activa — click para desactivar' : 'Inactiva — click para activar'}
								/>
							</TableBodyCell>

							<!-- Acciones -->
							<TableBodyCell>
								<div class="flex justify-end gap-1">
									<Button
										size="xs"
										color="light"
										onclick={() => openEditModal(tool)}
										title="Editar"
									>
										<Edit size={14} />
									</Button>
									<Button
										size="xs"
										color="red"
										disabled={tool.isSystem}
										onclick={() => deleteTool(tool.id, tool.isSystem)}
										title={tool.isSystem ? 'Las herramientas del sistema no se pueden eliminar' : 'Eliminar'}
									>
										<Trash2 size={14} />
									</Button>
								</div>
							</TableBodyCell>
						</TableBodyRow>
					{:else}
						<TableBodyRow>
							<TableBodyCell colspan={7} class="py-10 text-center">
								<div class="flex flex-col items-center gap-2">
									<Wrench size={40} class="text-gray-300 dark:text-gray-600" />
									<p class="text-gray-500 dark:text-gray-400">No se encontraron herramientas</p>
									{#if searchQuery || categoryFilter !== 'all' || executorFilter !== 'all'}
										<Button
											color="alternative"
											size="xs"
											onclick={() => {
												searchQuery = '';
												categoryFilter = 'all';
												executorFilter = 'all';
											}}
										>
											Limpiar filtros
										</Button>
									{/if}
								</div>
							</TableBodyCell>
						</TableBodyRow>
					{/each}
				</TableBody>
			</Table>
		</div>
	</div>
</div>

<!-- Create / Edit Modal overlay -->
{#if isModalOpen}
	<!-- Backdrop -->
	<div
		class="fixed inset-0 z-40 bg-black/50"
		role="presentation"
		onclick={closeModal}
	></div>

	<!-- Panel -->
	<div
		class="fixed inset-y-0 right-0 z-50 flex w-full max-w-2xl flex-col bg-white shadow-2xl dark:bg-gray-900"
		role="dialog"
		aria-modal="true"
		aria-label={editingTool ? 'Editar herramienta' : 'Nueva herramienta'}
	>
		<!-- Modal header -->
		<div
			class="flex items-center justify-between border-b border-gray-200 px-6 py-4 dark:border-gray-700"
		>
			<h2 class="text-lg font-semibold text-gray-900 dark:text-white">
				{editingTool ? 'Editar herramienta' : 'Nueva herramienta'}
			</h2>
			<button
				type="button"
				onclick={closeModal}
				class="rounded-lg p-2 text-gray-400 hover:bg-gray-100 hover:text-gray-900 dark:hover:bg-gray-800 dark:hover:text-white"
				aria-label="Cerrar"
			>
				<XCircle size={20} />
			</button>
		</div>

		<!-- Modal body (scrollable) -->
		<div class="flex-1 overflow-y-auto px-6 py-5">
			<div class="space-y-5">
				<!-- Display Name -->
				<div>
					<label
						for="formDisplayName"
						class="mb-1.5 block text-sm font-medium text-gray-700 dark:text-gray-300"
					>
						Nombre visible <span class="text-red-500">*</span>
					</label>
					<input
						id="formDisplayName"
						type="text"
						bind:value={formDisplayName}
						placeholder="ej. Buscar contenido del curso"
						class="block w-full rounded-lg border border-gray-300 bg-gray-50 p-2.5 text-sm text-gray-900 focus:border-primary-500 focus:ring-primary-500 dark:border-gray-600 dark:bg-gray-700 dark:text-white dark:placeholder-gray-400"
					/>
				</div>

				<!-- Description -->
				<div>
					<label
						for="formDescription"
						class="mb-1.5 block text-sm font-medium text-gray-700 dark:text-gray-300"
					>
						Descripción (para el LLM) <span class="text-red-500">*</span>
					</label>
					<textarea
						id="formDescription"
						bind:value={formDescription}
						rows={3}
						placeholder="Describe cuándo y cómo el agente debe usar esta herramienta..."
						class="block w-full rounded-lg border border-gray-300 bg-gray-50 p-2.5 text-sm text-gray-900 focus:border-primary-500 focus:ring-primary-500 dark:border-gray-600 dark:bg-gray-700 dark:text-white dark:placeholder-gray-400"
					></textarea>
				</div>

				<!-- Category + Executor Type -->
				<div class="grid grid-cols-2 gap-4">
					<div>
						<label
							for="formCategory"
							class="mb-1.5 block text-sm font-medium text-gray-700 dark:text-gray-300"
						>
							Categoría
						</label>
						<select
							id="formCategory"
							bind:value={formCategory}
							class="block w-full rounded-lg border border-gray-300 bg-gray-50 p-2.5 text-sm text-gray-900 focus:border-primary-500 focus:ring-primary-500 dark:border-gray-600 dark:bg-gray-700 dark:text-white"
						>
							<option value="knowledge">Conocimiento</option>
							<option value="evaluation">Evaluación</option>
							<option value="communication">Comunicación</option>
							<option value="data">Datos</option>
							<option value="custom">Personalizado</option>
						</select>
					</div>

					<div>
						<label
							for="formExecutorType"
							class="mb-1.5 block text-sm font-medium text-gray-700 dark:text-gray-300"
						>
							Tipo de ejecutor
						</label>
						<select
							id="formExecutorType"
							bind:value={formExecutorType}
							class="block w-full rounded-lg border border-gray-300 bg-gray-50 p-2.5 text-sm text-gray-900 focus:border-primary-500 focus:ring-primary-500 dark:border-gray-600 dark:bg-gray-700 dark:text-white"
						>
							<option value="builtin">Builtin</option>
							<option value="http">HTTP</option>
							<option value="script">Script</option>
						</select>
					</div>
				</div>

				<!-- Risk Level + Version -->
				<div class="grid grid-cols-2 gap-4">
					<div>
						<label
							for="formRiskLevel"
							class="mb-1.5 block text-sm font-medium text-gray-700 dark:text-gray-300"
						>
							Nivel de riesgo
						</label>
						<select
							id="formRiskLevel"
							bind:value={formRiskLevel}
							class="block w-full rounded-lg border border-gray-300 bg-gray-50 p-2.5 text-sm text-gray-900 focus:border-primary-500 focus:ring-primary-500 dark:border-gray-600 dark:bg-gray-700 dark:text-white"
						>
							<option value="low">Bajo</option>
							<option value="medium">Medio</option>
							<option value="high">Alto</option>
						</select>
					</div>

					<div>
						<label
							for="formVersion"
							class="mb-1.5 block text-sm font-medium text-gray-700 dark:text-gray-300"
						>
							Versión
						</label>
						<input
							id="formVersion"
							type="text"
							bind:value={formVersion}
							placeholder="1.0.0"
							class="block w-full rounded-lg border border-gray-300 bg-gray-50 p-2.5 text-sm text-gray-900 focus:border-primary-500 focus:ring-primary-500 dark:border-gray-600 dark:bg-gray-700 dark:text-white dark:placeholder-gray-400"
						/>
					</div>
				</div>

				<!-- Toggles: requiresConfirmation + isActive -->
				<div class="flex flex-wrap gap-6">
					<label class="flex cursor-pointer items-center gap-3">
						<input
							type="checkbox"
							bind:checked={formRequiresConfirmation}
							class="h-4 w-4 rounded border-gray-300 text-primary-600 focus:ring-primary-500 dark:border-gray-600 dark:bg-gray-700"
						/>
						<span class="text-sm font-medium text-gray-700 dark:text-gray-300">
							Requiere confirmación humana (HITL)
						</span>
					</label>
					<label class="flex cursor-pointer items-center gap-3">
						<input
							type="checkbox"
							bind:checked={formIsActive}
							class="h-4 w-4 rounded border-gray-300 text-primary-600 focus:ring-primary-500 dark:border-gray-600 dark:bg-gray-700"
						/>
						<span class="text-sm font-medium text-gray-700 dark:text-gray-300">Activa</span>
					</label>
				</div>

				<!-- Parameters Schema -->
				<div>
					<label
						for="formParametersSchema"
						class="mb-1.5 block text-sm font-medium text-gray-700 dark:text-gray-300"
					>
						Esquema de parámetros (JSON Schema) <span class="text-red-500">*</span>
					</label>
					<textarea
						id="formParametersSchema"
						bind:value={formParametersSchema}
						rows={6}
						spellcheck={false}
						class="block w-full rounded-lg border border-gray-300 bg-gray-50 p-2.5 font-mono text-xs text-gray-900 focus:border-primary-500 focus:ring-primary-500 dark:border-gray-600 dark:bg-gray-700 dark:text-white"
					></textarea>
				</div>

				<!-- Response Schema (optional) -->
				<div>
					<label
						for="formResponseSchema"
						class="mb-1.5 block text-sm font-medium text-gray-700 dark:text-gray-300"
					>
						Esquema de respuesta (JSON Schema, opcional)
					</label>
					<textarea
						id="formResponseSchema"
						bind:value={formResponseSchema}
						rows={4}
						spellcheck={false}
						placeholder="Dejar vacío si no se define"
						class="block w-full rounded-lg border border-gray-300 bg-gray-50 p-2.5 font-mono text-xs text-gray-900 focus:border-primary-500 focus:ring-primary-500 dark:border-gray-600 dark:bg-gray-700 dark:text-white dark:placeholder-gray-400"
					></textarea>
				</div>

				<!-- Executor Config -->
				<div>
					<label
						for="formExecutorConfig"
						class="mb-1.5 block text-sm font-medium text-gray-700 dark:text-gray-300"
					>
						Configuración del ejecutor (JSON)
					</label>
					<textarea
						id="formExecutorConfig"
						bind:value={formExecutorConfig}
						rows={4}
						spellcheck={false}
						placeholder="&#123; &#125;"
						class="block w-full rounded-lg border border-gray-300 bg-gray-50 p-2.5 font-mono text-xs text-gray-900 focus:border-primary-500 focus:ring-primary-500 dark:border-gray-600 dark:bg-gray-700 dark:text-white dark:placeholder-gray-400"
					></textarea>
					<p class="mt-1 text-xs text-gray-500 dark:text-gray-400">
						Para <strong>builtin</strong>: <code class="rounded bg-gray-100 px-1 dark:bg-gray-800">{"{ \"handler\": \"searchCourseContent\" }"}</code> —
						Para <strong>http</strong>: <code class="rounded bg-gray-100 px-1 dark:bg-gray-800">{"{ \"url\": \"https://...\", \"method\": \"POST\" }"}</code>
					</p>
				</div>
			</div>
		</div>

		<!-- Modal footer -->
		<div
			class="flex items-center justify-end gap-3 border-t border-gray-200 px-6 py-4 dark:border-gray-700"
		>
			<Button color="alternative" onclick={closeModal} disabled={isSaving}>Cancelar</Button>
			<Button color="primary" onclick={saveTool} disabled={isSaving}>
				{#if isSaving}
					<span class="me-2 inline-block h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent"></span>
				{/if}
				{editingTool ? 'Guardar cambios' : 'Crear herramienta'}
			</Button>
		</div>
	</div>
{/if}
