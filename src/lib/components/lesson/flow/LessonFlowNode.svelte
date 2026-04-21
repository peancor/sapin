<script lang="ts">
	import { Handle, Position, type NodeProps } from '@xyflow/svelte';
	import { BookOpenText, Bot, CircleCheck, Flag, GitBranch, ListChecks } from 'lucide-svelte';
	import type { LessonFlowNode } from '../../../types/lessonFlow';

	let { data, selected = false }: NodeProps<LessonFlowNode> = $props();

	const kindConfig = {
		content: {
			band: 'bg-amber-500',
			bandText: 'text-amber-50',
			glow: 'shadow-[0_0_0_3px_rgba(245,158,11,0.55),0_22px_48px_-20px_rgba(245,158,11,0.45)]',
			handle: '!bg-amber-500',
			handleRing: '!ring-amber-200',
			footer: 'bg-amber-50/60 border-t border-amber-100/80',
			badge: 'bg-amber-100 text-amber-800 ring-amber-200/80'
		},
		choice: {
			band: 'bg-teal-500',
			bandText: 'text-teal-50',
			glow: 'shadow-[0_0_0_3px_rgba(20,184,166,0.55),0_22px_48px_-20px_rgba(20,184,166,0.4)]',
			handle: '!bg-teal-500',
			handleRing: '!ring-teal-200',
			footer: 'bg-teal-50/60 border-t border-teal-100/80',
			badge: 'bg-teal-100 text-teal-800 ring-teal-200/80'
		},
		check: {
			band: 'bg-emerald-500',
			bandText: 'text-emerald-50',
			glow: 'shadow-[0_0_0_3px_rgba(16,185,129,0.55),0_22px_48px_-20px_rgba(16,185,129,0.4)]',
			handle: '!bg-emerald-500',
			handleRing: '!ring-emerald-200',
			footer: 'bg-emerald-50/60 border-t border-emerald-100/80',
			badge: 'bg-emerald-100 text-emerald-800 ring-emerald-200/80'
		},
		agent: {
			band: 'bg-indigo-500',
			bandText: 'text-indigo-50',
			glow: 'shadow-[0_0_0_3px_rgba(99,102,241,0.55),0_22px_48px_-20px_rgba(99,102,241,0.4)]',
			handle: '!bg-indigo-500',
			handleRing: '!ring-indigo-200',
			footer: 'bg-indigo-50/60 border-t border-indigo-100/80',
			badge: 'bg-indigo-100 text-indigo-800 ring-indigo-200/80'
		},
		end: {
			band: 'bg-rose-500',
			bandText: 'text-rose-50',
			glow: 'shadow-[0_0_0_3px_rgba(244,63,94,0.55),0_22px_48px_-20px_rgba(244,63,94,0.4)]',
			handle: '!bg-rose-500',
			handleRing: '!ring-rose-200',
			footer: 'bg-rose-50/60 border-t border-rose-100/80',
			badge: 'bg-rose-100 text-rose-800 ring-rose-200/80'
		}
	} as const;

	function iconFor(kind: LessonFlowNode['data']['kind']) {
		if (kind === 'content') return BookOpenText;
		if (kind === 'choice') return ListChecks;
		if (kind === 'check') return CircleCheck;
		if (kind === 'agent') return Bot;
		return Flag;
	}

	function handleOffset(index: number, total: number) {
		if (total <= 1) return '50%';
		const horizontalPadding = total === 2 ? 28 : 16;
		const availableWidth = 100 - horizontalPadding * 2;
		return `${horizontalPadding + (index / (total - 1)) * availableWidth}%`;
	}

	function incomingHandleClass(handle: LessonFlowNode['data']['incomingHandles'][number]) {
		if (handle.incomingKind === 'add') {
			return `!h-7 !w-7 !border-2 !border-dashed !border-stone-400 !bg-white/95 !rounded-full shadow-[0_4px_12px_-4px_rgba(24,24,27,0.4)] ring-2 !ring-white/80 transition-transform hover:scale-110`;
		}
		return `!h-6 !w-6 !border-[3px] !rounded-full ${cfg.handle} ${cfg.handleRing} !ring-2 shadow-[0_4px_12px_-4px_rgba(24,24,27,0.45)] transition-transform hover:scale-110`;
	}

	let Icon = $derived(iconFor(data.kind));
	let cfg = $derived(kindConfig[data.kind]);
	let hasIncomingConnections = $derived(data.incomingCount > 0);
