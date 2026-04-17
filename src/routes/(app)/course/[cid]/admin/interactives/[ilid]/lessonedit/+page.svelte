<script lang="ts">
	import type { PageProps } from './$types';
	import { enhance } from '$app/forms';
	import { page } from '$app/state';
	import { resolve } from '$app/paths';
	import { breadcrumb } from '$lib/stores/breadcrumb';
	import type { LessonBlock } from '$lib/types/lesson';
	import {
		ArrowDown,
		ArrowRight,
		ArrowUp,
		BookOpenText,
		Bot,
		CheckCircle2,
		Flag,
		ListChecks,
		Paperclip,
		Plus,
		Route,
		Settings2,
		Trash2
	} from 'lucide-svelte';

	let { data, form }: PageProps = $props();

	let name = $state(data.activity.name);
	let description = $state(data.activity.description ?? '');
	let status = $state(data.activity.status);
	let sessionPolicy = $state(data.lessonConfig.sessionPolicy);
	let allowRestart = $state(data.lessonConfig.allowRestart);
	let isMetaDirty = $state(false);
	let metaSaved = $state(false);

	const cid = $derived(page.params.cid);
	const ilid = $derived(page.params.ilid);
	const resourcesCount = $derived(data.files.length);

	function markMetaDirty() {
		isMetaDirty = true;
		metaSaved = false;
	}

	function blockIcon(block: LessonBlock) {
		if (block.kind === 'content') return BookOpenText;
		if (block.kind === 'choice') return ListChecks;
		if (block.kind === 'agent') return Bot;
		return Flag;
	}

	function blockKindLabel(block: LessonBlock) {
		if (block.kind === 'content') return 'Contenido';
		if (block.kind === 'choice') return 'Decisión';
		if (block.kind === 'agent') return 'IA';
		return 'Final';
	}

	function blockSummary(block: LessonBlock) {
		if (block.kind === 'choice') {
			return `${block.options.length} opción${block.options.length === 1 ? '' : 'es'} · salida ${block.outputKey || 'selection'}`;
		}

		if (block.kind === 'end') {
			return 'Bloque terminal';
		}

		const branches = block.branches?.length ?? 0;
		return `${block.next ? `siguiente: ${block.next}` : 'sin siguiente'}${branches ? ` · ${branches} rama${branches === 1 ? '' : 's'}` : ''}`;
	}

	function graphSummary(blockId: string) {
		return data.graphSummaries.find((summary) => summary.blockId === blockId);
	}

	function exposedFieldCount(blockId: string) {
		const summary = graphSummary(blockId);
		if (!summary) return 0;
		return summary.contracts.state.length + summary.contracts.outputs.length;
	}

	function confirmDelete(event: SubmitEvent, blockTitle: string) {
		if (!window.confirm(`Vas a eliminar "${blockTitle}". Esta acción no se puede deshacer.`)) {
			event.preventDefault();
		}
	}

	$effect(() => {
		breadcrumb.set([
			{ label: 'Inicio', href: '/' },
			{ label: 'Cursos', href: '/course' },
			{ label: 'Curso', href: `/course/${page.params.cid}` },
			{ label: 'Interactivos', href: `/course/${page.params.cid}/admin/interactives` },
			{
				label: name || 'Actividad',
				href: `/course/${page.params.cid}/admin/interactives/${page.params.ilid}`
			},
			{ label: 'Editor lesson' }
		]);
	});

	$effect(() => {
		if (!form?.success) return;

		name = data.activity.name;
		description = data.activity.description ?? '';
		status = data.activity.status;
		sessionPolicy = data.lessonConfig.sessionPolicy;
		allowRestart = data.lessonConfig.allowRestart;
	});
</script>

