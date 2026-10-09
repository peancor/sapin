<script lang="ts">
	import { Card } from 'flowbite-svelte';
	import { marked } from 'marked';
	import { streamingPhases } from '$lib/stores/insights';
	import { Check, Loader2, AlertTriangle } from 'lucide-svelte';

	interface Props {
		content: string;
		progress: number;
		currentPhase: number;
	}

	let { content, progress, currentPhase }: Props = $props();

	let phases = $derived($streamingPhases);

	function getPhaseStatus(phase: (typeof phases)[0]) {
		return phase.status;
	}
</script>

<div class="space-y-6">
	<!-- Header -->
	<div>
		<h2 class="text-xl font-semibold text-gray-900 dark:text-white">Generando Informe</h2>
		<p class="text-sm text-gray-500 dark:text-gray-400">
			El analisis esta en proceso. No cierres esta pagina.
		</p>
	</div>

	<!-- Main Grid: Two columns -->
	<div class="grid grid-cols-1 gap-6 lg:grid-cols-3">
		<!-- Left Column: Progress (1/3 width) -->
		<div class="space-y-4 lg:col-span-1">
			<!-- Progress Card -->
			<Card class="p-4">
				<div class="mb-3 flex items-center justify-between">
					<span class="text-sm font-medium text-gray-700 dark:text-gray-300">Progreso</span>
					<span class="text-lg font-bold text-blue-600 dark:text-blue-400"
						>{Math.round(progress)}%</span
					>
				</div>

				<!-- Progress Bar -->
				<div class="mb-4 h-2 overflow-hidden rounded-full bg-gray-200 dark:bg-gray-700">
					<div
						class="relative h-full rounded-full bg-gradient-to-r from-blue-500 via-purple-500 to-indigo-500 transition-all duration-500"
						style="width: {progress}%"
					>
						<div class="shimmer-effect absolute inset-0"></div>
					</div>
				</div>

				<!-- Phases List -->
				<div class="space-y-2">
					{#each phases as phase}
						<div
							class="flex items-center gap-3 rounded-lg p-2 transition-colors
                            {getPhaseStatus(phase) === 'active'
								? 'bg-blue-50 dark:bg-blue-900/20'
								: ''}"
						>
							<!-- Status Icon -->
							<div
								class="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full
                                {getPhaseStatus(phase) === 'completed'
									? 'bg-green-500 text-white'
									: getPhaseStatus(phase) === 'active'
										? 'bg-blue-500 text-white'
										: 'bg-gray-100 text-gray-400 dark:bg-gray-700'}"
							>
								{#if getPhaseStatus(phase) === 'completed'}
									<Check size={16} />
								{:else if getPhaseStatus(phase) === 'active'}
									<Loader2 size={16} class="animate-spin" />
								{:else}
									<span class="text-sm">{phase.icon}</span>
								{/if}
							</div>

							<!-- Phase Info -->
							<div class="min-w-0 flex-1">
								<span
									class="block truncate text-sm font-medium
                                    {getPhaseStatus(phase) === 'active'
										? 'text-blue-700 dark:text-blue-300'
										: getPhaseStatus(phase) === 'completed'
											? 'text-green-700 dark:text-green-400'
											: 'text-gray-500 dark:text-gray-400'}"
								>
									{phase.name}
								</span>
							</div>

							<!-- Status Badge -->
							{#if getPhaseStatus(phase) === 'active'}
								<span class="text-xs text-blue-600 dark:text-blue-400">En curso</span>
							{:else if getPhaseStatus(phase) === 'completed'}
								<span class="text-xs text-green-600 dark:text-green-400">Listo</span>
							{/if}
						</div>
					{/each}
				</div>
			</Card>

			<!-- Warning Card -->
			<Card class="border-yellow-200 bg-yellow-50 p-4 dark:border-yellow-800 dark:bg-yellow-900/20">
				<div class="flex items-start gap-3">
					<AlertTriangle
						size={18}
						class="mt-0.5 flex-shrink-0 text-yellow-600 dark:text-yellow-400"
					/>
					<div class="text-sm">
						<p class="font-medium text-yellow-800 dark:text-yellow-300">No abandones la pagina</p>
						<p class="mt-1 text-yellow-700 dark:text-yellow-400">
							El informe se guardara automaticamente al completarse.
						</p>
					</div>
				</div>
			</Card>

			<!-- Stats -->
			<Card class="p-4">
				<div class="grid grid-cols-2 gap-3 text-center">
					<div>
						<span class="block text-2xl font-bold text-gray-900 dark:text-white"
							>{content.length}</span
						>
						<span class="text-xs text-gray-500 dark:text-gray-400">caracteres</span>
					</div>
					<div>
						<span class="block text-2xl font-bold text-gray-900 dark:text-white"
							>{content.split('\n').filter((l) => l.startsWith('#')).length}</span
						>
						<span class="text-xs text-gray-500 dark:text-gray-400">secciones</span>
					</div>
				</div>
			</Card>
		</div>

		<!-- Right Column: Content Preview (2/3 width) -->
		<div class="lg:col-span-2">
			<Card class="h-full p-4">
				<div class="mb-4 flex items-center justify-between">
					<h3 class="text-lg font-semibold text-gray-900 dark:text-white">Vista Previa</h3>
					{#if currentPhase > 0 && currentPhase <= phases.length}
						<span
							class="inline-flex items-center gap-1.5 rounded-full bg-blue-100 px-3 py-1 text-sm text-blue-700 dark:bg-blue-900/30 dark:text-blue-300"
						>
							<span>{phases[currentPhase - 1].icon}</span>
							<span>{phases[currentPhase - 1].name}</span>
						</span>
					{/if}
				</div>

				{#if content}
					<div
						class="prose dark:prose-invert prose-sm max-h-[calc(100vh-320px)] max-w-none overflow-y-auto pr-2"
					>
						{@html marked.parse(content)}
					</div>
				{:else}
					<div class="flex flex-col items-center justify-center py-16 text-center">
						<div class="relative mb-4">
							<div
								class="flex h-16 w-16 items-center justify-center rounded-full bg-blue-100 dark:bg-blue-900/30"
							>
								<Loader2 size={32} class="animate-spin text-blue-500" />
							</div>
							<div
								class="absolute inset-0 animate-ping rounded-full border-4 border-blue-200 opacity-20 dark:border-blue-800"
							></div>
						</div>
						<p class="font-medium text-gray-600 dark:text-gray-400">Preparando el analisis...</p>
						<p class="mt-1 text-sm text-gray-500 dark:text-gray-500">
							El contenido aparecera aqui conforme se genere
						</p>
					</div>
				{/if}
			</Card>
		</div>
	</div>
</div>

<style>
	.shimmer-effect {
		background: linear-gradient(90deg, transparent, rgba(255, 255, 255, 0.3), transparent);
		animation: shimmer 1.5s infinite;
	}

	@keyframes shimmer {
		0% {
			transform: translateX(-100%);
		}
		100% {
			transform: translateX(100%);
		}
	}

	:global(.prose h1, .prose h2, .prose h3) {
		margin-top: 1rem;
	}

	:global(.prose h1:first-child, .prose h2:first-child, .prose h3:first-child) {
		margin-top: 0;
	}
</style>
