<script lang="ts">
	import { Handle, Position, type NodeProps } from '@xyflow/svelte';
	import {
		BookOpenText,
		Bot,
		CircleCheck,
		Flag,
		GitBranch,
		ListChecks,
		Youtube
	} from 'lucide-svelte';
	import type { LessonFlowNode } from '../../../types/lessonFlow';

	let { data, selected = false }: NodeProps<LessonFlowNode> = $props();

	const kindConfig = {
		content: {
			band: 'bg-amber-50 text-amber-800 border-amber-200/80',
			accent: 'bg-amber-500',
			icon: 'bg-amber-100 text-amber-700',
			handle: '!bg-amber-500',
			handleRing: '!ring-amber-200',
			footer: 'bg-amber-50/45 border-t border-amber-100/80',
			badge: 'bg-amber-100 text-amber-800 ring-amber-200/80'
		},
		choice: {
			band: 'bg-teal-50 text-teal-800 border-teal-200/80',
			accent: 'bg-teal-500',
			icon: 'bg-teal-100 text-teal-700',
			handle: '!bg-teal-500',
			handleRing: '!ring-teal-200',
			footer: 'bg-teal-50/45 border-t border-teal-100/80',
			badge: 'bg-teal-100 text-teal-800 ring-teal-200/80'
		},
		check: {
			band: 'bg-emerald-50 text-emerald-800 border-emerald-200/80',
			accent: 'bg-emerald-500',
			icon: 'bg-emerald-100 text-emerald-700',
			handle: '!bg-emerald-500',
			handleRing: '!ring-emerald-200',
			footer: 'bg-emerald-50/45 border-t border-emerald-100/80',
			badge: 'bg-emerald-100 text-emerald-800 ring-emerald-200/80'
		},
		agent: {
			band: 'bg-indigo-50 text-indigo-800 border-indigo-200/80',
			accent: 'bg-indigo-500',
			icon: 'bg-indigo-100 text-indigo-700',
			handle: '!bg-indigo-500',
			handleRing: '!ring-indigo-200',
			footer: 'bg-indigo-50/45 border-t border-indigo-100/80',
			badge: 'bg-indigo-100 text-indigo-800 ring-indigo-200/80'
		},
		youtube: {
			band: 'bg-red-50 text-red-800 border-red-200/80',
			accent: 'bg-red-600',
			icon: 'bg-red-100 text-red-700',
			handle: '!bg-red-600',
			handleRing: '!ring-red-200',
			footer: 'bg-red-50/45 border-t border-red-100/80',
			badge: 'bg-red-100 text-red-800 ring-red-200/80'
		},
		end: {
			band: 'bg-rose-50 text-rose-800 border-rose-200/80',
			accent: 'bg-rose-500',
			icon: 'bg-rose-100 text-rose-700',
			handle: '!bg-rose-500',
			handleRing: '!ring-rose-200',
			footer: 'bg-rose-50/45 border-t border-rose-100/80',
			badge: 'bg-rose-100 text-rose-800 ring-rose-200/80'
		}
	} as const;

	function iconFor(kind: LessonFlowNode['data']['kind']) {
		if (kind === 'content') return BookOpenText;
		if (kind === 'choice') return ListChecks;
		if (kind === 'check') return CircleCheck;
		if (kind === 'agent') return Bot;
		if (kind === 'youtube') return Youtube;
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
			return `!h-6 !w-6 !border-2 !border-dashed !border-stone-400 !bg-white/95 !rounded-full shadow-[0_4px_12px_-4px_rgba(24,24,27,0.35)] ring-2 !ring-white/80 transition-transform hover:scale-110`;
		}
		return `!h-5 !w-5 !border-[3px] !rounded-full ${cfg.handle} ${cfg.handleRing} !ring-2 shadow-[0_4px_12px_-4px_rgba(24,24,27,0.4)] transition-transform hover:scale-110`;
	}

	let Icon = $derived(iconFor(data.kind));
	let cfg = $derived(kindConfig[data.kind]);
	let hasIncomingConnections = $derived(data.incomingCount > 0);
</script>

<div class="relative w-[252px] py-4">
	<!-- Incoming drop zone indicator -->
	{#if !hasIncomingConnections}
		<div
			class="pointer-events-none absolute inset-x-0 top-0 z-0 -translate-y-[180%] text-center text-[9px] font-semibold text-stone-400 uppercase"
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
				class="pointer-events-none absolute z-10 flex h-6 w-6 items-center justify-center rounded-full text-[12px] font-bold text-stone-500"
				style={`left:${left};top:0;transform:translate(-50%,-50%);`}
			>
				+
			</div>
		{/if}
	{/each}

	<!-- Node card -->
	<article
		class={`relative w-[252px] overflow-hidden rounded-lg border bg-white shadow-[0_8px_24px_-16px_rgba(24,24,27,0.28)] transition-all duration-150 ${
			selected
				? 'border-sky-500 shadow-[0_0_0_1px_rgba(2,132,199,0.35),0_18px_44px_-24px_rgba(2,132,199,0.62)] ring-2 ring-sky-400/70 ring-offset-2 ring-offset-[#f8f4ec]'
				: 'border-stone-200/90 hover:shadow-[0_12px_30px_-18px_rgba(24,24,27,0.38)]'
		}`}
	>
		{#if selected}
			<div class="pointer-events-none absolute inset-y-0 left-0 z-10 w-1 bg-sky-500"></div>
		{/if}
		<div class={`h-1 ${cfg.accent}`}></div>

		<!-- Header band -->
		<div class={`flex items-center justify-between border-b px-3 py-2.5 ${cfg.band}`}>
			<div class="flex items-center gap-2">
				<span class={`flex h-6 w-6 items-center justify-center rounded-md ${cfg.icon}`}>
					<Icon class="h-3.5 w-3.5 shrink-0" />
				</span>
				<span class="text-[11px] font-bold uppercase opacity-90">{data.kindLabel}</span>
			</div>
			{#if data.isEntry}
				<span
					class="rounded-md bg-white/70 px-1.5 py-0.5 text-[10px] font-bold text-stone-700 uppercase ring-1 ring-black/5"
				>
					Entrada
				</span>
			{/if}
		</div>

		<!-- Body -->
		<div class="px-3 py-3">
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
		<div class={`flex items-center gap-px px-3 py-2 ${cfg.footer}`}>
			<div class="flex flex-1 items-center gap-1.5">
				<span class="text-[10px] font-semibold text-stone-400 uppercase">In</span>
				<span class="text-[13px] font-semibold text-stone-700">{data.incomingCount}</span>
			</div>
			<div class="h-3 w-px bg-stone-200"></div>
			<div class="flex flex-1 items-center justify-end gap-1.5">
				<span class="text-[13px] font-semibold text-stone-700">{data.outgoingCount}</span>
				<span class="text-[10px] font-semibold text-stone-400 uppercase">Out</span>
			</div>
		</div>
	</article>

	<!-- Outgoing handles -->
	{#each data.outgoingHandles as handle, index (handle.id)}
		<Handle
			id={handle.id}
			type="source"
			position={Position.Bottom}
			class={`!h-4.5 !w-4.5 !rounded-full !border-[3px] ${cfg.handle} ${cfg.handleRing} shadow-[0_4px_12px_-4px_rgba(24,24,27,0.45)] !ring-2 transition-transform hover:scale-125`}
			style={`left:${handleOffset(index, data.outgoingHandles.length)};bottom:0;transform:translate(-50%,50%);`}
		/>
	{/each}
</div>
