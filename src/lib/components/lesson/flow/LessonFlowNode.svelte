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
			band: 'bg-[#eaf7e9]/95 text-[#2e7d32] border-[#2e7d32]/20',
			accent: 'bg-linear-to-r from-[#2e7d32] to-[#a8e063]',
			icon: 'bg-white text-[#2e7d32] ring-1 ring-[#2e7d32]/20',
			handle: '!bg-[#2e7d32]',
			handleRing: '!ring-[#a8e063]/45',
			footer: 'bg-[#eaf7e9]/35 border-t border-[#2e7d32]/15',
			badge: 'bg-[#eaf7e9] text-[#2e7d32] ring-[#2e7d32]/20'
		},
		choice: {
			band: 'bg-[#edf9d8]/95 text-[#4b7f1f] border-[#a8e063]/45',
			accent: 'bg-linear-to-r from-[#79bf45] to-[#a8e063]',
			icon: 'bg-white text-[#4b7f1f] ring-1 ring-[#a8e063]/45',
			handle: '!bg-[#79bf45]',
			handleRing: '!ring-[#a8e063]/45',
			footer: 'bg-[#edf9d8]/35 border-t border-[#a8e063]/35',
			badge: 'bg-[#edf9d8] text-[#4b7f1f] ring-[#a8e063]/45'
		},
		check: {
			band: 'bg-[#eef4f8]/95 text-[#0f2537] border-[#c9d8e5]',
			accent: 'bg-linear-to-r from-[#0f2537] to-[#7f9bb0]',
			icon: 'bg-white text-[#0f2537] ring-1 ring-[#c9d8e5]',
			handle: '!bg-[#0f2537]',
			handleRing: '!ring-[#c9d8e5]',
			footer: 'bg-[#eef4f8]/50 border-t border-[#c9d8e5]',
			badge: 'bg-[#eef4f8] text-[#0f2537] ring-[#c9d8e5]'
		},
		agent: {
			band: 'bg-[#f2f6f9]/95 text-[#305167] border-[#c9d8e5]',
			accent: 'bg-linear-to-r from-[#7f9bb0] to-[#0f2537]',
			icon: 'bg-white text-[#305167] ring-1 ring-[#c9d8e5]',
			handle: '!bg-[#7f9bb0]',
			handleRing: '!ring-[#c9d8e5]',
			footer: 'bg-[#f2f6f9]/50 border-t border-[#c9d8e5]',
			badge: 'bg-[#eef4f8] text-[#305167] ring-[#c9d8e5]'
		},
		youtube: {
			band: 'bg-orange-50/95 text-orange-700 border-orange-200/80',
			accent: 'bg-linear-to-r from-[#ff9f2e] to-orange-400',
			icon: 'bg-white text-orange-700 ring-1 ring-orange-200/80',
			handle: '!bg-[#ff9f2e]',
			handleRing: '!ring-orange-200',
			footer: 'bg-orange-50/35 border-t border-orange-100/80',
			badge: 'bg-orange-100 text-orange-800 ring-orange-200/80'
		},
		end: {
			band: 'bg-orange-50/95 text-orange-700 border-orange-200/80',
			accent: 'bg-linear-to-r from-orange-500 to-amber-400',
			icon: 'bg-orange-100 text-orange-700 ring-1 ring-orange-200/80',
			handle: '!bg-orange-400',
			handleRing: '!ring-orange-200',
			footer: 'bg-orange-50/35 border-t border-orange-100/80',
			badge: 'bg-orange-100 text-orange-800 ring-orange-200/80'
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
			return `!h-6 !w-6 !border-2 !border-dashed !border-[#a8e063] !bg-white/95 !rounded-full shadow-[0_4px_14px_-5px_rgba(46,125,50,0.35)] ring-2 !ring-[#eaf7e9] transition-transform hover:scale-110`;
		}
		return `!h-5 !w-5 !border-[3px] !rounded-full ${cfg.handle} ${cfg.handleRing} !ring-2 shadow-[0_4px_14px_-5px_rgba(15,37,55,0.35)] transition-transform hover:scale-110`;
	}

	let Icon = $derived(iconFor(data.kind));
	let cfg = $derived(kindConfig[data.kind]);
	let hasIncomingConnections = $derived(data.incomingCount > 0);
