<script lang="ts">
	import { Alert, Badge, Button, Modal, Spinner, Table, TableBody, TableBodyCell, TableBodyRow, TableHead, TableHeadCell } from 'flowbite-svelte';
	import { ShieldAlert, Play, Eye, CircleCheck, CircleX, Info } from 'lucide-svelte';

	// --- tipos ---
	type RiskLevel = 'low' | 'medium' | 'high';

	interface AffectedUser {
		id: string;
		username: string;
		email: string;
	}

	interface ScriptResult {
		assigned?: number;
		skipped?: number;
		errors?: number;
		deleted?: number;
		deactivated?: number;
	}

	interface ScriptState {
		loading: boolean;
		previewData: AffectedUser[] | null;
		result: ScriptResult | null;
		error: string | null;
	}

	// --- definición de scripts ---
	const scripts = [
		{
			id: 'fix-student-roles',
			title: 'Corregir roles de sistema para estudiantes de curso',
			description:
				'Comprueba los usuarios enrolados en algún curso como estudiantes y verifica que tengan asignado al menos el rol de sistema "Estudiante". Si no lo tienen, se les asigna automáticamente.',
			risk: 'low' as RiskLevel,
			endpoint: '/api/admin/maintenance/fix-student-roles',
			previewLabel: 'usuarios sin rol de sistema'
		}
	] as const;

	type ScriptId = (typeof scripts)[number]['id'];

	// --- estado por script ---
	let states = $state<Record<ScriptId, ScriptState>>({
		'fix-student-roles': { loading: false, previewData: null, result: null, error: null }
	});

	let confirmScript = $state<ScriptId | null>(null);
	let confirmModalOpen = $state(false);

	const riskBadge: Record<RiskLevel, { color: 'green' | 'yellow' | 'red'; label: string }> = {
		low: { color: 'green', label: 'Riesgo bajo' },
		medium: { color: 'yellow', label: 'Riesgo medio' },
		high: { color: 'red', label: 'Riesgo alto' }
	};

	async function runPreview(id: ScriptId, endpoint: string) {
		states[id].loading = true;
		states[id].previewData = null;
		states[id].result = null;
		states[id].error = null;
		try {
			const res = await fetch(endpoint, {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ mode: 'preview' })
			});
			const data = await res.json();
			if (!res.ok) throw new Error(data.error ?? 'Error desconocido');
			states[id].previewData = data.users ?? [];
		} catch (e: unknown) {
			states[id].error = e instanceof Error ? e.message : 'Error desconocido';
		} finally {
			states[id].loading = false;
		}
	}

	function openConfirm(id: ScriptId) {
		confirmScript = id;
		confirmModalOpen = true;
	}

	async function runExecute() {
		if (!confirmScript) return;
		const id = confirmScript;
		const script = scripts.find((s) => s.id === id)!;
		confirmModalOpen = false;
		confirmScript = null;

		states[id].loading = true;
		states[id].result = null;
		states[id].error = null;
		try {
			const res = await fetch(script.endpoint, {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ mode: 'execute' })
			});
			const data = await res.json();
			if (!res.ok) throw new Error(data.error ?? 'Error desconocido');
			states[id].result = data;
			states[id].previewData = null;
		} catch (e: unknown) {
			states[id].error = e instanceof Error ? e.message : 'Error desconocido';
		} finally {
			states[id].loading = false;
		}
	}
</script>

