<script lang="ts">
	import type { PageData } from './$types';
	import { resolve } from '$app/paths';
	import { ArrowLeft, Save, Wrench } from 'lucide-svelte';

	let { data }: { data: PageData } = $props();

	let llmModel = $state(data.config.llmModel ?? data.models[0] ?? '');
	let llmRole = $state(data.config.llmRole ?? '');
	let llmInstructions = $state(data.config.llmInstructions ?? '');
	let llmContext = $state(data.config.llmContext ?? '');
	let maxToolRoundtrips = $state(data.config.maxToolRoundtrips);
	let parallelToolCalls = $state(data.config.parallelToolCalls);
	let toolChoice = $state<'auto' | 'required' | 'none'>(data.config.toolChoice);
	let enabledToolIds = $state<string[]>([...data.config.enabledToolIds]);
	let isSavingConfig = $state(false);
	let pageMessage = $state('');
	let pageError = $state('');

	const groupedTools = $derived.by(() => {
		const groups = new Map<string, typeof data.availableTools>();
		for (const tool of data.availableTools) {
			const key = `${tool.usageDomain ?? 'general'}:${tool.category}`;
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

	const backHref = $derived(
		resolve(
			`/course/${data.courseId}/admin/interactives/${data.interactive.id}/agentic-insights${
				data.returnToRunId ? `?run=${data.returnToRunId}` : ''
			}`
		)
	);

	function toggleTool(toolId: string) {
		enabledToolIds = enabledToolIds.includes(toolId)
			? enabledToolIds.filter((id) => id !== toolId)
			: [...enabledToolIds, toolId];
	}

	async function saveConfig() {
		isSavingConfig = true;
		pageMessage = '';
		pageError = '';

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
					temperature: data.config.temperature ?? 0.2,
					maxToolRoundtrips,
					parallelToolCalls,
					toolChoice,
					enabledToolIds
				})
			});

			const payload = await res.json().catch(() => ({}));
			if (!res.ok) {
				throw new Error(payload?.error ?? `Error ${res.status}`);
			}

			pageMessage = 'Configuracion avanzada guardada.';
		} catch (error) {
			pageError = error instanceof Error ? error.message : 'No se pudo guardar la configuracion.';
		} finally {
			isSavingConfig = false;
		}
	}
</script>

