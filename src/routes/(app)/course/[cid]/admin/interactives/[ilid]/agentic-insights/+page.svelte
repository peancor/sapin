<script lang="ts">
	import type { PageData } from './$types';
	import { goto } from '$app/navigation';
	import AgentChatComponent from '$lib/components/agent/AgentChatComponent.svelte';

	let { data }: { data: PageData } = $props();

	let title = $state('');
	let scopeMode = $state<'cohort' | 'students' | 'sessions'>('cohort');
	let selectedStudentIds = $state<string[]>([]);
	let search = $state('');
	let dateFrom = $state('');
	let dateTo = $state('');
	let isCreatingRun = $state(false);
	let isSavingConfig = $state(false);
	let configMessage = $state('');
	let configError = $state('');

	let llmModel = $state('');
	let llmRole = $state('');
	let llmInstructions = $state('');
	let llmContext = $state('');
	let maxToolRoundtrips = $state(8);
	let temperature = $state(0.2);
	let enabledToolIds = $state<string[]>([]);

	$effect(() => {
		llmModel = data.config.llmModel ?? data.models[0] ?? '';
		llmRole = data.config.llmRole ?? '';
		llmInstructions = data.config.llmInstructions ?? '';
		llmContext = data.config.llmContext ?? '';
		maxToolRoundtrips = data.config.maxToolRoundtrips;
		temperature = data.config.temperature ?? 0.2;
		enabledToolIds = [...data.config.enabledToolIds];
	});

	const apiEndpoint = $derived(
		data.selectedRun
			? `/api/admin/insights-agent/${data.interactive.id}/runs/${data.selectedRun.id}/ask`
			: ''
	);

	const selectedRunEditable = $derived(
		data.selectedRun ? data.selectedRun.createdByUserId === data.viewerUserId : false
	);

	const groupedTools = $derived.by(() => {
		const groups = new Map<string, typeof data.availableTools>();
		for (const tool of data.availableTools) {
			const key = `${tool.usageDomain}:${tool.category}`;
			const bucket = groups.get(key) ?? [];
			bucket.push(tool);
			groups.set(key, bucket);
		}
		return Array.from(groups.entries()).map(([key, tools]) => ({
			key,
			label: `${tools[0]?.usageDomain ?? 'general'} / ${tools[0]?.category ?? 'otros'}`,
			tools
		}));
	});

	function toggleStudent(studentId: string) {
		selectedStudentIds = selectedStudentIds.includes(studentId)
			? selectedStudentIds.filter((id) => id !== studentId)
			: [...selectedStudentIds, studentId];
	}

	function toggleTool(toolId: string) {
		enabledToolIds = enabledToolIds.includes(toolId)
			? enabledToolIds.filter((id) => id !== toolId)
			: [...enabledToolIds, toolId];
	}

	async function createRun() {
		isCreatingRun = true;
		configError = '';

		try {
			const res = await fetch(`/api/admin/insights-agent/${data.interactive.id}/runs`, {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({
					courseId: data.courseId,
					title: title.trim() || null,
					scope: {
						mode: scopeMode,
						studentIds: scopeMode === 'students' ? selectedStudentIds : [],
						chatIds: [],
						dateFrom: dateFrom || null,
						dateTo: dateTo || null,
						search: search.trim() || null
					}
				})
			});

			const payload = await res.json().catch(() => ({}));
			if (!res.ok) {
				throw new Error(payload?.error ?? `Error ${res.status}`);
			}

			const nextUrl = new URL(window.location.href);
			nextUrl.searchParams.set('run', payload.run.id);
			await goto(`${nextUrl.pathname}${nextUrl.search}`, { invalidateAll: true });
		} catch (error) {
			configError =
				error instanceof Error ? error.message : 'No se pudo crear el run de analisis';
		} finally {
			isCreatingRun = false;
		}
	}

	async function saveConfig() {
		isSavingConfig = true;
		configMessage = '';
		configError = '';

		try {
			const res = await fetch(`/api/admin/insights-agent/${data.interactive.id}/config`, {
				method: 'PUT',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({
					courseId: data.courseId,
					llmModel,
					llmRole,
					llmInstructions,
					llmContext,
					temperature,
					maxToolRoundtrips,
					enabledToolIds
				})
			});

			const payload = await res.json().catch(() => ({}));
			if (!res.ok) {
				throw new Error(payload?.error ?? `Error ${res.status}`);
			}

			configMessage = 'Configuracion guardada.';
		} catch (error) {
			configError =
				error instanceof Error ? error.message : 'No se pudo guardar la configuracion';
		} finally {
			isSavingConfig = false;
		}
	}
