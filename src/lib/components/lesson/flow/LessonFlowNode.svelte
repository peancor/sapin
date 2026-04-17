<script lang="ts">
	import { Handle, Position, type NodeProps } from '@xyflow/svelte';
	import { BookOpenText, Bot, Flag, GitBranch, ListChecks } from 'lucide-svelte';
	import type { LessonFlowNode } from '../../../types/lessonFlow';

	let { data, selected = false }: NodeProps<LessonFlowNode> = $props();

	const kindStyles = {
		content: {
			surface:
				'border-stone-300/90 bg-linear-to-br from-white via-amber-50/60 to-orange-50/70 text-stone-900',
			accent: 'bg-amber-100 text-amber-800 ring-amber-200',
			handle: '!bg-amber-500'
		},
		choice: {
			surface:
				'border-teal-300/90 bg-linear-to-br from-white via-teal-50/70 to-cyan-50/60 text-stone-900',
			accent: 'bg-teal-100 text-teal-800 ring-teal-200',
			handle: '!bg-teal-500'
		},
		agent: {
			surface:
				'border-indigo-300/90 bg-linear-to-br from-white via-indigo-50/70 to-sky-50/60 text-stone-900',
			accent: 'bg-indigo-100 text-indigo-800 ring-indigo-200',
			handle: '!bg-indigo-500'
		},
		end: {
			surface:
				'border-rose-300/90 bg-linear-to-br from-white via-rose-50/70 to-pink-50/60 text-stone-900',
			accent: 'bg-rose-100 text-rose-800 ring-rose-200',
			handle: '!bg-rose-500'
		}
	} as const;

	function iconFor(kind: LessonFlowNode['data']['kind']) {
		if (kind === 'content') return BookOpenText;
		if (kind === 'choice') return ListChecks;
		if (kind === 'agent') return Bot;
		return Flag;
	}

	function handleOffset(index: number, total: number) {
		if (total <= 1) return '50%';
		const horizontalPadding = total === 2 ? 24 : 12;
		const availableWidth = 100 - horizontalPadding * 2;
		return `${horizontalPadding + (index / (total - 1)) * availableWidth}%`;
	}

	function handleClass(handle: LessonFlowNode['data']['incomingHandles'][number]) {
		const baseClass =
			'h-6 w-6 border-[3px] shadow-[0_10px_22px_-16px_rgba(24,24,27,0.65)] ring-4 ring-white/90 transition-transform hover:scale-110';

		if (handle.incomingKind === 'add') {
			return `${baseClass} !border-stone-400 !bg-white/95`;
		}

		return `${baseClass} ${style.handle}`;
	}

	let Icon = $derived(iconFor(data.kind));
	let style = $derived(kindStyles[data.kind]);
</script>

<div class="relative w-[280px] py-5">
	{#each data.incomingHandles as handle, index (handle.id)}
		{@const left = handleOffset(index, data.incomingHandles.length)}
		<Handle
			id={handle.id}
			type="target"
			position={Position.Top}
			class={handleClass(handle)}
			style={`left:${left};top:0;transform:translate(-50%,-50%);`}
		/>
		{#if handle.incomingKind === 'add'}
			<div
				class="pointer-events-none absolute z-10 flex h-6 w-6 items-center justify-center rounded-full border-[3px] border-stone-400 bg-white/95 text-[15px] font-bold text-stone-500 ring-4 ring-white/90"
				style={`left:${left};top:0;transform:translate(-50%,-50%);`}
			>
				+
			</div>
		{/if}
	{/each}

	<article
		class={`w-[280px] rounded-[28px] border px-4 py-4 shadow-[0_22px_40px_-24px_rgba(24,24,27,0.38)] transition-all ${style.surface} ${
			selected
				? 'ring-primary-500/80 ring-2 ring-offset-2 ring-offset-white dark:ring-offset-gray-950'
				: ''
		}`}
	>
		<div class="flex items-start justify-between gap-3">
			<div class={`rounded-2xl p-3 ring-1 ${style.accent}`}>
				<Icon class="h-5 w-5" />
			</div>
			<div
				class="flex flex-wrap justify-end gap-2 text-[11px] font-semibold tracking-[0.14em] uppercase"
			>
				<span class="rounded-full bg-white/90 px-2.5 py-1 text-stone-500 ring-1 ring-stone-200">
					{data.kindLabel}
				</span>
				{#if data.isEntry}
					<span
						class="rounded-full bg-emerald-100 px-2.5 py-1 text-emerald-700 ring-1 ring-emerald-200"
					>
						Entrada
					</span>
				{/if}
			</div>
		</div>

		<div class="mt-4 space-y-2">
			<h3 class="line-clamp-2 text-[15px] leading-5 font-semibold text-stone-900">
				{data.title}
			</h3>
			<p class="line-clamp-2 text-[13px] leading-5 text-stone-600">{data.summary}</p>
		</div>

		<div class="mt-4 grid grid-cols-2 gap-3 text-xs text-stone-600">
			<div class="rounded-2xl bg-white/80 px-3 py-2 ring-1 ring-stone-200/80">
				<p class="text-[11px] font-semibold tracking-[0.14em] text-stone-500 uppercase">Entradas</p>
				<p class="mt-1 text-base font-semibold text-stone-900">{data.incomingCount}</p>
			</div>
			<div class="rounded-2xl bg-white/80 px-3 py-2 ring-1 ring-stone-200/80">
				<p class="text-[11px] font-semibold tracking-[0.14em] text-stone-500 uppercase">Salidas</p>
				<p class="mt-1 text-base font-semibold text-stone-900">{data.outgoingCount}</p>
			</div>
		</div>

		{#if data.kind === 'choice'}
			<div
				class="mt-4 flex items-center gap-2 rounded-2xl bg-teal-950/[0.035] px-3 py-2 text-xs text-teal-800 ring-1 ring-teal-200/80"
			>
				<GitBranch class="h-3.5 w-3.5" />
				<span>Las opciones viven en el inspector lateral.</span>
			</div>
		{/if}
	</article>

	{#each data.outgoingHandles as handle, index (handle.id)}
		<Handle
			id={handle.id}
			type="source"
			position={Position.Bottom}
			class={`h-6 w-6 border-[3px] shadow-[0_10px_22px_-16px_rgba(24,24,27,0.65)] ring-4 ring-white/90 transition-transform hover:scale-110 ${style.handle}`}
			style={`left:${handleOffset(index, data.outgoingHandles.length)};bottom:0;transform:translate(-50%,50%);`}
		/>
	{/each}
</div>
