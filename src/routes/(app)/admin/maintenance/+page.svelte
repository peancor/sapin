<script lang="ts">
	import { Alert, Badge, Button, Modal, Spinner, Table, TableBody, TableBodyCell, TableBodyRow, TableHead, TableHeadCell } from 'flowbite-svelte';
	import { ShieldAlert, Play, Eye, CircleCheck, CircleX, Info } from 'lucide-svelte';

	// --- tipos ---
	type RiskLevel = 'low' | 'medium' | 'high';

	interface AffectedUser {
		id?: string;
		username: string;
		email: string;
		roleName?: string;
	}

	interface OrphanFile {
		name: string;
		category: string;
		entityType: string;
		entityId: string;
		sizeKb: number;
		uploadedAt: Date | null;
	}

	interface PreviewData {
		// fix-student-roles
		users?: AffectedUser[];
		// deactivate-expired-roles
		assignments?: AffectedUser[];
		// orphan-file-detection
		files?: OrphanFile[];
		totalSizeKb?: number;
		// generic count previews
		count?: number;
		daysToRebuild?: number;
		pairsToRebuild?: number;
		totalBuiltin?: number;
		created?: number;
		updated?: number;
		skipped?: number;
		conflicts?: number;
		domains?: Record<string, number>;
		tools?: Array<{
			name: string;
			usageDomain: string;
			action: 'create' | 'update' | 'skip' | 'conflict';
		}>;
	}

	interface ScriptResult {
		assigned?: number;
		skipped?: number;
		errors?: number;
		deleted?: number;
		deactivated?: number;
		marked?: number;
		rebuilt?: number;
		created?: number;
		updated?: number;
		conflicts?: number;
		totalBuiltin?: number;
	}

	interface ScriptState {
		loading: boolean;
		previewData: PreviewData | null;
		result: ScriptResult | null;
		error: string | null;
	}

	// --- definición de scripts ---
	const scripts = [
		{
			id: 'sync-builtin-agent-tools',
			title: 'Sincronizar herramientas agénticas built-in',
			description:
				'Revisa el registro local de herramientas built-in y sincroniza su definición con la base de datos. Crea las que faltan, actualiza las del sistema desalineadas y detecta conflictos por nombre.',
			risk: 'low' as RiskLevel,
			endpoint: '/api/admin/maintenance/sync-builtin-agent-tools'
		},
		{
			id: 'fix-student-roles',
			title: 'Corregir roles de sistema para estudiantes de curso',
			description:
				'Comprueba los usuarios enrolados en algún curso como estudiantes y verifica que tengan asignado al menos el rol de sistema "Estudiante". Si no lo tienen, se les asigna automáticamente.',
			risk: 'low' as RiskLevel,
			endpoint: '/api/admin/maintenance/fix-student-roles'
		},
		{
			id: 'cleanup-expired-sessions',
			title: 'Eliminar sesiones de autenticación expiradas',
			description:
				'Elimina de la base de datos los registros de sesión cuya fecha de expiración ya ha pasado. Las sesiones activas no se ven afectadas.',
			risk: 'low' as RiskLevel,
			endpoint: '/api/admin/maintenance/cleanup-expired-sessions'
		},
		{
			id: 'deactivate-expired-roles',
			title: 'Desactivar asignaciones de rol expiradas',
			description:
				'Marca como inactivas las asignaciones de rol de sistema que tenían fecha de expiración y ya han superado ese plazo.',
			risk: 'low' as RiskLevel,
			endpoint: '/api/admin/maintenance/deactivate-expired-roles'
		},
		{
			id: 'orphan-file-detection',
			title: 'Gestionar archivos huérfanos',
			description:
				'Detecta archivos marcados como huérfanos en el sistema de ficheros. La vista previa muestra los archivos afectados y su tamaño total. La ejecución los desactiva y los marca para eliminación.',
			risk: 'medium' as RiskLevel,
			endpoint: '/api/admin/maintenance/orphan-file-detection'
		},
		{
			id: 'rebuild-ai-stats',
			title: 'Reconstruir estadísticas diarias de uso de IA',
			description:
				'Elimina y recalcula desde cero los resúmenes diarios de uso de IA (aiUsageDailyStats) a partir de los registros brutos de aiUsageLog.',
			risk: 'medium' as RiskLevel,
			endpoint: '/api/admin/maintenance/rebuild-ai-stats'
		},
		{
			id: 'rebuild-analytics-stats',
			title: 'Reconstruir estadísticas diarias de analítica',
			description:
				'Elimina y recalcula desde cero los resúmenes diarios de analítica (analyticsDailyStats) a partir de los eventos y sesiones brutas.',
			risk: 'medium' as RiskLevel,
			endpoint: '/api/admin/maintenance/rebuild-analytics-stats'
		},
		{
			id: 'rebuild-course-progress',
			title: 'Reconstruir resúmenes de progreso de curso',
			description:
				'Elimina y recalcula desde cero los resúmenes de progreso por usuario-curso (courseProgressSummary) a partir de los registros de learningActivityProgress.',
			risk: 'medium' as RiskLevel,
			endpoint: '/api/admin/maintenance/rebuild-course-progress'
		}
	] as const;

	type ScriptId = (typeof scripts)[number]['id'];

	// --- estado por script ---
	let states = $state<Record<ScriptId, ScriptState>>({
		'sync-builtin-agent-tools': { loading: false, previewData: null, result: null, error: null },
		'fix-student-roles': { loading: false, previewData: null, result: null, error: null },
		'cleanup-expired-sessions': { loading: false, previewData: null, result: null, error: null },
		'deactivate-expired-roles': { loading: false, previewData: null, result: null, error: null },
		'orphan-file-detection': { loading: false, previewData: null, result: null, error: null },
		'rebuild-ai-stats': { loading: false, previewData: null, result: null, error: null },
		'rebuild-analytics-stats': { loading: false, previewData: null, result: null, error: null },
		'rebuild-course-progress': { loading: false, previewData: null, result: null, error: null }
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
			states[id].previewData = data;
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

	function previewSummary(id: ScriptId): string | null {
		const d = states[id].previewData;
		if (!d) return null;
		if (id === 'sync-builtin-agent-tools') {
			return `${d.totalBuiltin ?? 0} built-in revisada(s): ${d.created ?? 0} a crear, ${d.updated ?? 0} a actualizar, ${d.conflicts ?? 0} conflicto(s), ${d.skipped ?? 0} sin cambios`;
		}
		if (id === 'fix-student-roles') return `${d.users?.length ?? 0} usuario(s) sin rol de sistema`;
		if (id === 'cleanup-expired-sessions') return `${d.count ?? 0} sesión(es) expirada(s)`;
		if (id === 'deactivate-expired-roles') return `${d.assignments?.length ?? 0} asignación(es) expirada(s)`;
		if (id === 'orphan-file-detection') return `${d.files?.length ?? 0} archivo(s) huérfano(s) — ${d.totalSizeKb ?? 0} KB`;
		if (id === 'rebuild-ai-stats') return `${d.daysToRebuild ?? 0} combinación(es) día-modelo a reconstruir`;
		if (id === 'rebuild-analytics-stats') return `${d.daysToRebuild ?? 0} día(s) a reconstruir`;
		if (id === 'rebuild-course-progress') return `${d.pairsToRebuild ?? 0} par(es) usuario-curso a reconstruir`;
		return null;
	}

	function resultSummary(id: ScriptId): string | null {
		const r = states[id].result;
		if (!r) return null;
		const parts: string[] = [];
		if (r.totalBuiltin !== undefined) parts.push(`${r.totalBuiltin} built-in revisada(s)`);
		if (r.assigned !== undefined) parts.push(`${r.assigned} asignado(s)`);
		if (r.skipped !== undefined) parts.push(`${r.skipped} omitido(s)`);
		if (r.errors !== undefined) parts.push(`${r.errors} error(es)`);
		if (r.deleted !== undefined) parts.push(`${r.deleted} eliminado(s)`);
		if (r.deactivated !== undefined) parts.push(`${r.deactivated} desactivado(s)`);
		if (r.marked !== undefined) parts.push(`${r.marked} marcado(s) para eliminación`);
		if (r.rebuilt !== undefined) parts.push(`${r.rebuilt} reconstruido(s)`);
		if (r.created !== undefined) parts.push(`${r.created} creada(s)`);
		if (r.updated !== undefined) parts.push(`${r.updated} actualizada(s)`);
		if (r.conflicts !== undefined) parts.push(`${r.conflicts} conflicto(s)`);
		return parts.join(', ');
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
						<span>Completado — {resultSummary(script.id)}</span>
					</Alert>
				{/if}

				<!-- resumen de preview -->
				{#if state.previewData !== null}
					{@const summary = previewSummary(script.id)}
					{@const pd = state.previewData}
					<Alert color="blue" class="mb-4">
						<Info class="mr-2 h-4 w-4 shrink-0" />
						<span>{summary ?? 'Vista previa completada.'}</span>
					</Alert>

					<!-- tabla detallada solo para scripts con listas de entidades -->
					{#if script.id === 'fix-student-roles' && pd.users && pd.users.length > 0}
						<div class="max-h-72 overflow-y-auto rounded-lg border border-gray-200 dark:border-gray-700">
							<Table hoverable>
								<TableHead>
									<TableHeadCell>Usuario</TableHeadCell>
									<TableHeadCell>Email</TableHeadCell>
								</TableHead>
								<TableBody>
									{#each pd.users as u (u.email)}
										<TableBodyRow>
											<TableBodyCell>{u.username}</TableBodyCell>
											<TableBodyCell>{u.email}</TableBodyCell>
										</TableBodyRow>
									{/each}
								</TableBody>
							</Table>
						</div>
					{/if}

					{#if script.id === 'deactivate-expired-roles' && pd.assignments && pd.assignments.length > 0}
						<div class="max-h-72 overflow-y-auto rounded-lg border border-gray-200 dark:border-gray-700">
							<Table hoverable>
								<TableHead>
									<TableHeadCell>Usuario</TableHeadCell>
									<TableHeadCell>Email</TableHeadCell>
									<TableHeadCell>Rol</TableHeadCell>
								</TableHead>
								<TableBody>
									{#each pd.assignments as a (a.email + (a.roleName ?? ''))}
										<TableBodyRow>
											<TableBodyCell>{a.username}</TableBodyCell>
											<TableBodyCell>{a.email}</TableBodyCell>
											<TableBodyCell>{a.roleName ?? '—'}</TableBodyCell>
										</TableBodyRow>
									{/each}
								</TableBody>
							</Table>
						</div>
					{/if}

					{#if script.id === 'orphan-file-detection' && pd.files && pd.files.length > 0}
						<div class="max-h-72 overflow-y-auto rounded-lg border border-gray-200 dark:border-gray-700">
							<Table hoverable>
								<TableHead>
									<TableHeadCell>Nombre</TableHeadCell>
									<TableHeadCell>Categoría</TableHeadCell>
									<TableHeadCell>Tamaño (KB)</TableHeadCell>
								</TableHead>
								<TableBody>
									{#each pd.files as f (f.entityId + f.name)}
										<TableBodyRow>
											<TableBodyCell class="max-w-xs truncate">{f.name}</TableBodyCell>
											<TableBodyCell>{f.category}</TableBodyCell>
											<TableBodyCell>{f.sizeKb}</TableBodyCell>
										</TableBodyRow>
									{/each}
								</TableBody>
							</Table>
						</div>
					{/if}

					{#if script.id === 'sync-builtin-agent-tools' && pd.domains}
						<div class="mb-4 grid gap-3 md:grid-cols-4">
							<div class="rounded-lg border border-green-200 bg-green-50 p-3 dark:border-green-800 dark:bg-green-950/30">
								<p class="text-xs font-medium uppercase tracking-wide text-green-700 dark:text-green-300">
									A crear
								</p>
								<p class="mt-1 text-2xl font-semibold text-green-800 dark:text-green-200">
									{pd.created ?? 0}
								</p>
							</div>
							<div class="rounded-lg border border-blue-200 bg-blue-50 p-3 dark:border-blue-800 dark:bg-blue-950/30">
								<p class="text-xs font-medium uppercase tracking-wide text-blue-700 dark:text-blue-300">
									A actualizar
								</p>
								<p class="mt-1 text-2xl font-semibold text-blue-800 dark:text-blue-200">
									{pd.updated ?? 0}
								</p>
							</div>
							<div class="rounded-lg border border-amber-200 bg-amber-50 p-3 dark:border-amber-800 dark:bg-amber-950/30">
								<p class="text-xs font-medium uppercase tracking-wide text-amber-700 dark:text-amber-300">
									Conflictos
								</p>
								<p class="mt-1 text-2xl font-semibold text-amber-800 dark:text-amber-200">
									{pd.conflicts ?? 0}
								</p>
							</div>
							<div class="rounded-lg border border-gray-200 bg-gray-50 p-3 dark:border-gray-700 dark:bg-gray-900/60">
								<p class="text-xs font-medium uppercase tracking-wide text-gray-700 dark:text-gray-300">
									Sin cambios
								</p>
								<p class="mt-1 text-2xl font-semibold text-gray-800 dark:text-gray-200">
									{pd.skipped ?? 0}
								</p>
							</div>
						</div>

						<div class="mb-4 rounded-lg border border-gray-200 dark:border-gray-700">
							<Table hoverable>
								<TableHead>
									<TableHeadCell>Dominio</TableHeadCell>
									<TableHeadCell>Built-in detectadas</TableHeadCell>
								</TableHead>
								<TableBody>
									{#each Object.entries(pd.domains) as [domain, total] (domain)}
										<TableBodyRow>
											<TableBodyCell>{domain}</TableBodyCell>
											<TableBodyCell>{total}</TableBodyCell>
										</TableBodyRow>
									{/each}
								</TableBody>
							</Table>
						</div>

						{#if pd.tools && pd.tools.length > 0}
							<div class="max-h-80 overflow-y-auto rounded-lg border border-gray-200 dark:border-gray-700">
								<Table hoverable>
									<TableHead>
										<TableHeadCell>Herramienta</TableHeadCell>
										<TableHeadCell>Dominio</TableHeadCell>
										<TableHeadCell>Acción prevista</TableHeadCell>
									</TableHead>
									<TableBody>
										{#each pd.tools as tool (tool.name)}
											<TableBodyRow>
												<TableBodyCell class="font-mono text-xs">{tool.name}</TableBodyCell>
												<TableBodyCell>{tool.usageDomain}</TableBodyCell>
												<TableBodyCell>
													{#if tool.action === 'create'}
														<Badge color="green">Crear</Badge>
													{:else if tool.action === 'update'}
														<Badge color="blue">Actualizar</Badge>
													{:else if tool.action === 'conflict'}
														<Badge color="yellow">Conflicto</Badge>
													{:else}
														<Badge color="gray">Sin cambios</Badge>
													{/if}
												</TableBodyCell>
											</TableBodyRow>
										{/each}
									</TableBody>
								</Table>
							</div>
						{/if}
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
