<script lang="ts">
	import { resolve } from '$app/paths';
	import { ArrowLeft, Radar, ShieldCheck, TimerReset } from 'lucide-svelte';
	import type { PageData } from './$types';

	let { data }: { data: PageData } = $props();

	function formatDate(value: string | Date | null | undefined): string {
		if (!value) return 'Sin fecha';
		return new Date(value).toLocaleString('es-ES', {
			day: '2-digit',
			month: '2-digit',
			year: 'numeric',
			hour: '2-digit',
			minute: '2-digit'
		});
	}
</script>

<div class="space-y-6">
	<section class="overflow-hidden rounded-[2rem] border border-slate-200 bg-[radial-gradient(circle_at_top_left,_rgba(14,165,233,0.14),_transparent_26%),radial-gradient(circle_at_top_right,_rgba(56,189,248,0.10),_transparent_18%),linear-gradient(180deg,_#ffffff_0%,_#f8fafc_100%)] p-6 dark:border-slate-800 dark:bg-[radial-gradient(circle_at_top_left,_rgba(14,165,233,0.16),_transparent_26%),radial-gradient(circle_at_top_right,_rgba(56,189,248,0.12),_transparent_18%),linear-gradient(180deg,_#020617_0%,_#0f172a_100%)]">
		<a href={resolve('/admin/activity-debugger')} class="inline-flex items-center gap-2 text-sm font-medium text-slate-600 hover:text-sky-700 dark:text-slate-300 dark:hover:text-sky-300">
			<ArrowLeft class="h-4 w-4" />
			Volver al depurador
		</a>
		<p class="mt-4 text-[11px] font-semibold uppercase tracking-[0.24em] text-sky-700 dark:text-sky-300">
			Forensic Capture Settings
		</p>
		<h1 class="mt-2 text-3xl font-black tracking-tight text-slate-900 dark:text-white">
			Captura exacta de rondas IA
		</h1>
		<p class="mt-3 max-w-3xl text-sm text-slate-600 dark:text-slate-300">
			Controla el switch global y los focos manuales para guardar payloads exactos de rondas futuras sin penalizar el sistema cuando esta capa está apagada.
		</p>
	</section>

	<section class="grid gap-6 xl:grid-cols-[0.95fr_1.05fr]">
		<form method="POST" action="?/saveConfig" class="space-y-5 rounded-[2rem] border border-slate-200 bg-white p-6 dark:border-slate-800 dark:bg-slate-950/60">
			<div class="flex items-center gap-3">
				<div class="rounded-2xl border border-sky-200 bg-sky-50 p-3 text-sky-700 dark:border-sky-900/60 dark:bg-sky-950/30 dark:text-sky-300">
					<ShieldCheck class="h-5 w-5" />
				</div>
				<div>
					<h2 class="text-lg font-bold text-slate-900 dark:text-white">Switch global</h2>
					<p class="text-sm text-slate-500 dark:text-slate-400">Apagado por defecto. Cuando está desactivado no se capturan rondas ni se consultan focos.</p>
				</div>
			</div>

			<label class="flex items-center justify-between rounded-[1.5rem] border border-slate-200 bg-slate-50 px-4 py-4 dark:border-slate-800 dark:bg-slate-900/70">
				<div>
					<p class="text-sm font-semibold text-slate-900 dark:text-white">Captura forense habilitada</p>
					<p class="mt-1 text-xs text-slate-500 dark:text-slate-400">Solo se aplica a focos manuales y siempre hacia adelante.</p>
				</div>
				<input type="checkbox" name="enabled" checked={data.config.enabled} class="h-5 w-5 rounded border-slate-300 text-sky-600 focus:ring-sky-500" />
			</label>

			<div class="grid gap-4 md:grid-cols-2">
				<div class="rounded-[1.5rem] border border-slate-200 bg-slate-50 px-4 py-4 dark:border-slate-800 dark:bg-slate-900/70">
					<p class="text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-500 dark:text-slate-400">Modo</p>
					<p class="mt-2 text-sm font-semibold text-slate-900 dark:text-white">{data.config.mode}</p>
					<p class="mt-1 text-xs text-slate-500 dark:text-slate-400">La v1 captura exclusivamente con foco manual.</p>
				</div>
				<label class="rounded-[1.5rem] border border-slate-200 bg-slate-50 px-4 py-4 text-sm dark:border-slate-800 dark:bg-slate-900/70">
					<span class="block text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-500 dark:text-slate-400">Retención</span>
					<div class="mt-2 flex items-center gap-3">
						<TimerReset class="h-4 w-4 text-slate-400" />
						<input type="number" min="1" name="retentionDays" value={data.config.retentionDays} class="w-full bg-transparent font-semibold text-slate-900 outline-hidden dark:text-white" />
						<span class="text-xs text-slate-500 dark:text-slate-400">días</span>
					</div>
				</label>
			</div>

			<div class="grid gap-4 md:grid-cols-2">
				<div class="rounded-[1.5rem] border border-slate-200 bg-slate-50 px-4 py-4 dark:border-slate-800 dark:bg-slate-900/70">
					<p class="text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-500 dark:text-slate-400">Payload</p>
					<p class="mt-2 text-sm font-semibold text-slate-900 dark:text-white">{data.config.payloadSource}</p>
					<p class="mt-1 text-xs text-slate-500 dark:text-slate-400">Snapshot exacto del request resuelto por la app hacia el SDK.</p>
				</div>
				<div class="rounded-[1.5rem] border border-slate-200 bg-slate-50 px-4 py-4 dark:border-slate-800 dark:bg-slate-900/70">
					<p class="text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-500 dark:text-slate-400">Persistencia</p>
					<p class="mt-2 text-sm font-semibold text-slate-900 dark:text-white">{data.config.payloadLevel}</p>
					<p class="mt-1 text-xs text-slate-500 dark:text-slate-400">JSON completo sin compresión en esta primera iteración.</p>
				</div>
			</div>

			<div class="flex justify-end">
				<button type="submit" class="rounded-2xl bg-slate-900 px-4 py-2 text-sm font-semibold text-white dark:bg-sky-500 dark:text-slate-950">
					Guardar configuración
				</button>
			</div>
		</form>

		<form method="POST" action="?/setFocus" class="space-y-5 rounded-[2rem] border border-slate-200 bg-white p-6 dark:border-slate-800 dark:bg-slate-950/60">
			<div class="flex items-center gap-3">
				<div class="rounded-2xl border border-amber-200 bg-amber-50 p-3 text-amber-700 dark:border-amber-900/60 dark:bg-amber-950/30 dark:text-amber-300">
					<Radar class="h-5 w-5" />
				</div>
				<div>
					<h2 class="text-lg font-bold text-slate-900 dark:text-white">Crear foco manual</h2>
					<p class="text-sm text-slate-500 dark:text-slate-400">Los focos solo afectan a llamadas futuras. `session` equivale a `chatId`.</p>
				</div>
			</div>

			<div class="grid gap-4 md:grid-cols-2">
				<label class="rounded-[1.5rem] border border-slate-200 bg-slate-50 px-4 py-4 text-sm dark:border-slate-800 dark:bg-slate-900/70">
					<span class="block text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-500 dark:text-slate-400">Target type</span>
					<select name="targetType" class="mt-2 w-full bg-transparent font-semibold text-slate-900 outline-hidden dark:text-white">
						<option value="activity">activity</option>
						<option value="session">session</option>
					</select>
				</label>
				<label class="rounded-[1.5rem] border border-slate-200 bg-slate-50 px-4 py-4 text-sm dark:border-slate-800 dark:bg-slate-900/70">
					<span class="block text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-500 dark:text-slate-400">Target ID</span>
					<input type="text" name="targetId" placeholder="interactiveLearningId o chatId" class="mt-2 w-full bg-transparent font-semibold text-slate-900 outline-hidden dark:text-white" />
				</label>
			</div>

			<div class="grid gap-4 md:grid-cols-[1fr_220px]">
				<label class="rounded-[1.5rem] border border-slate-200 bg-slate-50 px-4 py-4 text-sm dark:border-slate-800 dark:bg-slate-900/70">
					<span class="block text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-500 dark:text-slate-400">Motivo</span>
					<input type="text" name="reason" placeholder="Auditar cache, revisar RAG, etc." class="mt-2 w-full bg-transparent font-semibold text-slate-900 outline-hidden dark:text-white" />
				</label>
				<label class="rounded-[1.5rem] border border-slate-200 bg-slate-50 px-4 py-4 text-sm dark:border-slate-800 dark:bg-slate-900/70">
					<span class="block text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-500 dark:text-slate-400">Expira</span>
					<input type="datetime-local" name="expiresAt" class="mt-2 w-full bg-transparent font-semibold text-slate-900 outline-hidden dark:text-white" />
				</label>
			</div>

			<div class="flex justify-end">
				<button type="submit" class="rounded-2xl bg-slate-900 px-4 py-2 text-sm font-semibold text-white dark:bg-sky-500 dark:text-slate-950">
					Activar foco
				</button>
			</div>
		</form>
	</section>

	<section class="rounded-[2rem] border border-slate-200 bg-white p-6 dark:border-slate-800 dark:bg-slate-950/60">
		<div class="flex flex-wrap items-center justify-between gap-3">
			<div>
				<h2 class="text-lg font-bold text-slate-900 dark:text-white">Focos activos</h2>
				<p class="text-sm text-slate-500 dark:text-slate-400">Solo se muestran focos habilitados y no expirados.</p>
			</div>
			<p class="rounded-full border border-slate-200 px-3 py-1 text-xs font-semibold uppercase tracking-[0.14em] text-slate-600 dark:border-slate-700 dark:text-slate-300">
				{data.focuses.length} activos
			</p>
		</div>

		{#if data.focuses.length === 0}
			<div class="mt-5 rounded-[1.5rem] border border-dashed border-slate-300 bg-slate-50 px-5 py-10 text-center text-sm text-slate-500 dark:border-slate-700 dark:bg-slate-900/50 dark:text-slate-400">
				No hay focos activos ahora mismo.
			</div>
		{:else}
			<div class="mt-5 overflow-x-auto">
				<table class="min-w-full divide-y divide-slate-200 dark:divide-slate-800">
					<thead class="bg-slate-50/80 dark:bg-slate-900/80">
						<tr class="text-left text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500 dark:text-slate-400">
							<th class="px-4 py-3">Target</th>
							<th class="px-4 py-3">Motivo</th>
							<th class="px-4 py-3">Creado por</th>
							<th class="px-4 py-3">Expira</th>
							<th class="px-4 py-3"></th>
						</tr>
					</thead>
					<tbody class="divide-y divide-slate-200 dark:divide-slate-800">
						{#each data.focuses as focus (focus.id)}
							<tr class="align-top">
								<td class="px-4 py-4">
									<p class="font-semibold text-slate-900 dark:text-white">{focus.targetType}</p>
									<p class="mt-1 break-all text-xs text-slate-500 dark:text-slate-400">{focus.targetId}</p>
								</td>
								<td class="px-4 py-4 text-sm text-slate-700 dark:text-slate-300">{focus.reason || 'Sin motivo'}</td>
								<td class="px-4 py-4 text-sm text-slate-700 dark:text-slate-300">{focus.createdByName || focus.createdByEmail || focus.createdBy || 'Sistema'}</td>
								<td class="px-4 py-4 text-sm text-slate-700 dark:text-slate-300">{focus.expiresAt ? formatDate(focus.expiresAt) : 'Sin expiración'}</td>
								<td class="px-4 py-4 text-right">
									<form method="POST" action="?/disableFocus">
										<input type="hidden" name="targetType" value={focus.targetType} />
										<input type="hidden" name="targetId" value={focus.targetId} />
										<button type="submit" class="rounded-2xl border border-rose-200 px-3 py-2 text-sm font-medium text-rose-700 hover:bg-rose-50 dark:border-rose-900/60 dark:text-rose-300 dark:hover:bg-rose-950/30">
											Desactivar
										</button>
									</form>
								</td>
							</tr>
						{/each}
					</tbody>
				</table>
			</div>
		{/if}
	</section>
</div>
