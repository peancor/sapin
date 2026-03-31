<script lang="ts">
	import { page } from '$app/state';
	import { resolve } from '$app/paths';
	import { AlertTriangle, ArrowLeft, ArrowRight, Bot, Brain, CalendarClock, Cpu, Database, Fingerprint, MessageSquareText, Radar, Settings2, Sparkles, Wrench } from 'lucide-svelte';
	import RawSections from '$lib/components/activity-debugger/RawSections.svelte';
	import type { PageData } from './$types';

	let { data }: { data: PageData } = $props();

	const tabs = [
		{ id: 'sessions', label: 'Sesiones' },
		{ id: 'config', label: 'Configuracion' },
		{ id: 'capture', label: 'Captura exacta' },
		{ id: 'usage', label: 'Uso IA' },
		{ id: 'raw', label: 'Raw' }
	] as const;
	let activityBaseHref = $derived(resolve(`/admin/activity-debugger/activities/${data.detail.activityId}`));

	function formatDate(value: string | null): string {
		if (!value) return 'Sin actividad';
		return new Date(value).toLocaleString('es-ES', {
			day: '2-digit',
			month: '2-digit',
			year: 'numeric',
			hour: '2-digit',
			minute: '2-digit'
		});
	}

	function formatCurrency(value: number): string {
		return new Intl.NumberFormat('es-ES', {
			style: 'currency',
			currency: 'USD',
			maximumFractionDigits: value < 1 ? 4 : 2
		}).format(value);
	}

	function formatNumber(value: number | null | undefined): string {
		return (value ?? 0).toLocaleString('es-ES');
	}

	function tabHref(tabId: string): string {
		const params = new URLSearchParams(page.url.search);
		params.set('tab', tabId);
		const query = params.toString();
		return query ? `${activityBaseHref}?${query}` : activityBaseHref;
	}

	function clearSessionsHref(): string {
		return `${activityBaseHref}?tab=sessions`;
	}

	function sessionLink(chatId: string): string {
		const params = new URLSearchParams();
		params.set('tab', 'timeline');
		return `${resolve(`/admin/activity-debugger/activities/${data.detail.activityId}/sessions/${chatId}`)}?${params.toString()}`;
	}

	function statusClasses(status: string): string {
		switch (status) {
			case 'attention':
				return 'border-rose-200 bg-rose-50 text-rose-700 dark:border-rose-900/60 dark:bg-rose-950/30 dark:text-rose-300';
			case 'pending':
				return 'border-amber-200 bg-amber-50 text-amber-700 dark:border-amber-900/60 dark:bg-amber-950/30 dark:text-amber-300';
			default:
				return 'border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-900/60 dark:bg-emerald-950/30 dark:text-emerald-300';
		}
	}

	function promptCardClasses(origin: string): string {
		switch (origin) {
			case 'stored':
				return 'border-sky-200 bg-sky-50/80 dark:border-sky-900/60 dark:bg-sky-950/30';
			case 'derived_current':
				return 'border-amber-200 bg-amber-50/80 dark:border-amber-900/60 dark:bg-amber-950/30';
			default:
				return 'border-slate-200 bg-slate-50/80 dark:border-slate-800 dark:bg-slate-900/60';
		}
	}

	function focusBadgeClasses(active: boolean): string {
		return active
			? 'border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-900/60 dark:bg-emerald-950/30 dark:text-emerald-300'
			: 'border-slate-200 bg-white/70 text-slate-600 dark:border-slate-700 dark:bg-slate-950/60 dark:text-slate-300';
	}

	function roundStatusClasses(status: string): string {
		switch (status) {
			case 'error':
				return 'border-rose-200 bg-rose-50 text-rose-700 dark:border-rose-900/60 dark:bg-rose-950/25 dark:text-rose-300';
			case 'pending':
				return 'border-amber-200 bg-amber-50 text-amber-700 dark:border-amber-900/60 dark:bg-amber-950/25 dark:text-amber-300';
			default:
				return 'border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-900/60 dark:bg-emerald-950/25 dark:text-emerald-300';
		}
	}

	function getUsageLogs() {
		const usageSection = data.detail.rawSections.find((section) => section.id === 'usage');
		return Array.isArray(usageSection?.data) ? usageSection.data : [];
	}
</script>

