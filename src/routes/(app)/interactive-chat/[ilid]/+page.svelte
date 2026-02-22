<script lang="ts">
	import type { PageData } from './$types';
	import type { NavigationItem } from '$lib/types/navigation';
	import { goto } from '$app/navigation';
	import { Badge } from 'flowbite-svelte';
	import {
		icons,
		Calendar,
		Clock,
		MessageCircle,
		Play,
		Sparkles,
		ArrowRight,
		History,
		Eye,
		Settings,
	} from 'lucide-svelte';
	import { onMount } from 'svelte';
	import { navigationItems } from '$lib/stores/navigation';
	import { resolve } from '$app/paths';

	let { data }: { data: PageData } = $props();

	let isStarting = $state(false);

	async function startNewChat() {
		isStarting = true;
		try {
			const response = await fetch(`/api/interactive-chat/${data.interactiveLearning.id}/chat`, {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({})
			});

			if (response.ok) {
				const { chatId } = await response.json();
				goto(resolve(`/interactive-chat/${data.interactiveLearning.id}/c/${chatId}`));
			}
		} finally {
			isStarting = false;
		}
	}

	const chatAdminItems: NavigationItem = {
		href: resolve(`/interactive-chat/${data.interactiveLearning.id}`),
		label: 'Chats',
		icon: icons.Cloudy
	};

	onMount(() => {
		navigationItems.update((items) => [...items, chatAdminItems]);
		return () => {
			navigationItems.update((items) => items.filter((item) => item !== chatAdminItems));
		};
	});

	function formatDate(dateString: string) {
		const date = new Date(dateString);
		return date.toLocaleDateString('es-ES', {
			year: 'numeric',
			month: 'short',
			day: 'numeric'
		});
	}

	function formatTime(dateString: string) {
		const date = new Date(dateString);
		return date.toLocaleTimeString('es-ES', {
			hour: '2-digit',
			minute: '2-digit'
		});
	}

	function getRelativeTime(dateString: string) {
		const date = new Date(dateString);
		const now = new Date();
		const diffMs = now.getTime() - date.getTime();
		const diffMins = Math.floor(diffMs / 60000);
		const diffHours = Math.floor(diffMins / 60);
		const diffDays = Math.floor(diffHours / 24);

		if (diffMins < 60) return `hace ${diffMins} min`;
		if (diffHours < 24) return `hace ${diffHours}h`;
		if (diffDays < 7) return `hace ${diffDays} días`;
		return formatDate(dateString);
	}

	function getStatusColor(status: string): 'green' | 'yellow' | 'orange' | 'gray' {
		switch (status) {
			case 'published':
				return 'green';
			case 'hidden':
				return 'yellow';
			case 'closed':
				return 'orange';
			default:
				return 'gray';
		}
	}

	function getStatusLabel(status: string): string {
		switch (status) {
			case 'published':
				return 'Publicada';
			case 'hidden':
				return 'En desarrollo';
			case 'closed':
				return 'Cerrada';
			default:
				return status;
		}
	}
</script>

<div
	class="min-h-screen bg-gradient-to-br from-gray-50 via-white to-blue-50 dark:from-gray-900 dark:via-gray-900 dark:to-gray-800"
