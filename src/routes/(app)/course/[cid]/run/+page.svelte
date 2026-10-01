<script lang="ts">
	import type { PageData } from './$types';
	import { Card, Button } from 'flowbite-svelte';
	import { goto, invalidateAll } from '$app/navigation';
	import { browser } from '$app/environment';
	import { resolve } from '$app/paths';
	import type {
		LearningActivityProgress,
		InteractiveLearning,
		InteractiveLearningChat,
		Chat,
		InteractiveLessonSession
	} from '$lib/server/db/schema';

	interface FullActivityChat extends InteractiveLearning {
		courseInteractiveLearningId: string;
		progress: LearningActivityProgress | null;
		chatConfig: InteractiveLearningChat | null;
		chats: Chat[];
		latestLessonSession: InteractiveLessonSession | null;
	}

	let { data } = $props<{
		data: PageData & {
			activities: FullActivityChat[];
			course: { id: string };
		};
	}>();

	async function startChat(activity: FullActivityChat) {
		if (!browser || !activity.chatConfig) return;
		try {
			const response = await fetch(`/api/interactive-chat/${activity.id}/chat`, {
				method: 'POST',
				headers: {
					'Content-Type': 'application/json'
				},
				body: JSON.stringify({ courseId: data.course.id })
			});

			if (response.ok) {
				invalidateAll(); // Invalidate all pages to update progress
				const chatData = await response.json();
				goto(resolve(`/course/${data.course.id}/run/chat/${chatData.chatId}`));
			}
		} catch (e) {
			console.error('Error starting chat:', e);
		}
	}

	async function continueChat(activity: FullActivityChat, chatId: string) {
		if (!browser) return;
		goto(resolve(`/course/${data.course.id}/run/chat/${chatId}`));
	}

	function getLatestChat(activity: FullActivityChat) {
		if (!activity.chats.length) return null;
		return activity.chats.reduce((latest, current) =>
			latest.createdAt > current.createdAt ? latest : current
		);
	}

	async function markComplete(activity: FullActivityChat) {
		if (!browser) return;
		try {
			await fetch(`/api/course/${data.course.id}/activity/${activity.id}/complete`, {
				method: 'POST'
			});
			// Refresh the page to update progress
			window.location.reload();
		} catch (e) {
			console.error('Error marking activity complete:', e);
		}
	}

	function goToLesson(activity: FullActivityChat, sessionId?: string) {
		if (!browser) return;

		if (sessionId) {
			goto(resolve(`/course/${data.course.id}/run/lesson/${sessionId}`));
			return;
		}

		goto(resolve(`/course/${data.course.id}/run/new-lesson/${activity.id}`));
	}
</script>

<div class="container mx-auto px-4 py-8">
	{#if data.course.image}
		<div
			class="relative h-48 bg-gradient-to-r from-blue-800 to-purple-800"
			style="background-image: url('{data.course.image}')"
		>
			<img
				src={data.course.image}
				alt={data.course.name}
				class="absolute inset-0 h-full w-full object-cover opacity-50"
			/>
			<div class="absolute inset-0 bg-black opacity-20" ></div>
			<div class="relative z-10 flex h-full items-center justify-center text-white">
				<h1 class="text-3xl font-bold">{data.course.name}</h1>
			</div>
		</div>
	{:else}
		<h1 class="mb-8 text-3xl font-bold text-gray-800">{data.course.title}</h1>
	{/if}

	<div class="mt-8 grid grid-cols-1 gap-6 md:grid-cols-2">
		{#each data.activities as activity (activity.id)}
			<Card class="w-full transition-all duration-300 hover:shadow-lg">
				<div class="flex flex-col">
					<header class="mb-4 flex items-start gap-3">
						<!-- Generic icon -->
						<svg
							class="h-6 w-6 text-gray-500"
							fill="none"
							stroke="currentColor"
							viewBox="0 0 24 24"
						>
							<path
								stroke-linecap="round"
								stroke-linejoin="round"
								stroke-width="2"
								d="M12 4v16m8-8H4"
							/>
						</svg>
						<div class="flex flex-col">
							<div class="flex items-center">
								<h3 class="text-xl font-bold text-gray-800 dark:text-white">{activity.name}</h3>
								{#if activity.status === 'closed'}
									<span
										class="ml-2 inline-flex items-center gap-1 rounded-full bg-orange-100 px-2 py-1 text-xs text-orange-800"
									>
										🔒 Cerrada
									</span>
								{:else if activity.type === 'lesson' && activity.latestLessonSession}
									<span
										class="ml-2 inline-block rounded-full bg-amber-100 px-2 py-1 text-xs text-amber-800"
									>
										Intento {activity.latestLessonSession.attemptNumber}
									</span>
								{:else if activity.type === 'chat' && activity.chats.length > 0}
									<span
										class="ml-2 inline-block rounded-full bg-blue-100 px-2 py-1 text-xs text-blue-800"
									>
										Chat Iniciado
									</span>
								{/if}
							</div>
							<div class="text-sm text-gray-500">
								<span>Creado: {new Date(activity.createdAt).toLocaleDateString()}</span>
								{#if activity.updatedAt}
									<span class="ml-2"
										>Actualizado: {new Date(activity.updatedAt).toLocaleDateString()}</span
									>
								{/if}
							</div>
							{#if activity.description}
								<p class="mt-1 text-sm text-gray-600">{activity.description}</p>
							{/if}
						</div>
					</header>

					<footer class="flex flex-wrap justify-end gap-2">
						{#if activity.progress?.status === 'completed'}
							<div class="rounded-md bg-green-100 px-4 py-2 text-green-700">✨ Completado</div>
						{:else if activity.status === 'closed'}
							<!-- Actividad cerrada: solo consulta de historial/intento existente -->
							<div class="flex items-center gap-2 text-orange-600">
								<span class="text-lg">🔒</span>
								<span class="text-sm">Cerrada para nuevas interacciones</span>
							</div>
							{#if activity.type === 'lesson'}
								{#if activity.latestLessonSession}
									<Button color="light" onclick={() => goToLesson(activity, activity.latestLessonSession?.id)}>
										Ver intento
									</Button>
								{/if}
							{:else}
								{@const latestChat = getLatestChat(activity)}
								{#if latestChat}
									<Button color="light" onclick={() => continueChat(activity, latestChat.id)}>
										Ver Historial
									</Button>
								{/if}
							{/if}
						{:else if activity.type === 'chat'}
							{@const latestChat = getLatestChat(activity)}
							{#if latestChat}
								<Button color="blue" onclick={() => continueChat(activity, latestChat.id)}>
									Continuar Chat
								</Button>
								<Button color="green" onclick={() => startChat(activity)}>Repetir Chat</Button>
							{:else}
								<Button color="blue" onclick={() => startChat(activity)}>Iniciar Chat</Button>
							{/if}
						{:else if activity.type === 'lesson'}
							{#if activity.latestLessonSession}
								<Button color="blue" onclick={() => goToLesson(activity, activity.latestLessonSession?.id)}>
									Continuar lesson
								</Button>
								<Button color="light" onclick={() => goToLesson(activity)}>
									Nuevo intento
								</Button>
							{:else}
								<Button color="blue" onclick={() => goToLesson(activity)}>Iniciar lesson</Button>
							{/if}
						{:else}
							<Button color="blue" onclick={() => markComplete(activity)}>
								Marcar como completado
							</Button>
						{/if}
					</footer>
				</div>
			</Card>
		{/each}
	</div>
</div>