<div class="space-y-6">
	<section class="overflow-hidden rounded-[2rem] border border-slate-200 bg-[radial-gradient(circle_at_top_left,_rgba(14,165,233,0.14),_transparent_25%),radial-gradient(circle_at_top_right,_rgba(16,185,129,0.12),_transparent_18%),linear-gradient(180deg,_#ffffff_0%,_#f8fafc_100%)] p-6 dark:border-slate-800 dark:bg-[radial-gradient(circle_at_top_left,_rgba(14,165,233,0.18),_transparent_25%),radial-gradient(circle_at_top_right,_rgba(16,185,129,0.12),_transparent_18%),linear-gradient(180deg,_#020617_0%,_#0f172a_100%)]">
		<div class="flex flex-col gap-5 xl:flex-row xl:items-start xl:justify-between">
			<div class="max-w-4xl">
				<a href={resolve('/admin/activity-debugger')} class="inline-flex items-center gap-2 text-sm font-medium text-slate-600 hover:text-sky-700 dark:text-slate-300 dark:hover:text-sky-300">
					<ArrowLeft class="h-4 w-4" />
					Volver al explorador
				</a>
				<p class="mt-4 text-[11px] font-semibold uppercase tracking-[0.24em] text-sky-700 dark:text-sky-300">
					Activity Debugger
				</p>
				<h1 class="mt-2 text-2xl font-black tracking-tight text-slate-900 dark:text-white sm:text-3xl">
					{data.detail.activityName}
				</h1>
				<p class="mt-2 text-sm text-slate-600 dark:text-slate-300">
					{data.detail.description || 'Actividad sin descripción funcional. Vista técnica orientada a depuración y diagnóstico.'}
				</p>
				<div class="mt-4 flex flex-wrap items-center gap-2 text-xs">
					<span class="rounded-full border border-slate-200 px-2.5 py-1 font-semibold uppercase tracking-[0.14em] text-slate-700 dark:border-slate-700 dark:text-slate-200">{data.detail.activityType}</span>
					<span class="rounded-full border border-slate-200 px-2.5 py-1 text-slate-600 dark:border-slate-700 dark:text-slate-300">ID {data.detail.activityId}</span>
					{#if data.detail.courseId}
						<a href={resolve(`/admin/activity-debugger/courses/${data.detail.courseId}`)} class="rounded-full border border-sky-200 px-2.5 py-1 text-sky-700 transition-colors hover:bg-sky-50 dark:border-sky-900/60 dark:text-sky-300 dark:hover:bg-sky-950/30">
							{data.detail.courseName}
						</a>
					{:else}
						<span class="rounded-full border border-fuchsia-200 px-2.5 py-1 text-fuchsia-700 dark:border-fuchsia-900/60 dark:text-fuchsia-300">Sistema / Sin curso</span>
					{/if}
				</div>
				<div class="mt-4 flex flex-wrap items-center gap-2 text-xs">
					<span class={`rounded-full border px-2.5 py-1 font-semibold uppercase tracking-[0.14em] ${focusBadgeClasses(data.detail.captureConfig.enabled)}`}>
						Captura global {data.detail.captureConfig.enabled ? 'activa' : 'apagada'}
					</span>
					<span class={`rounded-full border px-2.5 py-1 font-semibold uppercase tracking-[0.14em] ${focusBadgeClasses(!!data.detail.activityCaptureFocus?.enabled && !data.detail.activityCaptureFocus.isExpired)}`}>
						Foco actividad {data.detail.activityCaptureFocus?.enabled && !data.detail.activityCaptureFocus.isExpired ? 'activo' : 'inactivo'}
					</span>
					{#if data.detail.activityCaptureFocus?.reason}
						<span class="rounded-full border border-slate-200 px-2.5 py-1 text-slate-600 dark:border-slate-700 dark:text-slate-300">
							{data.detail.activityCaptureFocus.reason}
						</span>
					{/if}
				</div>
			</div>

			<div class="space-y-3">
				<div class="flex flex-wrap justify-end gap-2">
					<a
						href={resolve('/admin/activity-debugger/settings')}
						class="inline-flex items-center gap-2 rounded-2xl border border-slate-200 bg-white/80 px-4 py-2 text-sm font-medium text-slate-700 transition-colors hover:border-sky-300 hover:text-sky-700 dark:border-slate-800 dark:bg-slate-950/70 dark:text-slate-300 dark:hover:border-sky-800 dark:hover:text-sky-300"
					>
						<Settings2 class="h-4 w-4" />
						Settings captura
					</a>
					<form method="POST" action="?/toggleActivityCaptureFocus">
						<input type="hidden" name="enable" value={data.detail.activityCaptureFocus?.enabled && !data.detail.activityCaptureFocus.isExpired ? 'false' : 'true'} />
						<input type="hidden" name="reason" value="Activado rapidamente desde la vista de actividad" />
						<button
							type="submit"
							class={`inline-flex items-center gap-2 rounded-2xl px-4 py-2 text-sm font-semibold transition-colors ${
								data.detail.activityCaptureFocus?.enabled && !data.detail.activityCaptureFocus.isExpired
									? 'border border-rose-200 bg-rose-50 text-rose-700 hover:bg-rose-100 dark:border-rose-900/60 dark:bg-rose-950/30 dark:text-rose-300'
									: 'bg-slate-900 text-white dark:bg-sky-500 dark:text-slate-950'
							}`}
						>
							<Radar class="h-4 w-4" />
							{data.detail.activityCaptureFocus?.enabled && !data.detail.activityCaptureFocus.isExpired
								? 'Desactivar foco'
								: 'Activar foco'}
						</button>
					</form>
				</div>

				<div class="grid grid-cols-2 gap-3 sm:grid-cols-4">
				<div class="rounded-2xl border border-white/70 bg-white/80 px-4 py-3 dark:border-slate-800 dark:bg-slate-950/70">
					<p class="text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-500 dark:text-slate-400">Modelo</p>
					<p class="mt-2 text-sm font-semibold text-slate-900 dark:text-white">{data.detail.modelName || 'Sin modelo'}</p>
				</div>
				<div class="rounded-2xl border border-white/70 bg-white/80 px-4 py-3 dark:border-slate-800 dark:bg-slate-950/70">
					<p class="text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-500 dark:text-slate-400">Sesiones</p>
					<p class="mt-2 text-2xl font-bold text-slate-900 dark:text-white">{data.detail.sessions.length}</p>
				</div>
				<div class="rounded-2xl border border-white/70 bg-white/80 px-4 py-3 dark:border-slate-800 dark:bg-slate-950/70">
					<p class="text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-500 dark:text-slate-400">Tokens</p>
					<p class="mt-2 text-2xl font-bold text-slate-900 dark:text-white">{data.detail.usage.totalTokens.toLocaleString('es-ES')}</p>
				</div>
				<div class="rounded-2xl border border-white/70 bg-white/80 px-4 py-3 dark:border-slate-800 dark:bg-slate-950/70">
					<p class="text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-500 dark:text-slate-400">Coste</p>
					<p class="mt-2 text-sm font-semibold text-slate-900 dark:text-white">{formatCurrency(data.detail.usage.totalEstimatedCost)}</p>
				</div>
				</div>
			</div>
		</div>
	</section>

	<nav class="flex flex-wrap gap-2">
		{#each tabs as tab (tab.id)}
			<a
				href={tabHref(tab.id)}
				class={`rounded-2xl border px-4 py-2 text-sm font-medium transition-colors ${
					data.tab === tab.id
						? 'border-sky-500 bg-sky-500 text-white'
						: 'border-slate-200 text-slate-600 hover:border-slate-300 hover:text-slate-900 dark:border-slate-800 dark:text-slate-300 dark:hover:text-white'
				}`}
			>
				{tab.label}
			</a>
		{/each}
	</nav>

	{#if data.tab === 'sessions'}
		<section class="space-y-5 rounded-[2rem] border border-slate-200 bg-white p-6 dark:border-slate-800 dark:bg-slate-950/60">
			<form method="GET" class="space-y-4">
				<input type="hidden" name="tab" value="sessions" />
				<div class="grid gap-4 lg:grid-cols-[minmax(0,2fr)_repeat(3,minmax(0,1fr))]">
					<label class="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm dark:border-slate-800 dark:bg-slate-900/70">
						<span class="mb-1 block text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-500 dark:text-slate-400">Buscar</span>
						<input type="text" name="search" value={data.filters.search ?? ''} placeholder="Alumno, email o contenido..." class="w-full bg-transparent text-slate-900 outline-hidden dark:text-white" />
					</label>
					<label class="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm dark:border-slate-800 dark:bg-slate-900/70">
						<span class="mb-1 block text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-500 dark:text-slate-400">Estado</span>
						<select name="status" class="w-full bg-transparent text-slate-900 outline-hidden dark:text-white">
							<option value="all" selected={data.filters.status === 'all'}>Todos</option>
							<option value="attention" selected={data.filters.status === 'attention'}>Con incidencias</option>
							<option value="pending" selected={data.filters.status === 'pending'}>Pendientes</option>
							<option value="completed" selected={data.filters.status === 'completed'}>Completadas</option>
						</select>
					</label>
					<label class="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm dark:border-slate-800 dark:bg-slate-900/70">
						<span class="mb-1 block text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-500 dark:text-slate-400">Desde</span>
						<input type="date" name="dateFrom" value={data.filters.dateFrom ?? ''} class="w-full bg-transparent text-slate-900 outline-hidden dark:text-white" />
					</label>
					<label class="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm dark:border-slate-800 dark:bg-slate-900/70">
						<span class="mb-1 block text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-500 dark:text-slate-400">Hasta</span>
						<input type="date" name="dateTo" value={data.filters.dateTo ?? ''} class="w-full bg-transparent text-slate-900 outline-hidden dark:text-white" />
					</label>
				</div>
				<div class="flex flex-wrap items-center gap-3">
					<label class="inline-flex items-center gap-2 rounded-full border border-slate-200 px-3 py-2 text-sm text-slate-700 dark:border-slate-800 dark:text-slate-300">
						<input type="checkbox" name="onlyErrors" value="1" checked={data.filters.onlyErrors} />
						Solo errores IA
					</label>
					<label class="inline-flex items-center gap-2 rounded-full border border-slate-200 px-3 py-2 text-sm text-slate-700 dark:border-slate-800 dark:text-slate-300">
						<input type="checkbox" name="onlyToolFailures" value="1" checked={data.filters.onlyToolFailures} />
						Tool failures
					</label>
					<label class="inline-flex items-center gap-2 rounded-full border border-slate-200 px-3 py-2 text-sm text-slate-700 dark:border-slate-800 dark:text-slate-300">
						<input type="checkbox" name="onlyHighUsage" value="1" checked={data.filters.onlyHighUsage} />
						Uso alto
					</label>
					<div class="ml-auto flex items-center gap-3">
						<a href={clearSessionsHref()} class="rounded-2xl border border-slate-200 px-4 py-2 text-sm font-medium text-slate-600 dark:border-slate-800 dark:text-slate-300">Limpiar</a>
						<button type="submit" class="rounded-2xl bg-slate-900 px-4 py-2 text-sm font-semibold text-white dark:bg-sky-500 dark:text-slate-950">Filtrar</button>
					</div>
				</div>
			</form>

			<div class="overflow-x-auto">
				<table class="min-w-full divide-y divide-slate-200 dark:divide-slate-800">
					<thead class="bg-slate-50/80 dark:bg-slate-900/80">
						<tr class="text-left text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500 dark:text-slate-400">
							<th class="px-4 py-3">Alumno</th>
							<th class="px-4 py-3">Estado</th>
							<th class="px-4 py-3">Mensajes</th>
							<th class="px-4 py-3">Tokens</th>
							<th class="px-4 py-3">Coste</th>
							<th class="px-4 py-3">Última actividad</th>
							<th class="px-4 py-3">Alertas</th>
							<th class="px-4 py-3"></th>
						</tr>
					</thead>
					<tbody class="divide-y divide-slate-200 dark:divide-slate-800">
						{#each data.detail.sessions as session (session.chatId)}
							<tr class="align-top">
								<td class="px-4 py-4">
									<p class="font-semibold text-slate-900 dark:text-white">{session.username}</p>
									<p class="mt-1 text-xs text-slate-500 dark:text-slate-400">{session.email}</p>
									<p class="mt-1 text-[11px] text-slate-400">chatId {session.chatId}</p>
								</td>
								<td class="px-4 py-4">
									<span class={`rounded-full border px-2.5 py-1 text-[11px] font-semibold uppercase tracking-[0.14em] ${statusClasses(session.status)}`}>
										{session.status}
									</span>
								</td>
								<td class="px-4 py-4 text-sm text-slate-700 dark:text-slate-300">
									<p>{session.totalMessages} total</p>
									<p class="text-xs text-slate-500 dark:text-slate-400">{session.learnerMessageCount} user · {session.assistantMessageCount} assistant</p>
									{#if session.toolCallCount > 0 || session.uiResponseCount > 0}
										<p class="text-xs text-slate-500 dark:text-slate-400">{session.toolCallCount} tools · {session.uiResponseCount} UI</p>
									{/if}
								</td>
								<td class="px-4 py-4 text-sm text-slate-700 dark:text-slate-300">
									<p>{session.totalTokens.toLocaleString('es-ES')}</p>
									<p class="text-xs text-slate-500 dark:text-slate-400">{session.totalInputTokens.toLocaleString('es-ES')} / {session.totalOutputTokens.toLocaleString('es-ES')}</p>
								</td>
								<td class="px-4 py-4 text-sm font-semibold text-slate-900 dark:text-white">{formatCurrency(session.totalEstimatedCost)}</td>
								<td class="px-4 py-4 text-xs text-slate-600 dark:text-slate-300">{formatDate(session.lastActivityAt)}</td>
								<td class="px-4 py-4">
									<div class="flex flex-wrap gap-2">
										{#each session.alerts as alert (`${session.chatId}-${alert}`)}
											<span class="rounded-full border border-slate-200 px-2.5 py-1 text-[11px] text-slate-600 dark:border-slate-700 dark:text-slate-300">{alert}</span>
										{/each}
									</div>
								</td>
								<td class="px-4 py-4 text-right">
									<a href={sessionLink(session.chatId)} class="inline-flex items-center gap-2 rounded-2xl border border-slate-200 px-3 py-2 text-sm font-medium text-slate-700 transition-colors hover:border-sky-300 hover:text-sky-700 dark:border-slate-800 dark:text-slate-300 dark:hover:border-sky-800 dark:hover:text-sky-300">
										Abrir
										<ArrowRight class="h-4 w-4" />
									</a>
								</td>
							</tr>
						{/each}
					</tbody>
				</table>
			</div>
		</section>
	{:else if data.tab === 'config'}
		<section class="grid gap-6 xl:grid-cols-[1.2fr_0.8fr]">
			<div class="space-y-4">
				{#each Object.values(data.detail.prompts) as prompt (prompt.label)}
					<article class={`rounded-[2rem] border p-5 ${promptCardClasses(prompt.origin)}`}>
						<div class="flex flex-wrap items-center gap-2">
							<p class="text-sm font-semibold text-slate-900 dark:text-white">{prompt.label}</p>
							<span class="rounded-full border border-current/20 px-2.5 py-1 text-[11px] font-semibold uppercase tracking-[0.14em]">{prompt.origin}</span>
						</div>
						<p class="mt-3 whitespace-pre-wrap text-sm text-slate-700 dark:text-slate-200">{prompt.value || 'No disponible'}</p>
						{#if prompt.note}
							<p class="mt-3 text-xs text-slate-500 dark:text-slate-400">{prompt.note}</p>
						{/if}
					</article>
				{/each}
			</div>

			<div class="space-y-4">
				<div class="rounded-[2rem] border border-slate-200 bg-white p-5 dark:border-slate-800 dark:bg-slate-950/60">
					<h2 class="text-sm font-semibold uppercase tracking-[0.16em] text-slate-500 dark:text-slate-400">Configuracion tecnica</h2>
					<div class="mt-4 space-y-3 text-sm text-slate-700 dark:text-slate-300">
						<div class="flex items-center justify-between gap-3"><span>Modelo</span><span class="font-semibold text-slate-900 dark:text-white">{data.detail.modelName || 'Sin modelo'}</span></div>
						<div class="flex items-center justify-between gap-3"><span>RAG</span><span class="font-semibold text-slate-900 dark:text-white">{data.detail.ragEnabled ? 'Activo' : 'Inactivo'}</span></div>
						<div class="flex items-center justify-between gap-3"><span>Temperatura</span><span class="font-semibold text-slate-900 dark:text-white">{data.detail.temperature ?? 'N/A'}</span></div>
						<div class="flex items-center justify-between gap-3"><span>Top P</span><span class="font-semibold text-slate-900 dark:text-white">{data.detail.topP ?? 'N/A'}</span></div>
						<div class="flex items-center justify-between gap-3"><span>Max tokens</span><span class="font-semibold text-slate-900 dark:text-white">{data.detail.maxTokens ?? 'N/A'}</span></div>
					</div>
				</div>

				<div class="rounded-[2rem] border border-slate-200 bg-white p-5 dark:border-slate-800 dark:bg-slate-950/60">
					<div class="flex items-center gap-2">
						<Wrench class="h-4 w-4 text-slate-400" />
						<h2 class="text-sm font-semibold uppercase tracking-[0.16em] text-slate-500 dark:text-slate-400">Herramientas activas</h2>
					</div>
					<div class="mt-4 flex flex-wrap gap-2">
						{#if data.detail.tools.length === 0}
							<span class="text-sm text-slate-500 dark:text-slate-400">No hay herramientas registradas para esta actividad.</span>
						{:else}
							{#each data.detail.tools as tool (tool.id)}
								<span class="rounded-full border border-slate-200 px-3 py-2 text-sm text-slate-700 dark:border-slate-800 dark:text-slate-300">
									{tool.displayName} · {tool.riskLevel}
								</span>
							{/each}
						{/if}
					</div>
				</div>
			</div>
		</section>
	{:else if data.tab === 'capture'}
		<section class="space-y-5 rounded-[2rem] border border-slate-200 bg-white p-6 dark:border-slate-800 dark:bg-slate-950/60">
			<div class="grid gap-4 xl:grid-cols-[0.92fr_1.08fr]">
				<div class="space-y-4">
					<div class="rounded-[1.5rem] border border-slate-200 bg-slate-50 p-5 dark:border-slate-800 dark:bg-slate-900/60">
						<div class="flex items-center gap-2">
							<Radar class="h-4 w-4 text-slate-400" />
							<h2 class="text-sm font-semibold uppercase tracking-[0.16em] text-slate-500 dark:text-slate-400">Estado de captura</h2>
						</div>
						<div class="mt-4 space-y-3 text-sm text-slate-700 dark:text-slate-300">
							<div class="flex items-center justify-between gap-3"><span>Global</span><span class="font-semibold text-slate-900 dark:text-white">{data.detail.captureConfig.enabled ? 'Activada' : 'Apagada'}</span></div>
							<div class="flex items-center justify-between gap-3"><span>Modo</span><span class="font-semibold text-slate-900 dark:text-white">{data.detail.captureConfig.mode}</span></div>
							<div class="flex items-center justify-between gap-3"><span>Payload</span><span class="font-semibold text-slate-900 dark:text-white">{data.detail.captureConfig.payloadSource}</span></div>
							<div class="flex items-center justify-between gap-3"><span>Retención</span><span class="font-semibold text-slate-900 dark:text-white">{data.detail.captureConfig.retentionDays} días</span></div>
							<div class="flex items-center justify-between gap-3"><span>Rondas capturadas</span><span class="font-semibold text-slate-900 dark:text-white">{data.detail.requestRounds.length}</span></div>
						</div>
					</div>

					<div class="rounded-[1.5rem] border border-slate-200 bg-slate-50 p-5 dark:border-slate-800 dark:bg-slate-900/60">
						<div class="flex items-center gap-2">
							<Fingerprint class="h-4 w-4 text-slate-400" />
							<h2 class="text-sm font-semibold uppercase tracking-[0.16em] text-slate-500 dark:text-slate-400">Foco de actividad</h2>
						</div>
						<p class="mt-4 text-sm text-slate-700 dark:text-slate-300">
							{#if data.detail.activityCaptureFocus?.enabled && !data.detail.activityCaptureFocus.isExpired}
								Activo desde {formatDate(data.detail.activityCaptureFocus.createdAt)} por {data.detail.activityCaptureFocus.createdByLabel || 'Sistema'}.
							{:else}
								No hay foco activo en esta actividad.
							{/if}
						</p>
						{#if data.detail.activityCaptureFocus?.reason}
							<p class="mt-2 text-xs text-slate-500 dark:text-slate-400">{data.detail.activityCaptureFocus.reason}</p>
						{/if}
						{#if data.detail.activityCaptureFocus?.expiresAt}
							<p class="mt-2 text-xs text-slate-500 dark:text-slate-400">Expira {formatDate(data.detail.activityCaptureFocus.expiresAt)}</p>
						{/if}
					</div>
				</div>

				<div class="rounded-[1.5rem] border border-slate-200 bg-slate-50 p-5 dark:border-slate-800 dark:bg-slate-900/60">
					<div class="flex items-center gap-2">
						<Database class="h-4 w-4 text-slate-400" />
						<h2 class="text-sm font-semibold uppercase tracking-[0.16em] text-slate-500 dark:text-slate-400">Lectura operativa</h2>
					</div>
					<p class="mt-4 text-sm text-slate-700 dark:text-slate-300">
						Aquí ves solo rondas realmente capturadas. Si el switch global está apagado o no había foco activo en el momento de la llamada, no existe reconstrucción histórica exacta.
					</p>
					<div class="mt-4 grid gap-3 sm:grid-cols-2">
						<div class="rounded-2xl border border-slate-200 bg-white px-4 py-4 dark:border-slate-800 dark:bg-slate-950/70">
							<p class="text-[11px] uppercase tracking-[0.14em] text-slate-500 dark:text-slate-400">Cache hits</p>
							<p class="mt-2 text-2xl font-bold text-slate-900 dark:text-white">{data.detail.requestRounds.filter((round) => round.hasCacheHit).length}</p>
						</div>
						<div class="rounded-2xl border border-slate-200 bg-white px-4 py-4 dark:border-slate-800 dark:bg-slate-950/70">
							<p class="text-[11px] uppercase tracking-[0.14em] text-slate-500 dark:text-slate-400">Con RAG</p>
							<p class="mt-2 text-2xl font-bold text-slate-900 dark:text-white">{data.detail.requestRounds.filter((round) => round.ragContextUsed).length}</p>
						</div>
					</div>
				</div>
			</div>

			{#if data.detail.requestRounds.length === 0}
				<div class="rounded-[1.6rem] border border-dashed border-slate-300 bg-slate-50 px-5 py-10 text-center text-sm text-slate-500 dark:border-slate-700 dark:bg-slate-900/40 dark:text-slate-400">
					Todavía no hay rondas forenses capturadas para esta actividad.
				</div>
			{:else}
				<div class="overflow-x-auto">
					<table class="min-w-full divide-y divide-slate-200 dark:divide-slate-800">
						<thead class="bg-slate-50/80 dark:bg-slate-900/80">
							<tr class="text-left text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500 dark:text-slate-400">
								<th class="px-4 py-3">Inicio</th>
								<th class="px-4 py-3">Sesión</th>
								<th class="px-4 py-3">Tipo</th>
								<th class="px-4 py-3">Modelo</th>
								<th class="px-4 py-3">Hashes</th>
								<th class="px-4 py-3">Uso</th>
								<th class="px-4 py-3">Cache</th>
							</tr>
						</thead>
						<tbody class="divide-y divide-slate-200 dark:divide-slate-800">
							{#each data.detail.requestRounds as round (round.id)}
								<tr class="align-top">
									<td class="px-4 py-4 text-xs text-slate-600 dark:text-slate-300">{formatDate(round.startedAt)}</td>
									<td class="px-4 py-4">
										{#if round.chatId}
											<a href={sessionLink(round.chatId)} class="text-sm font-semibold text-sky-700 hover:text-sky-800 dark:text-sky-300 dark:hover:text-sky-200">{round.chatId}</a>
										{:else}
											<span class="text-sm text-slate-500 dark:text-slate-400">Sin sesión</span>
										{/if}
									</td>
									<td class="px-4 py-4">
										<div class="flex flex-wrap gap-2">
											<span class={`rounded-full border px-2.5 py-1 text-[11px] font-semibold uppercase tracking-[0.14em] ${roundStatusClasses(round.status)}`}>{round.status}</span>
											<span class="rounded-full border border-slate-200 px-2.5 py-1 text-[11px] uppercase tracking-[0.14em] text-slate-600 dark:border-slate-700 dark:text-slate-300">{round.roundType}</span>
										</div>
									</td>
									<td class="px-4 py-4 text-sm text-slate-700 dark:text-slate-300">{round.modelName || 'Sin modelo'}</td>
									<td class="px-4 py-4 text-xs text-slate-600 dark:text-slate-300">
										<p>system {round.comparison.sameSystemPromptHash === null ? 'n/a' : round.comparison.sameSystemPromptHash ? 'same' : 'diff'}</p>
										<p>messages {round.comparison.sameMessagesHash === null ? 'n/a' : round.comparison.sameMessagesHash ? 'same' : 'diff'}</p>
										<p>rag {round.comparison.sameRagContextHash === null ? 'n/a' : round.comparison.sameRagContextHash ? 'same' : 'diff'}</p>
									</td>
									<td class="px-4 py-4 text-xs text-slate-600 dark:text-slate-300">
										<p>{formatNumber(round.inputTokens)} in / {formatNumber(round.outputTokens)} out</p>
										<p>{formatNumber(round.totalTokens)} total</p>
										<p>{round.durationMs ?? 'N/A'} ms</p>
									</td>
									<td class="px-4 py-4 text-xs text-slate-600 dark:text-slate-300">
										<p>{round.cacheReadTokens ? `${formatNumber(round.cacheReadTokens)} read` : 'Sin cache hit'}</p>
										<p>{round.cacheWriteTokens ? `${formatNumber(round.cacheWriteTokens)} write` : 'Sin cache write'}</p>
										<p>{round.cacheStrategy || 'Sin estrategia cacheable'}</p>
										<p>{round.reasoningTokens ? `${formatNumber(round.reasoningTokens)} reasoning` : 'Sin reasoning'}</p>
									</td>
								</tr>
							{/each}
						</tbody>
					</table>
				</div>
			{/if}
		</section>
	{:else if data.tab === 'usage'}
		<section class="space-y-5 rounded-[2rem] border border-slate-200 bg-white p-6 dark:border-slate-800 dark:bg-slate-950/60">
			<div class="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
				<div class="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-4 dark:border-slate-800 dark:bg-slate-900/60">
					<p class="text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-500 dark:text-slate-400">Requests</p>
					<p class="mt-2 text-2xl font-bold text-slate-900 dark:text-white">{data.detail.usage.requestCount}</p>
				</div>
				<div class="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-4 dark:border-slate-800 dark:bg-slate-900/60">
					<p class="text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-500 dark:text-slate-400">Tokens</p>
					<p class="mt-2 text-2xl font-bold text-slate-900 dark:text-white">{data.detail.usage.totalTokens.toLocaleString('es-ES')}</p>
				</div>
				<div class="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-4 dark:border-slate-800 dark:bg-slate-900/60">
					<p class="text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-500 dark:text-slate-400">Coste</p>
					<p class="mt-2 text-2xl font-bold text-slate-900 dark:text-white">{formatCurrency(data.detail.usage.totalEstimatedCost)}</p>
				</div>
				<div class="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-4 dark:border-slate-800 dark:bg-slate-900/60">
					<p class="text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-500 dark:text-slate-400">Duración media</p>
					<p class="mt-2 text-2xl font-bold text-slate-900 dark:text-white">{data.detail.usage.averageDurationMs} ms</p>
				</div>
			</div>

			<div class="overflow-x-auto">
				<table class="min-w-full divide-y divide-slate-200 dark:divide-slate-800">
					<thead class="bg-slate-50/80 dark:bg-slate-900/80">
						<tr class="text-left text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500 dark:text-slate-400">
							<th class="px-4 py-3">Sesion</th>
							<th class="px-4 py-3">Modelo</th>
							<th class="px-4 py-3">Tokens</th>
							<th class="px-4 py-3">Coste</th>
							<th class="px-4 py-3">Flags</th>
						</tr>
					</thead>
					<tbody class="divide-y divide-slate-200 dark:divide-slate-800">
						{#each data.detail.sessions as session (session.chatId)}
							<tr>
								<td class="px-4 py-4 text-sm text-slate-700 dark:text-slate-300">{session.username}<div class="text-xs text-slate-500 dark:text-slate-400">{session.chatId}</div></td>
								<td class="px-4 py-4 text-sm text-slate-700 dark:text-slate-300">{session.lastModelName || data.detail.modelName || 'Sin modelo'}</td>
								<td class="px-4 py-4 text-sm text-slate-700 dark:text-slate-300">{session.totalTokens.toLocaleString('es-ES')}</td>
								<td class="px-4 py-4 text-sm font-semibold text-slate-900 dark:text-white">{formatCurrency(session.totalEstimatedCost)}</td>
								<td class="px-4 py-4">
									<div class="flex flex-wrap gap-2">
										{#if session.hasUsageErrors}
											<span class="rounded-full border border-rose-200 bg-rose-50 px-2.5 py-1 text-[11px] text-rose-700 dark:border-rose-900/60 dark:bg-rose-950/30 dark:text-rose-300">Errores</span>
										{/if}
										{#if session.hasToolFailures}
											<span class="rounded-full border border-amber-200 bg-amber-50 px-2.5 py-1 text-[11px] text-amber-700 dark:border-amber-900/60 dark:bg-amber-950/30 dark:text-amber-300">Tools</span>
										{/if}
									</div>
								</td>
							</tr>
						{/each}
					</tbody>
				</table>
			</div>

			<details class="rounded-[2rem] border border-slate-200 bg-slate-50 dark:border-slate-800 dark:bg-slate-900/50">
				<summary class="cursor-pointer px-5 py-4 text-sm font-semibold text-slate-900 dark:text-white">Ver logs brutos de uso IA</summary>
				<div class="border-t border-slate-200 px-5 py-5 dark:border-slate-800">
					<RawSections sections={[{ id: 'usage-logs', label: 'ai_usage_log', data: getUsageLogs() }]} />
				</div>
			</details>
		</section>
	{:else}
		<RawSections sections={data.detail.rawSections} />
	{/if}
</div>
