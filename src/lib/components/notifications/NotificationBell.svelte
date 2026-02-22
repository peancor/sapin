<script lang="ts">
	import { browser } from '$app/environment';
	import { Bell } from 'lucide-svelte';
	import { Button } from 'flowbite-svelte';
	import NotificationDropdown from './NotificationDropdown.svelte';
	import type { NotificationRecord } from '$lib/server/notifications/NotificationTypes';

	interface Props {
		userId?: string;
	}

	const { userId }: Props = $props();

	let isOpen = $state(false);
	let notifications = $state<NotificationRecord[]>([]);
	let unreadCount = $state(0);
	let loading = $state(false);

	const POLLING_INTERVAL = 30000; // 30 segundos

	// Fetch unread count (lightweight call)
	async function fetchUnreadCount() {
		if (!browser || !userId) return;

		try {
			const response = await fetch('/api/notifications/unread-count');
			if (response.ok) {
				const data = await response.json();
				unreadCount = data.count;
			}
		} catch (error) {
			console.error('Error fetching unread count:', error);
		}
	}

	// Fetch notifications list
	async function fetchNotifications() {
		if (!browser || !userId) return;

		loading = true;
		try {
			const response = await fetch('/api/notifications?limit=10');
			if (response.ok) {
				const data = await response.json();
				notifications = data.notifications;
				unreadCount = notifications.filter((n: NotificationRecord) => !n.read).length;
			}
		} catch (error) {
			console.error('Error fetching notifications:', error);
		} finally {
			loading = false;
		}
	}

	// Mark single notification as read
	async function handleMarkRead(id: string) {
		try {
			const response = await fetch(`/api/notifications/${id}`, {
				method: 'PATCH'
			});
			if (response.ok) {
				notifications = notifications.map((n) =>
					n.id === id ? { ...n, read: true, readAt: new Date() } : n
				);
				unreadCount = Math.max(0, unreadCount - 1);
			}
		} catch (error) {
			console.error('Error marking notification as read:', error);
		}
	}

	// Mark all notifications as read
	async function handleMarkAllRead() {
		try {
			const response = await fetch('/api/notifications/read-all', {
				method: 'POST'
			});
			if (response.ok) {
				notifications = notifications.map((n) => ({ ...n, read: true, readAt: new Date() }));
				unreadCount = 0;
			}
		} catch (error) {
			console.error('Error marking all as read:', error);
		}
	}

	// Delete notification
	async function handleDelete(id: string) {
		try {
			const response = await fetch(`/api/notifications/${id}`, {
				method: 'DELETE'
			});
			if (response.ok) {
				const wasUnread = notifications.find((n) => n.id === id)?.read === false;
				notifications = notifications.filter((n) => n.id !== id);
				if (wasUnread) {
					unreadCount = Math.max(0, unreadCount - 1);
				}
			}
		} catch (error) {
			console.error('Error deleting notification:', error);
		}
	}

	// Toggle dropdown
	function toggleDropdown() {
		isOpen = !isOpen;
		if (isOpen) {
			fetchNotifications();
		}
	}

	// Close dropdown
	function closeDropdown() {
		isOpen = false;
	}

	// Click outside handler
	function handleClickOutside(event: MouseEvent) {
		const target = event.target as HTMLElement;
		if (!target.closest('#notification-bell-container')) {
			isOpen = false;
		}
	}

	// Effect for polling - runs when component mounts and cleans up on unmount
	$effect(() => {
		if (!browser || !userId) return;

		// Initial fetch
		fetchUnreadCount();

		// Set up polling
		const interval = setInterval(() => {
			fetchUnreadCount();
		}, POLLING_INTERVAL);

		// Set up click outside listener
		document.addEventListener('click', handleClickOutside);

		// Cleanup function
		return () => {
			clearInterval(interval);
			document.removeEventListener('click', handleClickOutside);
		};
	});

	// Also refresh when dropdown opens
	$effect(() => {
		if (isOpen && browser) {
			fetchNotifications();
		}
	});
</script>

<div class="relative" id="notification-bell-container">
	<Button
		pill
		color="light"
		class="!p-2.5 bg-transparent border-none hover:bg-gray-100 dark:hover:bg-gray-800 transition-all duration-300 relative"
		onclick={toggleDropdown}
	>
		<Bell size={18} class="text-gray-600 dark:text-gray-300" />
		{#if unreadCount > 0}
			<span class="absolute -top-0.5 -right-0.5 flex h-4 w-4 items-center justify-center">
				<span class="absolute inline-flex h-full w-full animate-ping rounded-full bg-red-400 opacity-75"></span>
				<span class="relative inline-flex h-4 w-4 items-center justify-center rounded-full bg-red-500 text-[9px] font-bold text-white">
					{unreadCount > 9 ? '9+' : unreadCount}
				</span>
			</span>
		{/if}
	</Button>

	{#if isOpen}
		<NotificationDropdown
			{notifications}
			{loading}
			onMarkRead={handleMarkRead}
			onMarkAllRead={handleMarkAllRead}
			onDelete={handleDelete}
			onClose={closeDropdown}
		/>
	{/if}
</div>
