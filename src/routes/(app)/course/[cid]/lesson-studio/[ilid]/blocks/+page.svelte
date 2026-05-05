<script lang="ts">
	/* eslint-disable svelte/no-navigation-without-resolve */
	import type { PageProps } from './$types';
	import { page } from '$app/state';
	import { breadcrumb } from '$lib/stores/breadcrumb';
	import {
		BookOpenText,
		Bot,
		CircleCheck,
		Flag,
		GitBranch,
		ListChecks,
		MapPinned,
		Pencil,
		Route,
		TriangleAlert,
		Youtube
	} from 'lucide-svelte';
	import {
		lessonBlockHref,
		lessonDebuggerHref,
		lessonFlowHref
	} from '$lib/lesson/lessonStudioNavigation';
	import type { LessonBlock, LessonBlockGraphSummary, LessonBlockKind } from '$lib/types/lesson';

	type InventoryItem = {
		block: LessonBlock;
		summary: LessonBlockGraphSummary | null;
		isEntry: boolean;
		isReachable: boolean;
		issues: string[];
		contentLabel: string;
	};

	let { data }: PageProps = $props();

	const cid = $derived(page.params.cid ?? '');
	const ilid = $derived(page.params.ilid ?? '');
	const flowHref = $derived(lessonFlowHref({ cid, ilid }));

	const graphByBlockId = $derived.by(() => {
		const summaries: Record<string, LessonBlockGraphSummary> = {};
		for (const summary of data.graphSummaries) {
			summaries[summary.blockId] = summary;
		}
		return summaries;
	});

	const reachableBlockIds = $derived.by(() => {
		const reachable: string[] = [];
		const queue = data.definition.entryBlockId ? [data.definition.entryBlockId] : [];

		while (queue.length > 0) {
			const blockId = queue.shift();
			if (!blockId || reachable.includes(blockId)) continue;

			reachable.push(blockId);
			const summary = graphByBlockId[blockId];
			for (const outgoingBlockId of summary?.outgoingBlockIds ?? []) {
				if (!reachable.includes(outgoingBlockId)) queue.push(outgoingBlockId);
			}
		}

		return reachable;
	});

	const inventory = $derived.by(() =>
		data.definition.blocks.map((block): InventoryItem => {
			const summary = graphByBlockId[block.id] ?? null;
			const isEntry = data.definition.entryBlockId === block.id;
			const isReachable = reachableBlockIds.includes(block.id);
			const issues = getBlockIssues(block, summary, isEntry, isReachable);

			return {
				block,
				summary,
				isEntry,
				isReachable,
				issues,
				contentLabel: getBlockContentLabel(block)
			};
		})
	);

	const issueItems = $derived(inventory.filter((item) => item.issues.length > 0));
	const orphanCount = $derived(
		inventory.filter((item) => !item.isEntry && (item.summary?.incomingBlockIds.length ?? 0) === 0)
			.length
	);
	const unreachableCount = $derived(inventory.filter((item) => !item.isReachable).length);
	const deadEndCount = $derived(
		inventory.filter(
			(item) => item.block.kind !== 'end' && (item.summary?.outgoingBlockIds.length ?? 0) === 0
		).length
	);
	const emptyContentCount = $derived(
		inventory.filter((item) => !hasMeaningfulContent(item.block)).length
	);
	const kindStats = $derived.by(() =>
		(['content', 'choice', 'check', 'agent', 'youtube', 'end'] as LessonBlockKind[]).map(
			(kind) => ({
				kind,
				label: getBlockKindMeta(kind).label,
				count: data.definition.blocks.filter((block) => block.kind === kind).length
			})
		)
	);

	function getBlockKindMeta(kind: LessonBlockKind) {
		switch (kind) {
			case 'content':
				return { label: 'Contenido', icon: BookOpenText };
			case 'choice':
				return { label: 'Decisión', icon: ListChecks };
			case 'check':
				return { label: 'Evaluación', icon: CircleCheck };
			case 'agent':
				return { label: 'Tutor IA', icon: Bot };
			case 'youtube':
				return { label: 'YouTube', icon: Youtube };
			case 'end':
				return { label: 'Final', icon: Flag };
		}
	}

	function hasMeaningfulContent(block: LessonBlock) {
		if (block.kind === 'content') return Boolean(block.body.trim());
		if (block.kind === 'choice') return block.options.length > 0;
		if (block.kind === 'check') return block.checkConfig.questions.length > 0;
		if (block.kind === 'agent') {
			return Boolean(block.body?.trim() || block.agentConfig.promptTemplate.trim());
		}
		if (block.kind === 'youtube') return Boolean(block.videoId.trim());
		return Boolean(block.body?.trim() || block.ctaLabel?.trim());
	}

	function getBlockContentLabel(block: LessonBlock) {
		if (block.kind === 'content') return block.body.trim() ? 'Contenido redactado' : 'Sin texto';
		if (block.kind === 'choice') {
			return `${block.options.length} opcion${block.options.length === 1 ? '' : 'es'}`;
		}
		if (block.kind === 'check') {
			return `${block.checkConfig.questions.length} pregunta${
				block.checkConfig.questions.length === 1 ? '' : 's'
			}`;
		}
		if (block.kind === 'agent') {
			if (block.agentConfig.runtimeMode === 'agent') return 'Modo agente';
			return block.agentConfig.promptTemplate.trim() ? 'Prompt definido' : 'Sin prompt';
		}
		if (block.kind === 'youtube') return block.videoId.trim() ? 'Video definido' : 'Sin video';
		return block.body?.trim() ? 'Cierre redactado' : 'Sin cierre';
	}

	function getBlockIssues(
		block: LessonBlock,
		summary: LessonBlockGraphSummary | null,
		isEntry: boolean,
		isReachable: boolean
	) {
		const issues: string[] = [];
		const incomingCount = summary?.incomingBlockIds.length ?? 0;
		const outgoingCount = summary?.outgoingBlockIds.length ?? 0;

		if (!isReachable) issues.push('No alcanzable desde la entrada');
		if (!isEntry && incomingCount === 0) issues.push('Sin entrada desde el mapa');
		if (block.kind !== 'end' && outgoingCount === 0) issues.push('Sin salida');
		if (!hasMeaningfulContent(block)) issues.push('Contenido incompleto');

		return issues;
	}

	$effect(() => {
		breadcrumb.set([
			{ label: 'Inicio', href: '/' },
			{ label: 'Cursos', href: '/course' },
			{ label: 'Curso', href: `/course/${page.params.cid}` },
			{ label: 'Interactivos', href: `/course/${page.params.cid}/admin/interactives` },
			{
				label: data.activity.name,
				href: `/course/${page.params.cid}/admin/interactives/${page.params.ilid}`
			},
			{
				label: 'Editor lesson',
				href: `/course/${page.params.cid}/lesson-studio/${page.params.ilid}`
			},
			{ label: 'Estructura' }
		]);
	});
