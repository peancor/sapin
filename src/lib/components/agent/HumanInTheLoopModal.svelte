<script lang="ts">
	import { ShieldAlert, ShieldCheck, Shield, AlertTriangle, X } from 'lucide-svelte';

	interface Props {
		isOpen?: boolean;
		toolCallId: string;
		toolName: string;
		toolDisplayName: string;
		args: Record<string, unknown>;
		riskLevel: 'low' | 'medium' | 'high';
		confirmationMessage: string;
		apiBase: string;
		onConfirm?: (toolCallId: string) => void;
		onReject?: (toolCallId: string) => void;
		onError?: (message: string) => void;
	}

	let {
		isOpen = $bindable(false),
		toolCallId,
		toolName,
		toolDisplayName,
		args,
		riskLevel,
		confirmationMessage,
		apiBase,
		onConfirm,
		onReject,
		onError
	}: Props = $props();

	let isConfirming = $state(false);

	async function handleApprove() {
		isConfirming = true;
		try {
			const res = await fetch(`${apiBase}/confirm-tool`, {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ toolCallId, approved: true })
			});
			if (!res.ok) {
				const text = await res.text();
				onError?.(`Error al autorizar: ${res.status} ${text}`);
				return;
			}
			isOpen = false;
			onConfirm?.(toolCallId);
		} catch (err) {
			onError?.(`Error de red: ${err instanceof Error ? err.message : String(err)}`);
		} finally {
			isConfirming = false;
		}
	}

	async function handleReject() {
		isConfirming = true;
		try {
			const res = await fetch(`${apiBase}/confirm-tool`, {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ toolCallId, approved: false })
			});
			if (!res.ok) {
				const text = await res.text();
				onError?.(`Error al rechazar: ${res.status} ${text}`);
				return;
			}
			isOpen = false;
			onReject?.(toolCallId);
		} catch (err) {
			onError?.(`Error de red: ${err instanceof Error ? err.message : String(err)}`);
		} finally {
			isConfirming = false;
		}
	}

	const riskConfig = $derived(
		riskLevel === 'high'
			? {
					badgeClass:
						'bg-red-100 text-red-700 border border-red-300 dark:bg-red-950 dark:text-red-300 dark:border-red-700',
					label: 'Riesgo alto',
					icon: ShieldAlert
				}
			: riskLevel === 'medium'
				? {
						badgeClass:
							'bg-yellow-100 text-yellow-700 border border-yellow-300 dark:bg-yellow-950 dark:text-yellow-300 dark:border-yellow-700',
						label: 'Riesgo medio',
						icon: AlertTriangle
					}
				: {
						badgeClass:
							'bg-green-100 text-green-700 border border-green-300 dark:bg-green-950 dark:text-green-300 dark:border-green-700',
						label: 'Riesgo bajo',
						icon: ShieldCheck
					}
	);

	const formattedArgs = $derived(JSON.stringify(args, null, 2));
</script>

{#if isOpen}
	<!-- Overlay -->
	<div class="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 backdrop-blur-sm">
		<!-- Modal panel -->
		<div
			class="flex w-full max-w-lg flex-col overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-2xl dark:border-gray-700 dark:bg-gray-900"
			role="dialog"
			aria-modal="true"
			aria-labelledby="hitl-title"
		>
			<!-- Header -->
			<div class="flex items-center gap-3 border-b border-gray-200 px-5 py-4 dark:border-gray-700">
				<Shield class="h-5 w-5 flex-shrink-0 text-amber-500" />
				<h2 id="hitl-title" class="flex-1 text-base font-semibold text-gray-900 dark:text-gray-100">
					Confirmación requerida
				</h2>
				<button
					onclick={() => {
						if (!isConfirming) {
							isOpen = false;
						}
					}}
					disabled={isConfirming}
					class="rounded-lg p-1 text-gray-400 transition-colors hover:text-gray-600 disabled:opacity-40 dark:hover:text-gray-300"
					aria-label="Cerrar"
				>
					<X class="h-4 w-4" />
				</button>
			</div>

			<!-- Body -->
			<div class="max-h-[60vh] space-y-4 overflow-y-auto px-5 py-4">
				<!-- Tool identity + risk badge -->
				<div class="flex flex-wrap items-start gap-3">
					<div class="min-w-0 flex-1">
						<p class="text-sm text-gray-700 dark:text-gray-300">
							El agente quiere ejecutar:
							<strong class="text-gray-900 dark:text-gray-100">{toolDisplayName}</strong>
							<span class="ml-1 font-mono text-xs text-gray-500 dark:text-gray-400"
								>({toolName})</span
							>
						</p>
					</div>
					<span
						class="inline-flex flex-shrink-0 items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium {riskConfig.badgeClass}"
					>
						<riskConfig.icon class="h-3 w-3" />
						{riskConfig.label}
					</span>
				</div>

				<!-- Confirmation message -->
				{#if confirmationMessage}
					<p class="text-sm leading-relaxed text-gray-600 dark:text-gray-400">
						{confirmationMessage}
					</p>
				{/if}

				<!-- Args block -->
				{#if Object.keys(args).length > 0}
					<div>
						<p
							class="mb-1.5 text-xs font-medium tracking-wide text-gray-500 uppercase dark:text-gray-400"
						>
							Argumentos
						</p>
						<pre
							class="overflow-x-auto rounded-lg border border-gray-200 bg-gray-100 px-3 py-2.5 font-mono text-xs break-all whitespace-pre-wrap text-gray-800 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-200">{formattedArgs}</pre>
					</div>
				{/if}
			</div>

			<!-- Footer / Actions -->
			<div
				class="flex items-center justify-end gap-3 border-t border-gray-200 bg-gray-50 px-5 py-4 dark:border-gray-700 dark:bg-gray-800/50"
			>
				<button
					onclick={handleReject}
					disabled={isConfirming}
					class="inline-flex items-center gap-2 rounded-xl border border-red-400 px-4 py-2 text-sm font-medium text-red-600 transition-colors
                        hover:bg-red-50 disabled:cursor-not-allowed
                        disabled:opacity-40 dark:text-red-400
                        dark:hover:bg-red-950"
				>
					{#if isConfirming}
						<svg class="h-4 w-4 animate-spin" viewBox="0 0 24 24" fill="none">
							<circle
								class="opacity-25"
								cx="12"
								cy="12"
								r="10"
								stroke="currentColor"
								stroke-width="4"
							/>
							<path
								class="opacity-75"
								fill="currentColor"
								d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"
							/>
						</svg>
					{/if}
					Rechazar
				</button>

				<button
					onclick={handleApprove}
					disabled={isConfirming}
					class="inline-flex items-center gap-2 rounded-xl bg-green-600 px-4 py-2 text-sm font-medium text-white
                        transition-colors
                        hover:bg-green-700 disabled:cursor-not-allowed
                        disabled:opacity-40"
				>
					{#if isConfirming}
						<svg class="h-4 w-4 animate-spin" viewBox="0 0 24 24" fill="none">
							<circle
								class="opacity-25"
								cx="12"
								cy="12"
								r="10"
								stroke="currentColor"
								stroke-width="4"
							/>
							<path
								class="opacity-75"
								fill="currentColor"
								d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"
							/>
						</svg>
					{/if}
					Autorizar
				</button>
			</div>
		</div>
	</div>
{/if}