>
	<!-- Hero Section -->
	<div class="relative overflow-hidden">
		<!-- Background Pattern -->
		<div class="absolute inset-0 opacity-30">
			<div
				class="absolute top-0 right-0 h-96 w-96 rounded-full bg-gradient-to-bl from-blue-400/30 to-transparent blur-3xl"
			></div>
			<div
				class="absolute bottom-0 left-0 h-96 w-96 rounded-full bg-gradient-to-tr from-purple-400/20 to-transparent blur-3xl"
			></div>
		</div>

		<div class="relative mx-auto max-w-5xl px-4 py-12 sm:px-6 lg:px-8">
			<!-- Header con badges -->
			<div class="mb-6 flex flex-wrap items-center gap-3">
				<Badge color={getStatusColor(data.interactiveLearning.status)} class="text-sm">
					{getStatusLabel(data.interactiveLearning.status)}
				</Badge>
				{#if data.userAccess.canViewAllChats}
					<Badge color="purple" class="text-sm">
						<Eye class="mr-1 h-3 w-3" />
						Vista de administrador
					</Badge>
				{/if}
			</div>

			<!-- Título y descripción -->
			<div class="mb-10">
				<h1
					class="mb-4 text-4xl font-bold tracking-tight text-gray-900 sm:text-5xl dark:text-white"
				>
					{data.interactiveLearning.name}
				</h1>
				{#if data.interactiveLearning.description}
					<p class="max-w-2xl text-lg leading-relaxed text-gray-600 dark:text-gray-300">
						{data.interactiveLearning.description}
					</p>
				{/if}
			</div>

			<!-- CTA Principal -->
			<div class="mb-12 flex flex-col gap-4 sm:flex-row">
				<button
					onclick={startNewChat}
					disabled={isStarting || data.interactiveLearning.status === 'closed'}
					class="group relative inline-flex items-center justify-center overflow-hidden rounded-2xl bg-gradient-to-r from-blue-600 to-indigo-600 px-8 py-4 text-lg font-semibold text-white shadow-lg transition-all duration-300 hover:scale-[1.02] hover:shadow-xl disabled:cursor-not-allowed disabled:opacity-50"
				>
					<span
						class="absolute inset-0 bg-gradient-to-r from-blue-700 to-indigo-700 opacity-0 transition-opacity group-hover:opacity-100"
					></span>
					<span class="relative flex items-center gap-3">
						{#if isStarting}
							<span
								class="h-5 w-5 animate-spin rounded-full border-2 border-white border-t-transparent"
							></span>
							Iniciando...
						{:else}
							<Sparkles class="h-6 w-6" />
							Comenzar nueva conversación
							<ArrowRight class="h-5 w-5 transition-transform group-hover:translate-x-1" />
						{/if}
					</span>
				</button>

				{#if data.userAccess.canViewAllChats}
					<a
						href={resolve(`/course/${data.userAccess.courseId}/admin/interactives/${data.interactiveLearning.id}/chatedit`)}
						class="inline-flex items-center justify-center gap-2 rounded-2xl border-2 border-gray-200 bg-white/80 px-6 py-4 font-medium text-gray-700 backdrop-blur-sm transition-all hover:border-gray-300 hover:bg-white dark:border-gray-600 dark:bg-gray-800/80 dark:text-gray-200 dark:hover:border-gray-500"
					>
						<Settings class="h-5 w-5" />
						Configuración
					</a>
				{/if}
			</div>

			{#if data.interactiveLearning.status === 'closed'}
				<div
					class="mb-8 rounded-xl border border-orange-200 bg-orange-50 p-4 dark:border-orange-900 dark:bg-orange-900/20"
				>
					<p class="flex items-center gap-2 text-orange-800 dark:text-orange-300">
						<span class="text-xl">🔒</span>
						Esta actividad está cerrada. Puedes revisar tus conversaciones anteriores pero no iniciar
						nuevas.
					</p>
				</div>
			{/if}
		</div>
	</div>

	<!-- Conversaciones anteriores -->
	<div class="mx-auto max-w-5xl px-4 pb-16 sm:px-6 lg:px-8">
		{#if data.userChats.length > 0}
			<div class="mb-6 flex items-center gap-3">
				<History class="h-6 w-6 text-gray-500" />
				<h2 class="text-xl font-semibold text-gray-900 dark:text-white">Tus conversaciones</h2>
				<Badge color="gray" class="ml-auto">{data.userChats.length}</Badge>
			</div>

			<div class="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
				{#each data.userChats as { chatData }, index (index)}
					{#if chatData}
						<a
							href={resolve(`/interactive-chat/${data.interactiveLearning.id}/c/${chatData.id}`)}
							class="group relative flex flex-col rounded-2xl border border-gray-200 bg-white p-5 shadow-sm transition-all duration-300 hover:-translate-y-1 hover:border-blue-300 hover:shadow-lg dark:border-gray-700 dark:bg-gray-800 dark:hover:border-blue-600"
						>
							<!-- Gradient accent -->
							<div
								class="absolute inset-x-0 top-0 h-1 rounded-t-2xl bg-gradient-to-r from-blue-500 to-indigo-500 opacity-0 transition-opacity group-hover:opacity-100"
							></div>

							<div class="mb-3 flex items-start justify-between">
								<div class="flex items-center gap-2">
									<div
										class="flex h-10 w-10 items-center justify-center rounded-xl bg-blue-100 dark:bg-blue-900/50"
									>
										<MessageCircle class="h-5 w-5 text-blue-600 dark:text-blue-400" />
									</div>
									<span class="font-semibold text-gray-900 dark:text-white">
										Chat #{index + 1}
									</span>
								</div>
								<ArrowRight
									class="h-5 w-5 text-gray-400 transition-transform group-hover:translate-x-1 group-hover:text-blue-500"
								/>
							</div>

							<div class="mt-auto flex items-center gap-4 text-sm text-gray-500 dark:text-gray-400">
								<span class="flex items-center gap-1.5">
									<Calendar class="h-4 w-4" />
									{formatDate(chatData.createdAt.toString())}
								</span>
								<span class="flex items-center gap-1.5">
									<Clock class="h-4 w-4" />
									{formatTime(chatData.createdAt.toString())}
								</span>
							</div>

							<span class="mt-3 text-xs text-gray-400 dark:text-gray-500">
								{getRelativeTime(chatData.createdAt.toString())}
							</span>
						</a>
					{/if}
				{/each}
			</div>
		{:else}
			<!-- Empty state -->
			<div
				class="rounded-2xl border-2 border-dashed border-gray-200 bg-white/50 p-12 text-center dark:border-gray-700 dark:bg-gray-800/50"
			>
				<div
					class="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-gray-100 dark:bg-gray-700"
				>
					<MessageCircle class="h-8 w-8 text-gray-400" />
				</div>
				<h3 class="mb-2 text-lg font-medium text-gray-900 dark:text-white">
					¡Tu primera conversación te espera!
				</h3>
				<p class="mb-6 text-gray-500 dark:text-gray-400">
					Aún no has iniciado ninguna conversación en esta actividad.
				</p>
				<button
					onclick={startNewChat}
					disabled={isStarting || data.interactiveLearning.status === 'closed'}
					class="inline-flex items-center gap-2 rounded-xl bg-blue-600 px-6 py-3 font-medium text-white transition-colors hover:bg-blue-700 disabled:opacity-50"
				>
					<Play class="h-5 w-5" />
					Comenzar ahora
				</button>
			</div>
		{/if}
	</div>
</div>