</script>

<div class="min-h-full space-y-6 p-4 sm:p-6 lg:p-8">
	<div
		class="rounded-2xl bg-white p-6 shadow-sm ring-1 ring-gray-200/80 dark:bg-gray-900/40 dark:ring-gray-800"
	>
		<div class="flex flex-col gap-5 lg:flex-row lg:items-start lg:justify-between">
			<div class="max-w-3xl">
				<div class="flex items-center gap-3">
					<div
						class="rounded-2xl bg-emerald-100 p-3 text-emerald-700 dark:bg-emerald-950/30 dark:text-emerald-300"
					>
						<MapPinned class="h-5 w-5" />
					</div>
					<div>
						<p class="text-sm tracking-[0.18em] text-gray-500 uppercase dark:text-gray-400">
							Inventario
						</p>
						<h1 class="text-2xl font-semibold text-gray-900 dark:text-white">
							Estructura de bloques
						</h1>
					</div>
				</div>
				<p class="mt-4 text-sm leading-6 text-gray-600 dark:text-gray-300">
					La creación y el cableado viven en el mapa. Esta vista sirve para navegar, revisar
					cobertura y localizar bloques que necesitan atención.
				</p>
			</div>

			<a
				href={flowHref}
				class="bg-primary-600 hover:bg-primary-700 inline-flex items-center justify-center rounded-xl px-4 py-2.5 text-sm font-semibold text-white shadow-sm"
			>
				<Route class="mr-2 h-4 w-4" />
				Abrir mapa
			</a>
		</div>

		<div class="mt-6 grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
			<div class="rounded-2xl border border-gray-200 px-4 py-4 dark:border-gray-800">
				<p class="text-xs tracking-[0.16em] text-gray-500 uppercase dark:text-gray-400">Bloques</p>
				<p class="mt-1 text-2xl font-semibold text-gray-900 dark:text-white">
					{data.definition.blocks.length}
				</p>
			</div>
			<div class="rounded-2xl border border-gray-200 px-4 py-4 dark:border-gray-800">
				<p class="text-xs tracking-[0.16em] text-gray-500 uppercase dark:text-gray-400">
					Incidencias
				</p>
				<p class="mt-1 text-2xl font-semibold text-gray-900 dark:text-white">
					{issueItems.length}
				</p>
			</div>
			<div class="rounded-2xl border border-gray-200 px-4 py-4 dark:border-gray-800">
				<p class="text-xs tracking-[0.16em] text-gray-500 uppercase dark:text-gray-400">
					Huérfanos
				</p>
				<p class="mt-1 text-2xl font-semibold text-gray-900 dark:text-white">
					{orphanCount}
				</p>
			</div>
			<div class="rounded-2xl border border-gray-200 px-4 py-4 dark:border-gray-800">
				<p class="text-xs tracking-[0.16em] text-gray-500 uppercase dark:text-gray-400">
					No alcanzables
				</p>
				<p class="mt-1 text-2xl font-semibold text-gray-900 dark:text-white">
					{unreachableCount}
				</p>
			</div>
			<div class="rounded-2xl border border-gray-200 px-4 py-4 dark:border-gray-800">
				<p class="text-xs tracking-[0.16em] text-gray-500 uppercase dark:text-gray-400">
					Sin salida
				</p>
				<p class="mt-1 text-2xl font-semibold text-gray-900 dark:text-white">
					{deadEndCount}
				</p>
			</div>
		</div>
	</div>

	<div class="grid gap-6 xl:grid-cols-[minmax(0,1fr)_320px]">
		<section
			class="rounded-2xl bg-white p-6 shadow-sm ring-1 ring-gray-200/80 dark:bg-gray-900/40 dark:ring-gray-800"
		>
			<div class="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
				<div>
					<h2 class="text-lg font-semibold text-gray-900 dark:text-white">Bloques del borrador</h2>
					<p class="mt-1 text-sm text-gray-500 dark:text-gray-400">
						Selecciona un bloque para enfocarlo en el mapa o abre su editor profundo.
					</p>
				</div>
				{#if emptyContentCount > 0}
					<span
						class="inline-flex items-center rounded-full bg-amber-50 px-3 py-1 text-xs font-semibold text-amber-800 ring-1 ring-amber-200 dark:bg-amber-950/25 dark:text-amber-200 dark:ring-amber-900/40"
					>
						{emptyContentCount} incompleto{emptyContentCount === 1 ? '' : 's'}
					</span>
				{/if}
			</div>

			<div class="mt-5 overflow-hidden rounded-2xl border border-gray-200 dark:border-gray-800">
				{#each inventory as item (item.block.id)}
					{@const meta = getBlockKindMeta(item.block.kind)}
					{@const Icon = meta.icon}
					<div class="border-b border-gray-200 p-4 last:border-b-0 dark:border-gray-800">
						<div class="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
							<div class="min-w-0">
								<div class="flex min-w-0 items-center gap-3">
									<div
										class="shrink-0 rounded-xl bg-gray-100 p-2.5 text-gray-700 dark:bg-gray-800 dark:text-gray-200"
									>
										<Icon class="h-4.5 w-4.5" />
									</div>
									<div class="min-w-0">
										<div class="flex min-w-0 flex-wrap items-center gap-2">
											<h3 class="truncate text-base font-semibold text-gray-900 dark:text-white">
												{item.block.title}
											</h3>
											{#if item.isEntry}
												<span
													class="rounded-full bg-emerald-50 px-2.5 py-1 text-xs font-semibold text-emerald-700 ring-1 ring-emerald-200 dark:bg-emerald-950/25 dark:text-emerald-200 dark:ring-emerald-900/40"
												>
													Entrada
												</span>
											{/if}
											{#if item.issues.length > 0}
												<span
													class="rounded-full bg-amber-50 px-2.5 py-1 text-xs font-semibold text-amber-800 ring-1 ring-amber-200 dark:bg-amber-950/25 dark:text-amber-200 dark:ring-amber-900/40"
												>
													{item.issues.length} señal{item.issues.length === 1 ? '' : 'es'}
												</span>
											{/if}
										</div>
										<p class="mt-1 truncate text-xs text-gray-500 dark:text-gray-400">
											{meta.label} · {item.block.id} · {item.contentLabel}
										</p>
									</div>
								</div>

								<div class="mt-3 flex flex-wrap gap-2">
									<span
										class="rounded-full bg-gray-100 px-2.5 py-1 text-xs font-medium text-gray-700 dark:bg-gray-800 dark:text-gray-200"
									>
										{item.summary?.incomingBlockIds.length ?? 0} entrada{(item.summary
											?.incomingBlockIds.length ?? 0) === 1
											? ''
											: 's'}
									</span>
									<span
										class="rounded-full bg-gray-100 px-2.5 py-1 text-xs font-medium text-gray-700 dark:bg-gray-800 dark:text-gray-200"
									>
										{item.summary?.outgoingBlockIds.length ?? 0} salida{(item.summary
											?.outgoingBlockIds.length ?? 0) === 1
											? ''
											: 's'}
									</span>
									{#if item.isReachable}
										<span
											class="rounded-full bg-emerald-50 px-2.5 py-1 text-xs font-medium text-emerald-700 dark:bg-emerald-950/25 dark:text-emerald-200"
										>
											Alcanzable
										</span>
									{:else}
										<span
											class="rounded-full bg-red-50 px-2.5 py-1 text-xs font-medium text-red-700 dark:bg-red-950/25 dark:text-red-200"
										>
											No alcanzable
										</span>
									{/if}
								</div>

								{#if item.issues.length > 0}
									<div class="mt-3 flex flex-wrap gap-2">
										{#each item.issues as issue (issue)}
											<span
												class="inline-flex items-center rounded-full bg-amber-50 px-2.5 py-1 text-xs font-medium text-amber-800 ring-1 ring-amber-200 dark:bg-amber-950/25 dark:text-amber-200 dark:ring-amber-900/40"
											>
												<TriangleAlert class="mr-1 h-3.5 w-3.5" />
												{issue}
											</span>
										{/each}
									</div>
								{/if}
							</div>

							<div class="flex shrink-0 flex-wrap gap-2">
								<a
									href={lessonFlowHref({ cid, ilid }, item.block.id)}
									class="inline-flex items-center justify-center rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm font-semibold text-emerald-800 hover:bg-emerald-100 dark:border-emerald-900/40 dark:bg-emerald-950/25 dark:text-emerald-200 dark:hover:bg-emerald-950/45"
								>
									<Route class="mr-1 h-4 w-4" />
									Mapa
								</a>
								<a
									href={lessonBlockHref({ cid, ilid }, item.block.id)}
									class="inline-flex items-center justify-center rounded-xl border border-gray-300 px-3 py-2 text-sm font-semibold text-gray-700 hover:bg-gray-50 dark:border-gray-700 dark:text-gray-200 dark:hover:bg-gray-800"
								>
									<Pencil class="mr-1 h-4 w-4" />
									Editar
								</a>
							</div>
						</div>
					</div>
				{:else}
					<div class="px-4 py-8 text-sm text-gray-500 dark:text-gray-400">
						No hay bloques en el borrador. Abre el mapa para crear la estructura inicial.
					</div>
				{/each}
			</div>
		</section>

		<aside class="space-y-4">
			<section
				class="rounded-2xl bg-white p-5 shadow-sm ring-1 ring-gray-200/80 dark:bg-gray-900/40 dark:ring-gray-800"
			>
				<h2 class="text-base font-semibold text-gray-900 dark:text-white">Distribución</h2>
				<div class="mt-4 space-y-3">
					{#each kindStats as stat (stat.kind)}
						{@const meta = getBlockKindMeta(stat.kind)}
						{@const Icon = meta.icon}
						<div class="flex items-center justify-between gap-3">
							<div class="flex min-w-0 items-center gap-2">
								<Icon class="h-4 w-4 shrink-0 text-gray-500 dark:text-gray-400" />
								<span class="truncate text-sm text-gray-700 dark:text-gray-200">{stat.label}</span>
							</div>
							<span class="text-sm font-semibold text-gray-900 dark:text-white">{stat.count}</span>
						</div>
					{/each}
				</div>
			</section>

			<section
				class="rounded-2xl bg-white p-5 shadow-sm ring-1 ring-gray-200/80 dark:bg-gray-900/40 dark:ring-gray-800"
			>
				<div class="flex items-center gap-2">
					<GitBranch class="h-4 w-4 text-emerald-700 dark:text-emerald-300" />
					<h2 class="text-base font-semibold text-gray-900 dark:text-white">Autoría</h2>
				</div>
				<p class="mt-3 text-sm leading-6 text-gray-600 dark:text-gray-300">
					Los tipos nuevos se añaden desde el rail o el menú contextual del mapa para que nazcan ya
					en su posición natural y, cuando encaje, conectados a una ruta.
				</p>
				<a
					href={flowHref}
					class="mt-4 inline-flex w-full items-center justify-center rounded-xl bg-gray-900 px-4 py-2.5 text-sm font-semibold text-white hover:bg-gray-800 dark:bg-white dark:text-gray-900 dark:hover:bg-gray-100"
				>
					Abrir mapa
					<Route class="ml-2 h-4 w-4" />
				</a>
			</section>

			<section
				class="rounded-2xl bg-white p-5 shadow-sm ring-1 ring-gray-200/80 dark:bg-gray-900/40 dark:ring-gray-800"
			>
				<h2 class="text-base font-semibold text-gray-900 dark:text-white">Debug rápido</h2>
				<p class="mt-3 text-sm leading-6 text-gray-600 dark:text-gray-300">
					Para probar un bloque concreto, entra al mapa o usa el editor profundo y lanza el debugger
					desde allí.
				</p>
				<a
					href={lessonDebuggerHref({ cid, ilid }, { source: 'studio' })}
					class="mt-4 inline-flex w-full items-center justify-center rounded-xl border border-gray-300 px-4 py-2.5 text-sm font-semibold text-gray-700 hover:bg-gray-50 dark:border-gray-700 dark:text-gray-200 dark:hover:bg-gray-800"
				>
					Abrir debugger
				</a>
			</section>
		</aside>
	</div>
</div>
