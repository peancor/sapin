<script lang="ts">
	import { resolve } from '$app/paths';
	import {
		ArrowLeft,
		BarChart3,
		Bot,
		Clock3,
		FileCheck2,
		User
	} from 'lucide-svelte';
	import AgentTranscriptReadOnly from '$lib/components/agent/AgentTranscriptReadOnly.svelte';
	import { formatDate } from '$lib/helpers/dateUtils';
	import type { PageProps } from './$types';

	let { data }: PageProps = $props();
	let showStatsSummary = $state(false);

	function formatTime(seconds: number): string {
		if (seconds < 60) return `${seconds} segundos`;
		const minutes = Math.floor(seconds / 60);
		const remainingSeconds = seconds % 60;
		return `${minutes} min ${remainingSeconds} seg`;
	}

	function formatNumber(value: number): string {
		return value.toLocaleString();
	}

	function statusLabel(status: string): string {
		switch (status) {
			case 'completed':
				return 'Finalizada';
			case 'attention':
				return 'Con incidencias';
			default:
				return 'En curso';
		}
	}

	function statusClasses(status: string): string {
		switch (status) {
			case 'completed':
				return 'border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-900/60 dark:bg-emerald-950/30 dark:text-emerald-300';
			case 'attention':
				return 'border-rose-200 bg-rose-50 text-rose-700 dark:border-rose-900/60 dark:bg-rose-950/30 dark:text-rose-300';
			default:
				return 'border-amber-200 bg-amber-50 text-amber-700 dark:border-amber-900/60 dark:bg-amber-950/30 dark:text-amber-300';
		}
	}
</script>