<div class="space-y-6">
	<div class="rounded-[2rem] border border-slate-200 bg-white p-6 shadow-sm dark:border-slate-700 dark:bg-slate-900">
		<div class="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
			<div class="max-w-3xl">
				<a
					href={backHref}
					class="inline-flex items-center gap-2 text-sm font-medium text-slate-600 hover:text-slate-900 dark:text-slate-300 dark:hover:text-white"
				>
					<ArrowLeft class="h-4 w-4" />
					Volver al asistente
				</a>
				<div class="mt-4 inline-flex items-center gap-2 rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-xs font-medium text-slate-600 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300">
					<Wrench class="h-3.5 w-3.5" />
					Ajustes avanzados
				</div>
				<h1 class="mt-4 text-3xl font-semibold tracking-tight text-slate-900 dark:text-white">
					Configuracion experta del asistente
				</h1>
				<p class="mt-3 text-sm leading-6 text-slate-600 dark:text-slate-300">
					Esta pantalla concentra los parametros tecnicos para perfiles con mas soltura.
					El flujo principal para docentes sigue disponible fuera de aqui.
				</p>
			</div>

			<button
				class="inline-flex items-center justify-center gap-2 rounded-xl bg-slate-900 px-4 py-2.5 text-sm font-medium text-white transition hover:bg-slate-700 disabled:opacity-50 dark:bg-white dark:text-slate-900 dark:hover:bg-slate-200"
				onclick={saveConfig}
				disabled={isSavingConfig}
			>
				<Save class="h-4 w-4" />
				{isSavingConfig ? 'Guardando...' : 'Guardar cambios'}
			</button>
		</div>
	</div>

	{#if pageError}
		<div class="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700 dark:border-red-800 dark:bg-red-950/30 dark:text-red-300">
			{pageError}
		</div>
	{/if}

	{#if pageMessage}
		<div class="rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-700 dark:border-emerald-800 dark:bg-emerald-950/30 dark:text-emerald-300">
			{pageMessage}
		</div>
	{/if}

	<div class="grid gap-6 xl:grid-cols-[minmax(0,1fr)_360px]">
		<section class="space-y-6">
			<div class="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm dark:border-slate-700 dark:bg-slate-900">
				<h2 class="text-lg font-semibold text-slate-900 dark:text-white">Comportamiento del asistente</h2>
				<div class="mt-5 grid gap-5 md:grid-cols-2">
					<div>
						<label for="config-model" class="mb-1.5 block text-sm font-medium text-slate-700 dark:text-slate-300">
							Modelo
						</label>
						<select
							id="config-model"
							bind:value={llmModel}
							class="block w-full rounded-2xl border border-slate-300 bg-slate-50 px-3 py-2.5 text-sm text-slate-900 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-200 dark:border-slate-600 dark:bg-slate-800 dark:text-white dark:focus:ring-blue-900"
						>
							{#each data.models as model (model)}
								<option value={model}>{model}</option>
							{/each}
						</select>
					</div>

					<div>
						<label for="config-roundtrips" class="mb-1.5 block text-sm font-medium text-slate-700 dark:text-slate-300">
							Maximo de rondas con herramientas
						</label>
						<input
							id="config-roundtrips"
							bind:value={maxToolRoundtrips}
							type="number"
							min="1"
							max="20"
							step="1"
							class="block w-full rounded-2xl border border-slate-300 bg-slate-50 px-3 py-2.5 text-sm text-slate-900 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-200 dark:border-slate-600 dark:bg-slate-800 dark:text-white dark:focus:ring-blue-900"
						/>
					</div>

					<div class="md:col-span-2">
						<label for="config-role" class="mb-1.5 block text-sm font-medium text-slate-700 dark:text-slate-300">
							Rol base
						</label>
						<input
							id="config-role"
							bind:value={llmRole}
							type="text"
							class="block w-full rounded-2xl border border-slate-300 bg-slate-50 px-3 py-2.5 text-sm text-slate-900 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-200 dark:border-slate-600 dark:bg-slate-800 dark:text-white dark:focus:ring-blue-900"
						/>
					</div>

					<div class="md:col-span-2">
						<label for="config-instructions" class="mb-1.5 block text-sm font-medium text-slate-700 dark:text-slate-300">
							Instrucciones
						</label>
						<textarea
							id="config-instructions"
							bind:value={llmInstructions}
							rows={6}
							class="block w-full rounded-2xl border border-slate-300 bg-slate-50 px-3 py-2.5 text-sm text-slate-900 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-200 dark:border-slate-600 dark:bg-slate-800 dark:text-white dark:focus:ring-blue-900"
						></textarea>
					</div>

					<div class="md:col-span-2">
						<label for="config-context" class="mb-1.5 block text-sm font-medium text-slate-700 dark:text-slate-300">
							Contexto adicional
						</label>
						<textarea
							id="config-context"
							bind:value={llmContext}
							rows={5}
							class="block w-full rounded-2xl border border-slate-300 bg-slate-50 px-3 py-2.5 text-sm text-slate-900 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-200 dark:border-slate-600 dark:bg-slate-800 dark:text-white dark:focus:ring-blue-900"
						></textarea>
					</div>
				</div>
			</div>

			<div class="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm dark:border-slate-700 dark:bg-slate-900">
				<h2 class="text-lg font-semibold text-slate-900 dark:text-white">Uso de herramientas</h2>
				<div class="mt-5 grid gap-5 md:grid-cols-2">
					<div>
						<label for="tool-choice" class="mb-1.5 block text-sm font-medium text-slate-700 dark:text-slate-300">
							Politica de herramientas
						</label>
						<select
							id="tool-choice"
							bind:value={toolChoice}
							class="block w-full rounded-2xl border border-slate-300 bg-slate-50 px-3 py-2.5 text-sm text-slate-900 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-200 dark:border-slate-600 dark:bg-slate-800 dark:text-white dark:focus:ring-blue-900"
						>
							<option value="auto">Automatico</option>
							<option value="required">Siempre usar herramientas</option>
							<option value="none">No usar herramientas</option>
						</select>
					</div>

					<div class="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-4 dark:border-slate-700 dark:bg-slate-800/60">
						<p class="text-sm font-medium text-slate-900 dark:text-white">Llamadas paralelas</p>
						<label class="mt-3 flex cursor-pointer items-center gap-3 text-sm text-slate-600 dark:text-slate-300">
							<input
								type="checkbox"
								bind:checked={parallelToolCalls}
								class="h-4 w-4 rounded border-slate-300 text-blue-600 focus:ring-blue-500"
							/>
							Permitir varias herramientas a la vez
						</label>
					</div>
				</div>

				<div class="mt-5 max-h-[32rem] space-y-4 overflow-y-auto rounded-3xl border border-slate-200 p-4 dark:border-slate-700">
					{#each groupedTools as group (group.key)}
						<div>
							<div class="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
								{group.label}
							</div>
							<div class="space-y-2">
								{#each group.tools as tool (tool.id)}
									<label class="flex items-start gap-3 rounded-2xl bg-slate-50 px-4 py-3 text-sm dark:bg-slate-800/60">
										<input
											type="checkbox"
											checked={enabledToolIds.includes(tool.id)}
											onchange={() => toggleTool(tool.id)}
											class="mt-1 h-4 w-4 rounded border-slate-300 text-blue-600 focus:ring-blue-500"
										/>
										<span class="min-w-0">
											<span class="block font-medium text-slate-900 dark:text-white">{tool.displayName}</span>
											<span class="mt-1 block text-slate-500 dark:text-slate-400">{tool.description}</span>
											<span class="mt-2 block text-[11px] uppercase tracking-wide text-slate-400">
												{tool.riskLevel} {tool.requiresConfirmation ? '· confirmacion humana' : ''}
											</span>
										</span>
									</label>
								{/each}
							</div>
						</div>
					{/each}
				</div>
			</div>
		</section>

		<aside class="space-y-4">
			<div class="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-700 dark:bg-slate-900">
				<h2 class="text-lg font-semibold text-slate-900 dark:text-white">Notas de uso</h2>
				<ul class="mt-4 space-y-3 text-sm text-slate-600 dark:text-slate-300">
					<li>Use esta pantalla solo si necesita afinar el comportamiento tecnico del asistente.</li>
					<li>El flujo principal sigue ocultando esta complejidad para docentes no tecnicos.</li>
					<li>Las herramientas con confirmacion humana requieren revision antes de ejecutarse.</li>
				</ul>
			</div>

			<div class="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-700 dark:bg-slate-900">
				<h2 class="text-lg font-semibold text-slate-900 dark:text-white">Resumen actual</h2>
				<div class="mt-4 space-y-3 text-sm text-slate-600 dark:text-slate-300">
					<div class="rounded-2xl bg-slate-50 px-4 py-3 dark:bg-slate-800/60">
						<div class="text-xs uppercase tracking-wide text-slate-500 dark:text-slate-400">Modelo</div>
						<div class="mt-1 font-medium text-slate-900 dark:text-white">{llmModel}</div>
					</div>
					<div class="rounded-2xl bg-slate-50 px-4 py-3 dark:bg-slate-800/60">
						<div class="text-xs uppercase tracking-wide text-slate-500 dark:text-slate-400">Herramientas activas</div>
						<div class="mt-1 font-medium text-slate-900 dark:text-white">{enabledToolIds.length}</div>
					</div>
					<div class="rounded-2xl bg-slate-50 px-4 py-3 dark:bg-slate-800/60">
						<div class="text-xs uppercase tracking-wide text-slate-500 dark:text-slate-400">Politica</div>
						<div class="mt-1 font-medium text-slate-900 dark:text-white">
							{toolChoice === 'required' ? 'Siempre usar herramientas' : toolChoice === 'none' ? 'Sin herramientas' : 'Automatico'}
						</div>
					</div>
				</div>
			</div>
		</aside>
	</div>
</div>
