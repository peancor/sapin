<script lang="ts">
	import { fly } from 'svelte/transition';
	import { quintOut } from 'svelte/easing';
	import { Button, Spinner } from 'flowbite-svelte';
	import { Bell, CheckCheck } from 'lucide-svelte';
	import NotificationItem from './NotificationItem.svelte';
	import type { NotificationRecord } from '$lib/server/notifications/NotificationTypes';

	interface Props {
		notifications: NotificationRecord[];
		loading?: boolean;
		onMarkRead?: (id: string) => void;
		onMarkAllRead?: () => void;
		onDelete?: (id: string) => void;
		onClose?: () => void;
	}

	const {
		notifications,
		loading = false,
		onMarkRead,
		onMarkAllRead,
		onDelete,
		onClose
	}: Props = $props();

	const unreadCount = $derived(notifications.filter((n) => !n.read).length);
</script>

<div
	transition:fly={{ y: -5, duration: 200, easing: quintOut }}
	class="absolute right-0 z-50 mt-2 w-80 overflow-hidden rounded-xl bg-white shadow-2xl ring-1 ring-black/5 sm:w-96 dark:bg-gray-800 dark:ring-white/10"
>
	<!-- Header -->
	<div
		class="flex items-center justify-between border-b border-gray-100 bg-gray-50/50 p-3 dark:border-gray-700 dark:bg-gray-800/50"
	>
		<div class="flex items-center gap-2">
			<Bell size={16} class="text-gray-600 dark:text-gray-400" />
			<h3 class="text-sm font-bold text-gray-900 dark:text-white">Notificaciones</h3>
			{#if unreadCount > 0}
				<span
					class="rounded-full bg-blue-100 px-1.5 py-0.5 text-[10px] font-bold text-blue-600 dark:bg-blue-900/50 dark:text-blue-400"
				>
					{unreadCount}
				</span>
			{/if}
		</div>
		{#if unreadCount > 0 && onMarkAllRead}
			<Button size="xs" color="light" class="gap-1 text-xs" onclick={onMarkAllRead}>
				<CheckCheck size={12} />
				Marcar todas
			</Button>
		{/if}
	</div>

	<!-- Lista de notificaciones -->
	<div class="max-h-80 overflow-y-auto">
		{#if loading}
			<div class="flex items-center justify-center py-8">
				<Spinner size="6" />
			</div>
		{:else if notifications.length === 0}
			<div class="flex flex-col items-center justify-center px-4 py-8">
				<div class="mb-3 rounded-full bg-gray-100 p-3 dark:bg-gray-700">
					<Bell size={24} class="text-gray-400 dark:text-gray-500" />
				</div>
				<p class="text-center text-sm text-gray-500 dark:text-gray-400">No tienes notificaciones</p>
			</div>
		{:else}
			{#each notifications.slice(0, 5) as notification (notification.id)}
				<NotificationItem {notification} {onMarkRead} {onDelete} compact />
			{/each}
		{/if}
	</div>

	<!-- Footer -->
	{#if notifications.length > 0}
		<div
			class="border-t border-gray-100 bg-gray-50/50 p-2 text-center dark:border-gray-700 dark:bg-gray-800/50"
		>
			<a
				href="/notifications"
				class="text-primary-600 dark:text-primary-400 text-xs font-medium hover:underline"
				onclick={onClose}
			>
				Ver todas las notificaciones
			</a>
		</div>
	{/if}
</div>