<div class="min-h-screen bg-[radial-gradient(circle_at_top_left,_rgba(56,189,248,0.12),_transparent_28%),radial-gradient(circle_at_top_right,_rgba(16,185,129,0.1),_transparent_24%),linear-gradient(180deg,_#f8fafc_0%,_#eef2f7_100%)] dark:bg-[radial-gradient(circle_at_top_left,_rgba(56,189,248,0.12),_transparent_25%),radial-gradient(circle_at_top_right,_rgba(16,185,129,0.1),_transparent_22%),linear-gradient(180deg,_#020617_0%,_#111827_100%)]">
	<div class="sticky top-0 z-20 border-b border-white/70 bg-white/85 backdrop-blur-xl dark:border-slate-800 dark:bg-slate-950/85">
		<div class="mx-auto flex max-w-6xl items-center gap-3 px-4 py-4 sm:px-6">
			{#if data.reviewCourseId}
				<a
					href={resolve(`/course/${data.reviewCourseId}/admin/interactives/${data.activity.id}/agent-review`)}
					class="inline-flex h-10 w-10 items-center justify-center rounded-2xl border border-slate-200 bg-white text-slate-600 transition-colors hover:border-sky-300 hover:text-sky-700 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300 dark:hover:border-sky-700 dark:hover:text-sky-200"
					aria-label="Volver a revision"
				>
					<ArrowLeft class="h-4 w-4" />
				</a>
			{/if}

			<div class="min-w-0 flex-1">
				<p class="text-[11px] font-semibold uppercase tracking-[0.24em] text-sky-700 dark:text-sky-300">
					Revision de actividad
				</p>
				<h1 class="truncate text-lg font-semibold text-slate-900 dark:text-white sm:text-xl">
					{data.activity.name}
				</h1>
			</div>
		</div>
	</div>

	<div class="mx-auto max-w-6xl space-y-6 px-4 py-6 sm:px-6">
		<section class="grid gap-4 xl:grid-cols-[minmax(0,1.7fr)_minmax(320px,0.95fr)]">
			<div class="overflow-hidden rounded-[28px] border border-slate-200/80 bg-white/90 shadow-sm dark:border-slate-800 dark:bg-slate-900/88">
				<div class="border-b border-slate-200/80 px-5 py-5 dark:border-slate-800">
					<div class="flex flex-wrap items-center gap-2">
						<span class="rounded-full bg-sky-100 px-2.5 py-1 text-[11px] font-semibold uppercase tracking-[0.18em] text-sky-700 dark:bg-sky-950/50 dark:text-sky-300">
							Agente
						</span>
						<span
							class={`rounded-full border px-2.5 py-1 text-[11px] font-semibold uppercase tracking-[0.18em] ${statusClasses(data.sessionSummary.status)}`}
						>
							{statusLabel(data.sessionSummary.status)}
						</span>
						{#if !data.sessionSummary.hasStudentMessages}
							<span class="rounded-full bg-slate-100 px-2.5 py-1 text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-600 dark:bg-slate-800 dark:text-slate-300">
								Sin mensajes del alumno
							</span>
						{/if}
					</div>

					{#if data.activity.description}
						<p class="mt-3 max-w-3xl text-sm leading-6 text-slate-600 dark:text-slate-300">
							{data.activity.description}
						</p>
					{/if}

					<div class="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
						<div class="rounded-3xl bg-slate-100/90 px-4 py-3 dark:bg-slate-800/80">
							<p class="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500 dark:text-slate-400">
								Mensajes visibles
							</p>
							<p class="mt-1 text-2xl font-semibold text-slate-900 dark:text-white">
								{data.sessionSummary.stats.totalMessages}
							</p>
						</div>
						<div class="rounded-3xl bg-slate-100/90 px-4 py-3 dark:bg-slate-800/80">
							<p class="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500 dark:text-slate-400">
								Tool calls
							</p>
							<p class="mt-1 text-2xl font-semibold text-slate-900 dark:text-white">
								{data.sessionSummary.stats.totalToolCalls}
							</p>
						</div>
						<div class="rounded-3xl bg-slate-100/90 px-4 py-3 dark:bg-slate-800/80">
							<p class="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500 dark:text-slate-400">
								Componentes UI
							</p>
							<p class="mt-1 text-2xl font-semibold text-slate-900 dark:text-white">
								{data.sessionSummary.stats.totalUiComponents}
							</p>
						</div>
						<div class="rounded-3xl bg-slate-100/90 px-4 py-3 dark:bg-slate-800/80">
							<p class="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500 dark:text-slate-400">
								Tiempo total
							</p>
							<p class="mt-1 text-2xl font-semibold text-slate-900 dark:text-white">
								{formatTime(data.sessionSummary.globalStats.sessionDurationSeconds)}
							</p>
						</div>
					</div>
				</div>

				<div class="px-5 py-5">
					<button
						type="button"
						class="flex w-full items-center justify-between rounded-3xl border border-slate-200/80 bg-slate-50/90 px-4 py-3 text-left text-sm font-medium text-slate-700 transition-colors hover:bg-slate-100 dark:border-slate-800 dark:bg-slate-950/60 dark:text-slate-200 dark:hover:bg-slate-950"
						onclick={() => (showStatsSummary = !showStatsSummary)}
					>
						<span class="inline-flex items-center gap-2">
							<BarChart3 class="h-4 w-4" />
							Resumen de estadísticas de interacción
						</span>
						<span class="text-xs">{showStatsSummary ? '▲' : '▼'}</span>
					</button>

					{#if showStatsSummary}
						<div class="mt-4 grid gap-4 md:grid-cols-2 xl:grid-cols-4">
							<div class="rounded-[26px] bg-slate-100/90 p-4 dark:bg-slate-800/80">
								<h3 class="text-sm font-semibold text-slate-900 dark:text-slate-100">Mensajes</h3>
								<div class="mt-3 space-y-2 text-sm text-slate-600 dark:text-slate-300">
									<div class="flex justify-between">
										<span>Total visibles</span>
										<span class="font-medium">{data.sessionSummary.globalStats.totalMessages}</span>
									</div>
									<div class="flex justify-between">
										<span>Alumno</span>
										<span class="font-medium">{data.sessionSummary.globalStats.totalUserMessages}</span>
									</div>
									<div class="flex justify-between">
										<span>Agente</span>
										<span class="font-medium">{data.sessionSummary.globalStats.totalAssistantMessages}</span>
									</div>
									<div class="flex justify-between">
										<span>Componentes UI</span>
										<span class="font-medium">{data.sessionSummary.globalStats.totalUiComponents}</span>
									</div>
								</div>
							</div>

							<div class="rounded-[26px] bg-slate-100/90 p-4 dark:bg-slate-800/80">
								<h3 class="text-sm font-semibold text-slate-900 dark:text-slate-100">
									Comportamiento de escritura
								</h3>
								<div class="mt-3 space-y-2 text-sm text-slate-600 dark:text-slate-300">
									<div class="flex justify-between">
										<span>Total pulsaciones</span>
										<span class="font-medium">
											{formatNumber(data.sessionSummary.globalStats.totalKeystrokeCount)}
										</span>
									</div>
									<div class="flex justify-between">
										<span>Total pegados</span>
										<span class="font-medium">{data.sessionSummary.globalStats.totalPasteCount}</span>
									</div>
									<div class="flex justify-between">
										<span>Promedio caracteres</span>
										<span class="font-medium">{data.sessionSummary.globalStats.averageCharCount}</span>
									</div>
									<div class="flex justify-between">
										<span>Promedio palabras</span>
										<span class="font-medium">{data.sessionSummary.globalStats.averageWordCount}</span>
									</div>
								</div>
							</div>

							<div class="rounded-[26px] bg-slate-100/90 p-4 dark:bg-slate-800/80">
								<h3 class="text-sm font-semibold text-slate-900 dark:text-slate-100">
									Tiempos y dispositivos
								</h3>
								<div class="mt-3 space-y-2 text-sm text-slate-600 dark:text-slate-300">
									<div class="flex justify-between">
										<span>Duracion de la sesion</span>
										<span class="font-medium">
											{formatTime(data.sessionSummary.globalStats.sessionDurationSeconds)}
										</span>
									</div>
									<div class="flex justify-between">
										<span>Escritura acumulada</span>
										<span class="font-medium">
											{formatTime(data.sessionSummary.globalStats.totalDraftTimeSpentSeconds)}
										</span>
									</div>
									<div class="flex justify-between">
										<span>Tiempo medio por mensaje</span>
										<span class="font-medium">
											{formatTime(data.sessionSummary.globalStats.averageDraftTimeSpentSeconds)}
										</span>
									</div>
									<div class="flex justify-between">
										<span>Uso móvil</span>
										<span class="font-medium">{data.sessionSummary.globalStats.mobileUsage}%</span>
									</div>
									<div class="flex justify-between">
										<span>Uso escritorio</span>
										<span class="font-medium">{data.sessionSummary.globalStats.desktopUsage}%</span>
									</div>
								</div>
							</div>

							<div class="rounded-[26px] bg-slate-100/90 p-4 dark:bg-slate-800/80">
								<h3 class="text-sm font-semibold text-slate-900 dark:text-slate-100">
									Finalización
								</h3>
								<div class="mt-3 space-y-2 text-sm text-slate-600 dark:text-slate-300">
									<div class="flex justify-between">
										<span>Estado</span>
										<span class="font-medium">{statusLabel(data.sessionSummary.status)}</span>
									</div>
									<div class="flex justify-between gap-3">
										<span>Ejecutada</span>
										<span class="text-right font-medium">
											{data.sessionSummary.finalization
												? formatDate(new Date(data.sessionSummary.finalization.executedAt))
												: 'No'}
										</span>
									</div>
									<div class="flex justify-between">
										<span>Resultado</span>
										<span class="font-medium">
											{data.sessionSummary.finalization?.payload.result ?? 'Sin resultado'}
										</span>
									</div>
									<div class="flex justify-between">
										<span>Incidencias</span>
										<span class="font-medium">
											{data.sessionSummary.stats.failedToolCalls + data.sessionSummary.stats.pendingToolCalls}
										</span>
									</div>
								</div>
							</div>
						</div>
					{/if}
				</div>
			</div>

			<aside class="rounded-[28px] border border-slate-200/80 bg-white/90 p-5 shadow-sm dark:border-slate-800 dark:bg-slate-900/88">
				<div class="flex items-start gap-4">
					<div class="flex h-14 w-14 shrink-0 items-center justify-center overflow-hidden rounded-3xl bg-sky-100 text-sky-700 dark:bg-sky-950/50 dark:text-sky-300">
						{#if data.student.image}
							<img
								src={data.student.image}
								alt={data.student.username}
								class="h-full w-full object-cover"
							/>
						{:else}
							<User class="h-6 w-6" />
						{/if}
					</div>

					<div class="min-w-0">
						<p class="text-[11px] font-semibold uppercase tracking-[0.2em] text-slate-500 dark:text-slate-400">
							Alumno
						</p>
						<h2 class="truncate text-lg font-semibold text-slate-900 dark:text-white">
							{data.student.username}
						</h2>
						{#if data.student.alias}
							<p class="text-sm italic text-slate-500 dark:text-slate-400">{data.student.alias}</p>
						{/if}
						{#if data.student.email}
							<p class="mt-1 break-all text-sm text-slate-600 dark:text-slate-300">
								{data.student.email}
							</p>
						{/if}
					</div>
				</div>

				<div class="mt-5 space-y-3">
					<div class="rounded-3xl bg-slate-100/90 px-4 py-3 dark:bg-slate-800/80">
						<p class="flex items-center gap-2 text-sm font-medium text-slate-700 dark:text-slate-200">
							<Clock3 class="h-4 w-4" />
							Creada
						</p>
						<p class="mt-1 text-sm text-slate-600 dark:text-slate-300">{formatDate(data.createdAt)}</p>
					</div>
					<div class="rounded-3xl bg-slate-100/90 px-4 py-3 dark:bg-slate-800/80">
						<p class="flex items-center gap-2 text-sm font-medium text-slate-700 dark:text-slate-200">
							<Bot class="h-4 w-4" />
							Ultima actualización
						</p>
						<p class="mt-1 text-sm text-slate-600 dark:text-slate-300">{formatDate(data.updatedAt)}</p>
					</div>
					<div class="rounded-3xl bg-slate-100/90 px-4 py-3 dark:bg-slate-800/80">
						<p class="flex items-center gap-2 text-sm font-medium text-slate-700 dark:text-slate-200">
							<FileCheck2 class="h-4 w-4" />
							Finalización
						</p>
						<p class="mt-1 text-sm text-slate-600 dark:text-slate-300">
							{data.sessionSummary.finalization?.payload.summary || 'La herramienta de finalización aún no se ha ejecutado.'}
						</p>
					</div>
				</div>
			</aside>
		</section>

		<section class="overflow-hidden rounded-[32px] border border-slate-200/80 bg-white/92 shadow-sm dark:border-slate-800 dark:bg-slate-900/88">
			<div class="border-b border-slate-200/80 px-5 py-4 dark:border-slate-800">
				<h2 class="text-lg font-semibold text-slate-900 dark:text-white">Transcript de la sesión</h2>
				<p class="mt-1 text-sm text-slate-600 dark:text-slate-300">
					Conversación, llamadas a herramientas y componentes UI en modo de revisión.
				</p>
			</div>

			<div class="px-4 py-5 sm:px-5">
				<AgentTranscriptReadOnly
					messages={data.messages}
					messageMetricsById={data.sessionSummary.messageMetricsById}
				/>
			</div>
		</section>
	</div>
</div>