</script>

<div class="relative w-[252px] py-4">
	<!-- Incoming drop zone indicator -->
	{#if !hasIncomingConnections}
		<div
			class="pointer-events-none absolute inset-x-0 top-0 z-0 -translate-y-[180%] text-center text-[9px] font-semibold text-slate-400 uppercase"
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
				class="pointer-events-none absolute z-10 flex h-6 w-6 items-center justify-center rounded-full text-[12px] font-bold text-[#2e7d32]"
				style={`left:${left};top:0;transform:translate(-50%,-50%);`}
			>
				+
			</div>
		{/if}
	{/each}

	<!-- Node card -->
	<article
		class={`relative w-[252px] overflow-hidden rounded-xl border bg-white/94 shadow-[0_18px_44px_-32px_rgba(37,99,235,0.34)] backdrop-blur-sm transition-all duration-150 ${
			selected
				? 'border-[#2e7d32] shadow-[0_0_0_1px_rgba(46,125,50,0.35),0_22px_52px_-24px_rgba(46,125,50,0.6)] ring-2 ring-[#a8e063]/70 ring-offset-2 ring-offset-[#f8fbf7]'
				: 'border-[#d9e6dc] hover:border-[#2e7d32]/30 hover:shadow-[0_20px_44px_-30px_rgba(15,37,55,0.38)]'
		}`}
	>
		{#if selected}
			<div class="pointer-events-none absolute inset-y-0 left-0 z-10 w-1 bg-[#2e7d32]"></div>
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
					class="rounded-md bg-white/72 px-1.5 py-0.5 text-[10px] font-bold text-[#2e7d32] uppercase ring-1 ring-[#2e7d32]/15"
				>
					Entrada
				</span>
			{/if}
		</div>

		<!-- Body -->
		<div class="px-3 py-3">
			<h3 class="line-clamp-2 text-[14px] leading-[1.35] font-semibold text-slate-950">
				{data.title}
			</h3>
			{#if data.summary}
				<p class="mt-1.5 line-clamp-2 text-[12px] leading-[1.5] text-slate-500">{data.summary}</p>
			{/if}

			{#if data.kind === 'choice'}
				<div class="mt-3 flex items-center gap-1.5 text-[11px] text-[#2e7d32]">
					<GitBranch class="h-3 w-3 shrink-0" />
					<span>Opciones en el inspector</span>
				</div>
			{/if}
		</div>

		<!-- Footer stats -->
		<div class={`flex items-center gap-px px-3 py-2 ${cfg.footer}`}>
			<div class="flex flex-1 items-center gap-1.5">
				<span class="text-[10px] font-semibold text-slate-400 uppercase">In</span>
				<span class="text-[13px] font-semibold text-[#2e7d32]">{data.incomingCount}</span>
			</div>
			<div class="h-3 w-px bg-[#d9e6dc]"></div>
			<div class="flex flex-1 items-center justify-end gap-1.5">
				<span class="text-[13px] font-semibold text-[#2e7d32]">{data.outgoingCount}</span>
				<span class="text-[10px] font-semibold text-slate-400 uppercase">Out</span>
			</div>
		</div>
	</article>

	<!-- Outgoing handles -->
	{#each data.outgoingHandles as handle, index (handle.id)}
		<Handle
			id={handle.id}
			type="source"
			position={Position.Bottom}
 			class={`!h-4.5 !w-4.5 !rounded-full !border-[3px] ${cfg.handle} ${cfg.handleRing} shadow-[0_4px_14px_-5px_rgba(15,37,55,0.35)] !ring-2 transition-transform hover:scale-125`}
			style={`left:${handleOffset(index, data.outgoingHandles.length)};bottom:0;transform:translate(-50%,50%);`}
		/>
	{/each}
</div>