</script>

<div class="relative w-[272px] py-5">
	<!-- Incoming drop zone indicator -->
	{#if !hasIncomingConnections}
		<div
			class="pointer-events-none absolute inset-x-0 top-0 z-0 -translate-y-[200%] text-center text-[9px] font-semibold tracking-[0.2em] text-stone-400 uppercase"
		>
			Suelta aqui
		</div>
	{/if}

	<!-- Incoming handles -->
	{#each data.incomingHandles as handle, index (handle.id)}
		{@const left = handleOffset(index, data.incomingHandles.length)}
		<Handle
			id={handle.id}
			type="target"
			position={Position.Top}
			class={incomingHandleClass(handle)}
			style={`left:${left};top:0;transform:translate(-50%,-50%);`}
		/>
		{#if handle.incomingKind === 'add'}
			<div
				class="pointer-events-none absolute z-10 flex h-7 w-7 items-center justify-center rounded-full text-[13px] font-bold text-stone-500"
				style={`left:${left};top:0;transform:translate(-50%,-50%);`}
			>
				+
			</div>
		{/if}
	{/each}

	<!-- Node card -->
	<article
		class={`w-[272px] overflow-hidden rounded-2xl border border-stone-200/90 bg-white shadow-[0_8px_32px_-16px_rgba(24,24,27,0.28)] transition-all duration-150 ${
			selected
				? `${cfg.glow}`
				: 'hover:shadow-[0_12px_36px_-16px_rgba(24,24,27,0.38)]'
		}`}
	>
		<!-- Header band -->
		<div class={`flex items-center justify-between px-4 py-3 ${cfg.band}`}>
			<div class={`flex items-center gap-2.5 ${cfg.bandText}`}>
				<Icon class="h-4 w-4 shrink-0 opacity-90" />
				<span class="text-[11px] font-bold tracking-[0.18em] uppercase opacity-90">{data.kindLabel}</span>
			</div>
			{#if data.isEntry}
				<span class="rounded-full bg-white/25 px-2 py-0.5 text-[10px] font-bold tracking-[0.14em] text-white uppercase">
					Entrada
				</span>
			{/if}
		</div>

		<!-- Body -->
		<div class="px-4 py-3.5">
			<h3 class="line-clamp-2 text-[14px] leading-[1.35] font-semibold text-stone-900">
				{data.title}
			</h3>
			{#if data.summary}
				<p class="mt-1.5 line-clamp-2 text-[12px] leading-[1.5] text-stone-500">{data.summary}</p>
			{/if}

			{#if data.kind === 'choice'}
				<div class="mt-3 flex items-center gap-1.5 text-[11px] text-teal-700">
					<GitBranch class="h-3 w-3 shrink-0" />
					<span>Opciones en el inspector</span>
				</div>
			{/if}
		</div>

		<!-- Footer stats -->
		<div class={`flex items-center gap-px px-4 py-2.5 ${cfg.footer}`}>
			<div class="flex flex-1 items-center gap-1.5">
				<span class="text-[10px] font-semibold tracking-[0.14em] text-stone-400 uppercase">In</span>
				<span class="text-[13px] font-semibold text-stone-700">{data.incomingCount}</span>
			</div>
			<div class="h-3 w-px bg-stone-200"></div>
			<div class="flex flex-1 items-center justify-end gap-1.5">
				<span class="text-[13px] font-semibold text-stone-700">{data.outgoingCount}</span>
				<span class="text-[10px] font-semibold tracking-[0.14em] text-stone-400 uppercase">Out</span>
			</div>
		</div>
	</article>

	<!-- Outgoing handles -->
	{#each data.outgoingHandles as handle, index (handle.id)}
		<Handle
			id={handle.id}
			type="source"
			position={Position.Bottom}
			class={`!h-5 !w-5 !border-[3px] !rounded-full ${cfg.handle} ${cfg.handleRing} !ring-2 shadow-[0_4px_12px_-4px_rgba(24,24,27,0.5)] transition-transform hover:scale-125`}
			style={`left:${handleOffset(index, data.outgoingHandles.length)};bottom:0;transform:translate(-50%,50%);`}
		/>
	{/each}
</div>