</script>

<div class="space-y-6">
	<div class="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
		<div>
			<h1 class="text-2xl font-bold text-gray-900 dark:text-white">Insights agénticos</h1>
			<p class="mt-1 max-w-3xl text-sm text-gray-500 dark:text-gray-400">
				Workspace persistente para analizar evidencia de aprendizaje con un agente que puede
				llamar herramientas y dejar trazabilidad completa del proceso.
			</p>
		</div>
		<div class="grid grid-cols-2 gap-3 sm:grid-cols-4">
			<div class="rounded-2xl border border-gray-200 bg-white px-4 py-3 dark:border-gray-700 dark:bg-gray-800">
				<div class="text-xs uppercase tracking-wide text-gray-500 dark:text-gray-400">Sesiones</div>
				<div class="mt-1 text-xl font-semibold text-gray-900 dark:text-white">{data.overview.totalSessions}</div>
			</div>
			<div class="rounded-2xl border border-gray-200 bg-white px-4 py-3 dark:border-gray-700 dark:bg-gray-800">
				<div class="text-xs uppercase tracking-wide text-gray-500 dark:text-gray-400">Mensajes</div>
				<div class="mt-1 text-xl font-semibold text-gray-900 dark:text-white">{data.overview.totalMessages}</div>
			</div>
			<div class="rounded-2xl border border-gray-200 bg-white px-4 py-3 dark:border-gray-700 dark:bg-gray-800">
				<div class="text-xs uppercase tracking-wide text-gray-500 dark:text-gray-400">Participantes</div>
				<div class="mt-1 text-xl font-semibold text-gray-900 dark:text-white">{data.overview.studentsWithEvidenceCount}</div>
			</div>
			<div class="rounded-2xl border border-gray-200 bg-white px-4 py-3 dark:border-gray-700 dark:bg-gray-800">
				<div class="text-xs uppercase tracking-wide text-gray-500 dark:text-gray-400">Runs</div>
				<div class="mt-1 text-xl font-semibold text-gray-900 dark:text-white">{data.runs.length}</div>
			</div>
		</div>
	</div>

	{#if configError}
		<div class="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700 dark:border-red-800 dark:bg-red-950/40 dark:text-red-300">
			{configError}
		</div>
	{/if}
	{#if configMessage}
		<div class="rounded-2xl border border-green-200 bg-green-50 px-4 py-3 text-sm text-green-700 dark:border-green-800 dark:bg-green-950/40 dark:text-green-300">
			{configMessage}
		</div>
	{/if}

	<div class="grid gap-6 xl:grid-cols-[320px_minmax(0,1fr)_360px]">
		<section class="space-y-4">
			<div class="rounded-2xl border border-gray-200 bg-white p-4 dark:border-gray-700 dark:bg-gray-800">
				<h2 class="text-sm font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">
					Nuevo run
				</h2>
				<div class="mt-4 space-y-4">
					<div>
						<label for="run-title" class="mb-1 block text-sm font-medium text-gray-700 dark:text-gray-300">Titulo opcional</label>
						<input
							id="run-title"
							bind:value={title}
							type="text"
							placeholder="Analisis de cohortes semana 3"
							class="block w-full rounded-xl border border-gray-300 bg-gray-50 px-3 py-2 text-sm text-gray-900 dark:border-gray-600 dark:bg-gray-700 dark:text-white"
						/>
					</div>

					<div>
						<label for="run-scope" class="mb-1 block text-sm font-medium text-gray-700 dark:text-gray-300">Alcance</label>
						<select
							id="run-scope"
							bind:value={scopeMode}
							class="block w-full rounded-xl border border-gray-300 bg-gray-50 px-3 py-2 text-sm text-gray-900 dark:border-gray-600 dark:bg-gray-700 dark:text-white"
						>
							<option value="cohort">Cohorte completa</option>
							<option value="students">Estudiantes seleccionados</option>
							<option value="sessions">Sesiones filtradas</option>
						</select>
					</div>

					<div class="grid grid-cols-2 gap-3">
						<div>
							<label for="run-date-from" class="mb-1 block text-sm font-medium text-gray-700 dark:text-gray-300">Desde</label>
							<input
								id="run-date-from"
								bind:value={dateFrom}
								type="date"
								class="block w-full rounded-xl border border-gray-300 bg-gray-50 px-3 py-2 text-sm text-gray-900 dark:border-gray-600 dark:bg-gray-700 dark:text-white"
							/>
						</div>
						<div>
							<label for="run-date-to" class="mb-1 block text-sm font-medium text-gray-700 dark:text-gray-300">Hasta</label>
							<input
								id="run-date-to"
								bind:value={dateTo}
								type="date"
								class="block w-full rounded-xl border border-gray-300 bg-gray-50 px-3 py-2 text-sm text-gray-900 dark:border-gray-600 dark:bg-gray-700 dark:text-white"
							/>
						</div>
					</div>

					<div>
						<label for="run-search" class="mb-1 block text-sm font-medium text-gray-700 dark:text-gray-300">Filtro textual</label>
						<input
							id="run-search"
							bind:value={search}
							type="text"
							placeholder="p. ej. retroalimentacion, error, herramienta"
							class="block w-full rounded-xl border border-gray-300 bg-gray-50 px-3 py-2 text-sm text-gray-900 dark:border-gray-600 dark:bg-gray-700 dark:text-white"
						/>
					</div>

					{#if scopeMode === 'students'}
						<div>
							<div class="mb-2 text-sm font-medium text-gray-700 dark:text-gray-300">Estudiantes</div>
							<div class="max-h-56 space-y-2 overflow-y-auto rounded-xl border border-gray-200 p-3 dark:border-gray-700">
								{#each data.students as student (student.id)}
									<label class="flex items-start gap-3 text-sm text-gray-700 dark:text-gray-300">
										<input
											type="checkbox"
											checked={selectedStudentIds.includes(student.id)}
											onchange={() => toggleStudent(student.id)}
											class="mt-1 rounded border-gray-300 dark:border-gray-600"
										/>
										<span>
											<span class="block font-medium text-gray-900 dark:text-white">{student.username}</span>
											<span class="block text-xs text-gray-500 dark:text-gray-400">{student.email}</span>
										</span>
									</label>
								{/each}
							</div>
						</div>
					{/if}

					<button
						class="inline-flex w-full items-center justify-center rounded-xl bg-blue-600 px-4 py-2.5 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
						onclick={createRun}
						disabled={isCreatingRun || (scopeMode === 'students' && selectedStudentIds.length === 0)}
					>
						{isCreatingRun ? 'Creando...' : 'Crear run'}
					</button>
				</div>
			</div>

			<div class="rounded-2xl border border-gray-200 bg-white p-4 dark:border-gray-700 dark:bg-gray-800">
				<div class="flex items-center justify-between">
					<h2 class="text-sm font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">
						Runs recientes
					</h2>
					<span class="text-xs text-gray-400">{data.runs.length}</span>
				</div>
				<div class="mt-4 space-y-2">
					{#if data.runs.length === 0}
						<p class="text-sm text-gray-500 dark:text-gray-400">
							Aun no hay runs. Crea el primero para empezar el analisis iterativo.
						</p>
					{:else}
						{#each data.runs as run (run.id)}
							<a
								href={`?run=${run.id}`}
								class={`block rounded-xl border px-3 py-3 transition ${
									data.selectedRun?.id === run.id
										? 'border-blue-500 bg-blue-50 dark:border-blue-400 dark:bg-blue-950/30'
										: 'border-gray-200 bg-gray-50 hover:border-gray-300 dark:border-gray-700 dark:bg-gray-900/40 dark:hover:border-gray-600'
								}`}
							>
								<div class="flex items-start justify-between gap-3">
									<div class="min-w-0">
										<div class="truncate text-sm font-medium text-gray-900 dark:text-white">
											{run.title || 'Run sin titulo'}
										</div>
										<div class="mt-1 text-xs text-gray-500 dark:text-gray-400">
											{run.scope.mode} · {run.status}
										</div>
									</div>
									<div class="text-[11px] text-gray-400">{new Date(run.updatedAt).toLocaleDateString('es-ES')}</div>
								</div>
								{#if run.summary}
									<p class="mt-2 line-clamp-2 text-xs text-gray-600 dark:text-gray-300">{run.summary}</p>
								{/if}
							</a>
						{/each}
					{/if}
				</div>
			</div>
		</section>

		<section class="min-h-[70vh] overflow-hidden rounded-3xl border border-gray-200 bg-white dark:border-gray-700 dark:bg-gray-800">
			{#if data.selectedRun}
				<div class="border-b border-gray-200 px-5 py-4 dark:border-gray-700">
					<div class="flex flex-col gap-2 md:flex-row md:items-start md:justify-between">
						<div>
							<h2 class="text-lg font-semibold text-gray-900 dark:text-white">
								{data.selectedRun.title || 'Run de insights'}
							</h2>
							<p class="mt-1 text-sm text-gray-500 dark:text-gray-400">
								Estado: {data.selectedRun.status} · alcance: {data.selectedRun.scope.mode}
							</p>
						</div>
						<div class="text-right text-xs text-gray-400">
							<div>Creado: {new Date(data.selectedRun.createdAt).toLocaleString('es-ES')}</div>
							{#if data.selectedRun.lastMessageAt}
								<div>Ultima actividad: {new Date(data.selectedRun.lastMessageAt).toLocaleString('es-ES')}</div>
							{/if}
						</div>
					</div>
					{#if !selectedRunEditable}
						<div class="mt-3 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-700 dark:border-amber-800 dark:bg-amber-950/30 dark:text-amber-300">
							Este run fue creado por otro administrador. Puedes revisarlo, pero no continuarlo.
						</div>
					{/if}
				</div>

				{#if selectedRunEditable}
					<div class="h-[calc(70vh-92px)]">
						{#key data.selectedRun.id}
							<AgentChatComponent initialMessages={data.selectedRun.messages} apiEndpoint={apiEndpoint} />
						{/key}
					</div>
				{:else}
					<div class="h-[calc(70vh-92px)] overflow-y-auto p-5">
						<div class="space-y-4">
							{#each data.selectedRun.messages as message (message.id)}
								<div class={`flex ${message.role === 'user' ? 'justify-end' : 'justify-start'}`}>
									<div class={`max-w-[85%] rounded-2xl px-4 py-3 text-sm ${
										message.role === 'user'
											? 'bg-blue-600 text-white'
											: 'border border-gray-200 bg-gray-50 text-gray-900 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-100'
									}`}>
										{#each message.parts as part}
											{#if part.kind === 'text'}
												<div>{part.content}</div>
											{:else if part.kind === 'tool-call'}
												<div class="mt-2 rounded-xl border border-gray-200 px-3 py-2 text-xs dark:border-gray-700">
													<div class="font-medium">{part.toolDisplayName}</div>
													<div class="mt-1 opacity-75">Estado: {part.status}</div>
												</div>
											{/if}
										{/each}
									</div>
								</div>
							{/each}
						</div>
					</div>
				{/if}
			{:else}
				<div class="flex h-full min-h-[70vh] items-center justify-center px-6 text-center">
					<div>
						<h2 class="text-lg font-semibold text-gray-900 dark:text-white">Sin run seleccionado</h2>
						<p class="mt-2 max-w-md text-sm text-gray-500 dark:text-gray-400">
							Crea un run en la columna izquierda para abrir un workspace persistente de analisis.
						</p>
					</div>
				</div>
			{/if}
		</section>

		<section class="space-y-4">
			<div class="rounded-2xl border border-gray-200 bg-white p-4 dark:border-gray-700 dark:bg-gray-800">
				<h2 class="text-sm font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">
					Contexto base
				</h2>
				<div class="mt-4 space-y-3 text-sm text-gray-600 dark:text-gray-300">
					<div>
						<div class="font-medium text-gray-900 dark:text-white">{data.activityContext.name}</div>
						{#if data.activityContext.description}
							<p class="mt-1 text-sm text-gray-500 dark:text-gray-400">{data.activityContext.description}</p>
						{/if}
					</div>
					<div class="grid grid-cols-2 gap-3 text-xs">
						<div class="rounded-xl bg-gray-50 px-3 py-2 dark:bg-gray-900/50">
							<div class="text-gray-400">Engagement medio</div>
							<div class="mt-1 text-base font-semibold text-gray-900 dark:text-white">{Math.round(data.metrics.engagement.overallScore)}%</div>
						</div>
						<div class="rounded-xl bg-gray-50 px-3 py-2 dark:bg-gray-900/50">
							<div class="text-gray-400">En riesgo</div>
							<div class="mt-1 text-base font-semibold text-gray-900 dark:text-white">{data.metrics.earlyWarning.totalAtRisk}</div>
						</div>
					</div>
				</div>
			</div>

			<div class="rounded-2xl border border-gray-200 bg-white p-4 dark:border-gray-700 dark:bg-gray-800">
				<div class="flex items-center justify-between">
					<h2 class="text-sm font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">
						Config del agente
					</h2>
					<button
						class="rounded-xl bg-gray-900 px-3 py-2 text-xs font-medium text-white hover:bg-gray-700 dark:bg-white dark:text-gray-900"
						onclick={saveConfig}
						disabled={isSavingConfig}
					>
						{isSavingConfig ? 'Guardando...' : 'Guardar'}
					</button>
				</div>

				<div class="mt-4 space-y-4">
					<div>
						<label for="config-model" class="mb-1 block text-sm font-medium text-gray-700 dark:text-gray-300">Modelo</label>
						<select
							id="config-model"
							bind:value={llmModel}
							class="block w-full rounded-xl border border-gray-300 bg-gray-50 px-3 py-2 text-sm text-gray-900 dark:border-gray-600 dark:bg-gray-700 dark:text-white"
						>
							{#each data.models as model (model)}
								<option value={model}>{model}</option>
							{/each}
						</select>
					</div>

					<div>
						<label for="config-role" class="mb-1 block text-sm font-medium text-gray-700 dark:text-gray-300">Rol</label>
						<input
							id="config-role"
							bind:value={llmRole}
							type="text"
							class="block w-full rounded-xl border border-gray-300 bg-gray-50 px-3 py-2 text-sm text-gray-900 dark:border-gray-600 dark:bg-gray-700 dark:text-white"
						/>
					</div>

					<div>
						<label for="config-instructions" class="mb-1 block text-sm font-medium text-gray-700 dark:text-gray-300">Instrucciones</label>
						<textarea
							id="config-instructions"
							bind:value={llmInstructions}
							rows={5}
							class="block w-full rounded-xl border border-gray-300 bg-gray-50 px-3 py-2 text-sm text-gray-900 dark:border-gray-600 dark:bg-gray-700 dark:text-white"
						></textarea>
					</div>

					<div>
						<label for="config-context" class="mb-1 block text-sm font-medium text-gray-700 dark:text-gray-300">Contexto adicional</label>
						<textarea
							id="config-context"
							bind:value={llmContext}
							rows={4}
							class="block w-full rounded-xl border border-gray-300 bg-gray-50 px-3 py-2 text-sm text-gray-900 dark:border-gray-600 dark:bg-gray-700 dark:text-white"
						></textarea>
					</div>

					<div class="grid grid-cols-2 gap-3">
						<div>
							<label for="config-temperature" class="mb-1 block text-sm font-medium text-gray-700 dark:text-gray-300">Temperatura</label>
							<input
								id="config-temperature"
								bind:value={temperature}
								type="number"
								min="0"
								max="1"
								step="0.1"
								class="block w-full rounded-xl border border-gray-300 bg-gray-50 px-3 py-2 text-sm text-gray-900 dark:border-gray-600 dark:bg-gray-700 dark:text-white"
							/>
						</div>
						<div>
							<label for="config-roundtrips" class="mb-1 block text-sm font-medium text-gray-700 dark:text-gray-300">Max rondas</label>
							<input
								id="config-roundtrips"
								bind:value={maxToolRoundtrips}
								type="number"
								min="1"
								max="20"
								step="1"
								class="block w-full rounded-xl border border-gray-300 bg-gray-50 px-3 py-2 text-sm text-gray-900 dark:border-gray-600 dark:bg-gray-700 dark:text-white"
							/>
						</div>
					</div>

					<div>
						<div class="mb-2 text-sm font-medium text-gray-700 dark:text-gray-300">Herramientas habilitadas</div>
						<div class="max-h-[24rem] space-y-4 overflow-y-auto rounded-2xl border border-gray-200 p-3 dark:border-gray-700">
							{#each groupedTools as group (group.key)}
								<div>
									<div class="mb-2 text-xs font-semibold uppercase tracking-wide text-gray-400">{group.label}</div>
									<div class="space-y-2">
										{#each group.tools as tool (tool.id)}
											<label class="flex items-start gap-3 rounded-xl bg-gray-50 px-3 py-2 text-sm dark:bg-gray-900/50">
												<input
													type="checkbox"
													checked={enabledToolIds.includes(tool.id)}
													onchange={() => toggleTool(tool.id)}
													class="mt-1 rounded border-gray-300 dark:border-gray-600"
												/>
												<span class="min-w-0">
													<span class="block font-medium text-gray-900 dark:text-white">{tool.displayName}</span>
													<span class="block text-xs text-gray-500 dark:text-gray-400">{tool.description}</span>
													<span class="mt-1 block text-[11px] uppercase tracking-wide text-gray-400">
														{tool.riskLevel} {tool.requiresConfirmation ? '· HITL' : ''}
													</span>
												</span>
											</label>
										{/each}
									</div>
								</div>
							{/each}
						</div>
					</div>
				</div>
			</div>
		</section>
	</div>
</div>
