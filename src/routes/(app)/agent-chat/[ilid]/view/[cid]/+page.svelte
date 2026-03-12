<script lang="ts">
	import { resolve } from '$app/paths';
	import { ArrowLeft, Bot, Clock3, LayoutTemplate, User } from 'lucide-svelte';
	import AgentTranscriptReadOnly from '$lib/components/agent/AgentTranscriptReadOnly.svelte';
	import { formatDate } from '$lib/helpers/dateUtils';
	import type { PageProps } from './$types';

	let { data }: PageProps = $props();

	const summary = $derived.by(() => {
		let userMessages = 0;
		let assistantMessages = 0;
		let toolCalls = 0;
		let respondedUiComponents = 0;
		let pendingUiComponents = 0;

		for (const message of data.messages) {
			if (message.role === 'user') userMessages += 1;
			if (message.role === 'assistant') assistantMessages += 1;

			for (const part of message.parts) {
				if (part.kind === 'tool-call') toolCalls += 1;
				if (part.kind === 'ui-component') {
					if (part.userResponse) {
						respondedUiComponents += 1;
					} else {
						pendingUiComponents += 1;
					}
				}
			}
		}

		return {
			userMessages,
			assistantMessages,
			toolCalls,
			respondedUiComponents,
			pendingUiComponents
		};
	});

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
		<section class="grid gap-4 xl:grid-cols-[minmax(0,1.8fr)_minmax(320px,0.95fr)]">
			<div class="overflow-hidden rounded-[28px] border border-slate-200/80 bg-white/90 shadow-sm dark:border-slate-800 dark:bg-slate-900/88">
				<div class="border-b border-slate-200/80 px-5 py-5 dark:border-slate-800">
					<div class="flex flex-wrap items-center gap-2">
						<span class="rounded-full bg-emerald-100 px-2.5 py-1 text-[11px] font-semibold uppercase tracking-[0.18em] text-emerald-700 dark:bg-emerald-950/60 dark:text-emerald-300">
							Agente
						</span>
						<span class="rounded-full bg-slate-100 px-2.5 py-1 text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-600 dark:bg-slate-800 dark:text-slate-300">
							Solo lectura
						</span>
					</div>

					{#if data.activity.description}
						<p class="mt-3 max-w-3xl text-sm leading-6 text-slate-600 dark:text-slate-300">
							{data.activity.description}
						</p>
					{/if}
				</div>

				<div class="grid gap-3 px-5 py-5 sm:grid-cols-2 xl:grid-cols-5">
					<div class="rounded-3xl bg-slate-100/90 px-4 py-3 dark:bg-slate-800/80">
						<p class="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500 dark:text-slate-400">
							Mensajes alumno
						</p>
						<p class="mt-1 text-2xl font-semibold text-slate-900 dark:text-white">
							{summary.userMessages}
						</p>
					</div>
					<div class="rounded-3xl bg-slate-100/90 px-4 py-3 dark:bg-slate-800/80">
						<p class="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500 dark:text-slate-400">
							Mensajes agente
						</p>
						<p class="mt-1 text-2xl font-semibold text-slate-900 dark:text-white">
							{summary.assistantMessages}
						</p>
					</div>
					<div class="rounded-3xl bg-slate-100/90 px-4 py-3 dark:bg-slate-800/80">
						<p class="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500 dark:text-slate-400">
							Tool calls
						</p>
						<p class="mt-1 text-2xl font-semibold text-slate-900 dark:text-white">
							{summary.toolCalls}
						</p>
					</div>
					<div class="rounded-3xl bg-slate-100/90 px-4 py-3 dark:bg-slate-800/80">
						<p class="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500 dark:text-slate-400">
							UI respondida
						</p>
						<p class="mt-1 text-2xl font-semibold text-slate-900 dark:text-white">
							{summary.respondedUiComponents}
						</p>
					</div>
					<div class="rounded-3xl bg-slate-100/90 px-4 py-3 dark:bg-slate-800/80">
						<p class="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500 dark:text-slate-400">
							UI pendiente
						</p>
						<p class="mt-1 text-2xl font-semibold text-slate-900 dark:text-white">
							{summary.pendingUiComponents}
						</p>
					</div>
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
							Ultima actualizacion
						</p>
						<p class="mt-1 text-sm text-slate-600 dark:text-slate-300">{formatDate(data.updatedAt)}</p>
					</div>
					<div class="rounded-3xl bg-slate-100/90 px-4 py-3 dark:bg-slate-800/80">
						<p class="flex items-center gap-2 text-sm font-medium text-slate-700 dark:text-slate-200">
							<LayoutTemplate class="h-4 w-4" />
							Componentes UI
						</p>
						<p class="mt-1 text-sm text-slate-600 dark:text-slate-300">
							{summary.respondedUiComponents > 0
								? `${summary.respondedUiComponents} respondidos`
								: 'Sin respuestas UI completadas'}
						</p>
					</div>
				</div>
			</aside>
		</section>

		<section class="overflow-hidden rounded-[32px] border border-slate-200/80 bg-white/92 shadow-sm dark:border-slate-800 dark:bg-slate-900/88">
			<div class="border-b border-slate-200/80 px-5 py-4 dark:border-slate-800">
				<h2 class="text-lg font-semibold text-slate-900 dark:text-white">Transcript de la sesion</h2>
				<p class="mt-1 text-sm text-slate-600 dark:text-slate-300">
					Conversacion, llamadas a herramientas y componentes UI en modo de revision.
				</p>
			</div>

			<div class="px-4 py-5 sm:px-5">
				<AgentTranscriptReadOnly messages={data.messages} />
			</div>
		</section>
	</div>
</div>