<div class="p-6">
	<div class="mb-6 flex items-center gap-3">
		<ShieldAlert class="h-7 w-7 text-yellow-500" />
		<div>
			<h1 class="text-2xl font-bold text-gray-900 dark:text-white">Mantenimiento del sistema</h1>
			<p class="text-sm text-gray-500 dark:text-gray-400">
				Scripts de mantenimiento reservados para Super Administradores.
			</p>
		</div>
	</div>

	<div class="flex flex-col gap-6">
		{#each scripts as script (script.id)}
			{@const state = states[script.id]}
			{@const badge = riskBadge[script.risk]}

			<div class="rounded-xl border border-gray-200 bg-white p-6 shadow-sm dark:border-gray-700 dark:bg-gray-800">
				<!-- cabecera -->
				<div class="mb-4 flex flex-wrap items-start justify-between gap-3">
					<div>
						<h2 class="text-lg font-semibold text-gray-900 dark:text-white">{script.title}</h2>
						<p class="mt-1 text-sm text-gray-500 dark:text-gray-400">{script.description}</p>
					</div>
					<Badge color={badge.color} class="shrink-0">{badge.label}</Badge>
				</div>

				<!-- acciones -->
				<div class="mb-4 flex flex-wrap gap-3">
					<Button
						color="alternative"
						size="sm"
						disabled={state.loading}
						onclick={() => runPreview(script.id, script.endpoint)}
					>
						{#if state.loading && !state.result}
							<Spinner size="4" class="mr-2" />
						{:else}
							<Eye class="mr-2 h-4 w-4" />
						{/if}
						Vista previa
					</Button>
					<Button
						color="yellow"
						size="sm"
						disabled={state.loading}
						onclick={() => openConfirm(script.id)}
					>
						{#if state.loading && !!state.result === false && !state.previewData}
							<Spinner size="4" class="mr-2" />
						{:else}
							<Play class="mr-2 h-4 w-4" />
						{/if}
						Ejecutar
					</Button>
				</div>

				<!-- error -->
				{#if state.error}
					<Alert color="red" class="mb-4">
						<CircleX class="mr-2 h-4 w-4 shrink-0" />
						<span>{state.error}</span>
					</Alert>
				{/if}

				<!-- resultado de ejecución -->
				{#if state.result}
					<Alert color="green" class="mb-4">
						<CircleCheck class="mr-2 h-4 w-4 shrink-0" />
						<span>
							Completado —
							{#if state.result.assigned !== undefined}
								<strong>{state.result.assigned}</strong> asignados,
							{/if}
							{#if state.result.skipped !== undefined}
								<strong>{state.result.skipped}</strong> omitidos,
							{/if}
							{#if state.result.errors !== undefined}
								<strong>{state.result.errors}</strong> errores.
							{/if}
							{#if state.result.deleted !== undefined}
								<strong>{state.result.deleted}</strong> eliminados.
							{/if}
							{#if state.result.deactivated !== undefined}
								<strong>{state.result.deactivated}</strong> desactivados.
							{/if}
						</span>
					</Alert>
				{/if}

				<!-- tabla de preview -->
				{#if state.previewData !== null}
					{#if state.previewData.length === 0}
						<Alert color="blue">
							<Info class="mr-2 h-4 w-4 shrink-0" />
							No se encontraron {script.previewLabel}. No hay nada que corregir.
						</Alert>
					{:else}
						<p class="mb-2 text-sm font-medium text-gray-700 dark:text-gray-300">
							{state.previewData.length}
							{script.previewLabel} encontrados:
						</p>
						<div class="max-h-72 overflow-y-auto rounded-lg border border-gray-200 dark:border-gray-700">
							<Table hoverable>
								<TableHead>
									<TableHeadCell>Usuario</TableHeadCell>
									<TableHeadCell>Email</TableHeadCell>
								</TableHead>
								<TableBody>
									{#each state.previewData as u (u.id)}
										<TableBodyRow>
											<TableBodyCell>{u.username}</TableBodyCell>
											<TableBodyCell>{u.email}</TableBodyCell>
										</TableBodyRow>
									{/each}
								</TableBody>
							</Table>
						</div>
					{/if}
				{/if}
			</div>
		{/each}
	</div>
</div>

<!-- Modal de confirmación -->
<Modal bind:open={confirmModalOpen} size="sm" autoclose>
	<div class="text-center">
		<ShieldAlert class="mx-auto mb-4 h-12 w-12 text-yellow-400" />
		<h3 class="mb-2 text-lg font-semibold text-gray-900 dark:text-white">¿Confirmar ejecución?</h3>
		<p class="mb-6 text-sm text-gray-500 dark:text-gray-400">
			Esta acción modificará datos en el sistema. Asegúrate de haber revisado la vista previa antes de continuar.
		</p>
		<div class="flex justify-center gap-4">
			<Button color="alternative" onclick={() => (confirmModalOpen = false)}>Cancelar</Button>
			<Button color="yellow" onclick={runExecute}>Sí, ejecutar</Button>
		</div>
	</div>
</Modal>