<div class="space-y-6">
	<div
		class="rounded-2xl bg-linear-to-br from-amber-100 via-orange-50 to-white p-6 shadow-sm ring-1 ring-amber-200/70 dark:from-amber-950/30 dark:via-gray-900 dark:to-gray-900 dark:ring-amber-900/40"
	>
		<div class="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
			<div class="max-w-3xl">
				<div class="mb-3 flex items-center gap-3">
					<div class="rounded-2xl bg-amber-500/15 p-3 text-amber-700 dark:text-amber-300">
						<Route class="h-5 w-5" />
					</div>
					<div>
						<p
							class="text-sm font-medium tracking-[0.18em] text-amber-800/70 uppercase dark:text-amber-200/70"
						>
							Lección viva
						</p>
						<h1 class="text-2xl font-semibold text-gray-900 dark:text-white">
							{name}
						</h1>
					</div>
				</div>
				<p class="text-sm leading-6 text-gray-600 dark:text-gray-300">
					La portada de lesson queda reservada para la estructura general: metadatos, política de
					sesión, orden de bloques y accesos rápidos al editor especializado de cada bloque.
				</p>
				<div
					class="mt-4 rounded-2xl border border-amber-200/80 bg-white/70 px-4 py-3 text-sm text-amber-900 shadow-sm dark:border-amber-900/50 dark:bg-gray-950/40 dark:text-amber-100"
				>
					<p class="font-medium">El orden de esta lista ya no define el flujo.</p>
					<p class="mt-1 text-amber-800/80 dark:text-amber-100/80">
						El runtime sigue las conexiones del grafo y reutiliza la última visita de cada bloque,
						así que aquí solo mantenemos una vista editorial cómoda.
					</p>
				</div>
			</div>

			<div class="grid gap-3 sm:grid-cols-3">
				<div
					class="rounded-2xl bg-white/80 px-4 py-3 shadow-sm ring-1 ring-gray-200/70 backdrop-blur dark:bg-gray-900/60 dark:ring-gray-800"
				>
					<p class="text-xs tracking-[0.16em] text-gray-500 uppercase dark:text-gray-400">
						Bloques
					</p>
					<p class="mt-1 text-2xl font-semibold text-gray-900 dark:text-white">
						{data.definition.blocks.length}
					</p>
				</div>
				<div
					class="rounded-2xl bg-white/80 px-4 py-3 shadow-sm ring-1 ring-gray-200/70 backdrop-blur dark:bg-gray-900/60 dark:ring-gray-800"
				>
					<p class="text-xs tracking-[0.16em] text-gray-500 uppercase dark:text-gray-400">
						Entrada
					</p>
					<p class="mt-1 truncate text-sm font-semibold text-gray-900 dark:text-white">
						{data.definition.entryBlockId}
					</p>
				</div>
				<div
					class="rounded-2xl bg-white/80 px-4 py-3 shadow-sm ring-1 ring-gray-200/70 backdrop-blur dark:bg-gray-900/60 dark:ring-gray-800"
				>
					<p class="text-xs tracking-[0.16em] text-gray-500 uppercase dark:text-gray-400">
						Recursos
					</p>
					<p class="mt-1 text-2xl font-semibold text-gray-900 dark:text-white">
						{resourcesCount}
					</p>
				</div>
			</div>
		</div>
	</div>

	{#if form?.error}
		<div
			class="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800 dark:border-red-900/40 dark:bg-red-950/20 dark:text-red-200"
		>
			{form.error}
		</div>
	{/if}

	<div class="grid gap-6 xl:grid-cols-[minmax(0,1.5fr)_minmax(320px,0.9fr)]">
		<div class="space-y-6">
			<div
				class="rounded-2xl bg-white p-6 shadow-sm ring-1 ring-gray-200/80 dark:bg-gray-900/40 dark:ring-gray-800"
			>
				<div class="mb-5 flex items-start justify-between gap-4">
					<div>
						<h2 class="text-lg font-semibold text-gray-900 dark:text-white">Configuración base</h2>
						<p class="text-sm text-gray-500 dark:text-gray-400">
							Solo los campos comunes de la actividad y el runtime global de la lesson.
						</p>
					</div>
					<div
						class="rounded-full bg-gray-100 px-3 py-1 text-xs font-medium text-gray-600 dark:bg-gray-800 dark:text-gray-300"
					>
						<Settings2 class="mr-1 inline h-3.5 w-3.5" />
						Portada mínima
					</div>
				</div>

				<form
					method="POST"
					action="?/updateLessonMeta"
					use:enhance={() => {
						return async ({ result, update }) => {
							await update();
							if (result.type === 'success') {
								isMetaDirty = false;
								metaSaved = true;
							}
						};
					}}
					class="space-y-5"
				>
					<div class="grid gap-4 md:grid-cols-2">
						<label class="block">
							<span class="mb-2 block text-sm font-medium text-gray-700 dark:text-gray-300"
								>Nombre</span
							>
							<input
								class="w-full rounded-xl border border-gray-300 bg-white px-3 py-2.5 text-sm dark:border-gray-700 dark:bg-gray-950 dark:text-white"
								name="name"
								bind:value={name}
								oninput={markMetaDirty}
							/>
						</label>

						<label class="block">
							<span class="mb-2 block text-sm font-medium text-gray-700 dark:text-gray-300"
								>Estado</span
							>
							<select
								class="w-full rounded-xl border border-gray-300 bg-white px-3 py-2.5 text-sm dark:border-gray-700 dark:bg-gray-950 dark:text-white"
								name="status"
								bind:value={status}
								onchange={markMetaDirty}
							>
								<option value="hidden">Oculta</option>
								<option value="published">Publicada</option>
								<option value="closed">Cerrada</option>
								<option value="archived">Archivada</option>
							</select>
						</label>
					</div>

					<label class="block">
						<span class="mb-2 block text-sm font-medium text-gray-700 dark:text-gray-300"
							>Descripción</span
						>
						<textarea
							class="min-h-28 w-full rounded-xl border border-gray-300 bg-white px-3 py-2.5 text-sm dark:border-gray-700 dark:bg-gray-950 dark:text-white"
							name="description"
							bind:value={description}
							oninput={markMetaDirty}
						></textarea>
					</label>

					<div class="grid gap-4 md:grid-cols-2">
						<label class="block">
							<span class="mb-2 block text-sm font-medium text-gray-700 dark:text-gray-300"
								>Política de sesión</span
							>
							<select
								class="w-full rounded-xl border border-gray-300 bg-white px-3 py-2.5 text-sm dark:border-gray-700 dark:bg-gray-950 dark:text-white"
								name="sessionPolicy"
								bind:value={sessionPolicy}
								onchange={markMetaDirty}
							>
								<option value="resume_latest">Reanudar el último intento</option>
								<option value="always_new_attempt">Crear un intento nuevo siempre</option>
							</select>
						</label>

						<label
							class="flex items-center gap-3 rounded-2xl border border-gray-200 px-4 py-3 dark:border-gray-800"
						>
							<input
								type="checkbox"
								name="allowRestart"
								bind:checked={allowRestart}
								onchange={markMetaDirty}
								class="text-primary-600 h-4 w-4 rounded border-gray-300"
							/>
							<div>
								<p class="text-sm font-medium text-gray-900 dark:text-white">Permitir reinicio</p>
								<p class="text-xs text-gray-500 dark:text-gray-400">
									Crea un intento nuevo sin perder el histórico anterior.
								</p>
							</div>
						</label>
					</div>

					<div class="flex items-center justify-between gap-4">
						<div>
							{#if metaSaved}
								<p class="text-sm text-green-700 dark:text-green-300">
									<CheckCircle2 class="mr-1 inline h-4 w-4" />
									Cambios guardados correctamente.
								</p>
							{:else if isMetaDirty}
								<p class="text-sm text-amber-700 dark:text-amber-300">
									Hay cambios sin guardar en la portada.
								</p>
							{/if}
						</div>
						<button
							class="bg-primary-600 hover:bg-primary-700 rounded-xl px-4 py-2.5 text-sm font-medium text-white"
						>
							Guardar portada
						</button>
					</div>
				</form>
			</div>

			<div
				class="rounded-2xl bg-white p-6 shadow-sm ring-1 ring-gray-200/80 dark:bg-gray-900/40 dark:ring-gray-800"
			>
				<div class="mb-5 flex flex-wrap items-start justify-between gap-4">
					<div>
						<h2 class="text-lg font-semibold text-gray-900 dark:text-white">Bloques</h2>
						<p class="text-sm text-gray-500 dark:text-gray-400">
							Ordena el flujo, marca la entrada y abre el editor dedicado de cada bloque.
						</p>
					</div>

					<div class="flex flex-wrap gap-2">
						<a
							href={resolve(`/course/${cid}/admin/interactives/${ilid}/lessonedit/flow`)}
							class="border-primary-200 bg-primary-50 text-primary-700 hover:bg-primary-100 dark:border-primary-900/40 dark:bg-primary-950/20 dark:text-primary-300 dark:hover:bg-primary-950/30 rounded-xl border px-3 py-2 text-sm font-medium"
						>
							<Route class="mr-1 inline h-4 w-4" />
							Editor visual
						</a>
						<a
							href={resolve(
								`/course/${cid}/admin/interactives/${ilid}/lessonedit/blocks/new?kind=content`
							)}
							class="rounded-xl border border-gray-300 px-3 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 dark:border-gray-700 dark:text-gray-200 dark:hover:bg-gray-800"
						>
							<Plus class="mr-1 inline h-4 w-4" />
							Contenido
						</a>
						<a
							href={resolve(
								`/course/${cid}/admin/interactives/${ilid}/lessonedit/blocks/new?kind=choice`
							)}
							class="rounded-xl border border-gray-300 px-3 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 dark:border-gray-700 dark:text-gray-200 dark:hover:bg-gray-800"
						>
							<Plus class="mr-1 inline h-4 w-4" />
							Decisión
						</a>
						<a
							href={resolve(
								`/course/${cid}/admin/interactives/${ilid}/lessonedit/blocks/new?kind=agent`
							)}
							class="rounded-xl border border-gray-300 px-3 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 dark:border-gray-700 dark:text-gray-200 dark:hover:bg-gray-800"
						>
							<Plus class="mr-1 inline h-4 w-4" />
							IA
						</a>
						<a
							href={resolve(
								`/course/${cid}/admin/interactives/${ilid}/lessonedit/blocks/new?kind=end`
							)}
							class="rounded-xl border border-gray-300 px-3 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 dark:border-gray-700 dark:text-gray-200 dark:hover:bg-gray-800"
						>
							<Plus class="mr-1 inline h-4 w-4" />
							Final
						</a>
					</div>
				</div>

				<div class="space-y-3">
					{#each data.definition.blocks as block, index (block.id)}
						{@const Icon = blockIcon(block)}
						{@const summary = graphSummary(block.id)}
						<div class="rounded-2xl border border-gray-200 p-4 dark:border-gray-800">
							<div class="flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between">
								<div class="flex min-w-0 items-start gap-4">
									<div
										class="rounded-2xl bg-gray-100 p-3 text-gray-700 dark:bg-gray-800 dark:text-gray-200"
									>
										<Icon class="h-5 w-5" />
									</div>

									<div class="min-w-0">
										<div class="flex flex-wrap items-center gap-2">
											<h3 class="truncate text-base font-semibold text-gray-900 dark:text-white">
												{block.title}
											</h3>
											<span
												class="rounded-full bg-gray-100 px-2.5 py-1 text-xs font-medium text-gray-600 dark:bg-gray-800 dark:text-gray-300"
											>
												{blockKindLabel(block)}
											</span>
											{#if data.definition.entryBlockId === block.id}
												<span
													class="rounded-full bg-emerald-100 px-2.5 py-1 text-xs font-medium text-emerald-700 dark:bg-emerald-950/30 dark:text-emerald-300"
												>
													Entrada
												</span>
											{/if}
										</div>
										<p class="mt-1 font-mono text-xs text-gray-500 dark:text-gray-400">
											{block.id}
										</p>
										<p class="mt-2 text-sm text-gray-600 dark:text-gray-300">
											{blockSummary(block)}
										</p>
										<div class="mt-3 flex flex-wrap gap-2">
											<span
												class="rounded-full bg-sky-100 px-2.5 py-1 text-xs font-medium text-sky-700 dark:bg-sky-950/30 dark:text-sky-300"
											>
												Entradas {summary?.incomingBlockIds.length ?? 0}
											</span>
											<span
												class="rounded-full bg-emerald-100 px-2.5 py-1 text-xs font-medium text-emerald-700 dark:bg-emerald-950/30 dark:text-emerald-300"
											>
												Salidas {summary?.outgoingBlockIds.length ?? 0}
											</span>
											<span
												class="rounded-full bg-violet-100 px-2.5 py-1 text-xs font-medium text-violet-700 dark:bg-violet-950/30 dark:text-violet-300"
											>
												Expone {exposedFieldCount(block.id)} referencias
											</span>
										</div>
										{#if summary}
											<div
												class="mt-3 grid gap-3 text-xs text-gray-500 sm:grid-cols-2 dark:text-gray-400"
											>
												<div class="rounded-2xl bg-gray-50 px-3 py-3 dark:bg-gray-950/40">
													<p
														class="mb-2 font-medium tracking-[0.12em] text-gray-500 uppercase dark:text-gray-400"
													>
														Llega desde
													</p>
													<div class="flex flex-wrap gap-2">
														{#if summary.incomingBlockIds.length}
															{#each summary.incomingBlockIds as sourceId (sourceId)}
																<span
																	class="rounded-full border border-gray-200 px-2.5 py-1 font-mono text-[11px] text-gray-600 dark:border-gray-800 dark:text-gray-300"
																>
																	{sourceId}
																</span>
															{/each}
														{:else}
															<span>Sin conexiones entrantes.</span>
														{/if}
													</div>
												</div>
												<div class="rounded-2xl bg-gray-50 px-3 py-3 dark:bg-gray-950/40">
													<p
														class="mb-2 font-medium tracking-[0.12em] text-gray-500 uppercase dark:text-gray-400"
													>
														Apunta a
													</p>
													<div class="flex flex-wrap gap-2">
														{#if summary.outgoingBlockIds.length}
															{#each summary.outgoingBlockIds as targetId (targetId)}
																<span
																	class="rounded-full border border-gray-200 px-2.5 py-1 font-mono text-[11px] text-gray-600 dark:border-gray-800 dark:text-gray-300"
																>
																	{targetId}
																</span>
															{/each}
														{:else}
															<span>Sin conexiones salientes.</span>
														{/if}
													</div>
												</div>
											</div>
										{/if}
									</div>
								</div>

								<div class="flex flex-wrap gap-2">
									<a
										href={resolve(
											`/course/${cid}/admin/interactives/${ilid}/lessonedit/blocks/${block.id}`
										)}
										class="bg-primary-600 hover:bg-primary-700 rounded-xl px-3 py-2 text-sm font-medium text-white"
									>
										Editar
									</a>

									<form method="POST" action="?/reorderBlocks">
										<input type="hidden" name="blockId" value={block.id} />
										<input type="hidden" name="direction" value="up" />
										<button
											class="rounded-xl border border-gray-300 px-3 py-2 text-sm text-gray-700 hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-50 dark:border-gray-700 dark:text-gray-200 dark:hover:bg-gray-800"
											disabled={index === 0}
										>
											<ArrowUp class="h-4 w-4" />
										</button>
									</form>

									<form method="POST" action="?/reorderBlocks">
										<input type="hidden" name="blockId" value={block.id} />
										<input type="hidden" name="direction" value="down" />
										<button
											class="rounded-xl border border-gray-300 px-3 py-2 text-sm text-gray-700 hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-50 dark:border-gray-700 dark:text-gray-200 dark:hover:bg-gray-800"
											disabled={index === data.definition.blocks.length - 1}
										>
											<ArrowDown class="h-4 w-4" />
										</button>
									</form>

									<form method="POST" action="?/setEntryBlock">
										<input type="hidden" name="blockId" value={block.id} />
										<button
											class="rounded-xl border border-gray-300 px-3 py-2 text-sm text-gray-700 hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-50 dark:border-gray-700 dark:text-gray-200 dark:hover:bg-gray-800"
											disabled={data.definition.entryBlockId === block.id}
										>
											Entrada
										</button>
									</form>

									<form
										method="POST"
										action="?/deleteBlock"
										onsubmit={(event) => confirmDelete(event, block.title)}
									>
										<input type="hidden" name="blockId" value={block.id} />
										<button
											class="rounded-xl border border-red-200 px-3 py-2 text-sm text-red-700 hover:bg-red-50 dark:border-red-900/40 dark:text-red-300 dark:hover:bg-red-950/20"
										>
											<Trash2 class="mr-1 inline h-4 w-4" />
											Eliminar
										</button>
									</form>
								</div>
							</div>
						</div>
					{/each}
				</div>
			</div>
		</div>

		<div class="space-y-6">
			<div
				class="rounded-2xl bg-white p-6 shadow-sm ring-1 ring-gray-200/80 dark:bg-gray-900/40 dark:ring-gray-800"
			>
				<div class="mb-4 flex items-center gap-3">
					<div class="rounded-2xl bg-sky-100 p-3 text-sky-700 dark:bg-sky-950/30 dark:text-sky-300">
						<Paperclip class="h-5 w-5" />
					</div>
					<div>
						<h2 class="text-lg font-semibold text-gray-900 dark:text-white">Recursos</h2>
						<p class="text-sm text-gray-500 dark:text-gray-400">
							Las subidas manuales viven en su propia página.
						</p>
					</div>
				</div>

				<p class="text-sm leading-6 text-gray-600 dark:text-gray-300">
					Ahora la portada solo muestra el resumen de recursos. La gestión completa de imágenes y
					documentos se hace en una vista separada para no mezclar authoring de contenido con
					storage.
				</p>

				<div
					class="mt-5 flex items-center justify-between rounded-2xl border border-gray-200 px-4 py-4 dark:border-gray-800"
				>
					<div>
						<p class="text-xs tracking-[0.16em] text-gray-500 uppercase dark:text-gray-400">
							Recursos disponibles
						</p>
						<p class="mt-1 text-2xl font-semibold text-gray-900 dark:text-white">
							{resourcesCount}
						</p>
					</div>
					<a
						href={resolve(`/course/${cid}/admin/interactives/${ilid}/lessonedit/resources`)}
						class="rounded-xl bg-gray-900 px-4 py-2.5 text-sm font-medium text-white hover:bg-gray-800 dark:bg-white dark:text-gray-900 dark:hover:bg-gray-100"
					>
						Abrir recursos
						<ArrowRight class="ml-1 inline h-4 w-4" />
					</a>
				</div>
			</div>

			<div
				class="rounded-2xl bg-white p-6 shadow-sm ring-1 ring-gray-200/80 dark:bg-gray-900/40 dark:ring-gray-800"
			>
				<h2 class="text-lg font-semibold text-gray-900 dark:text-white">Siguiente paso</h2>
				<p class="mt-2 text-sm leading-6 text-gray-600 dark:text-gray-300">
					Usa el editor de bloque para trabajar el contenido real. Ahí es donde vive el markdown
					rico, el branching detallado, la configuración IA y el pegado directo de imágenes.
				</p>

				{#if data.definition.blocks[0]}
					<a
						href={resolve(
							`/course/${cid}/admin/interactives/${ilid}/lessonedit/blocks/${data.definition.blocks[0].id}`
						)}
						class="mt-5 inline-flex items-center rounded-xl border border-gray-300 px-4 py-2.5 text-sm font-medium text-gray-700 hover:bg-gray-50 dark:border-gray-700 dark:text-gray-200 dark:hover:bg-gray-800"
					>
						Editar primer bloque
						<ArrowRight class="ml-1 h-4 w-4" />
					</a>
				{/if}
			</div>
		</div>
	</div>
</div>
