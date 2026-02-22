<script lang="ts">
	import {
		Bell,
		BookOpen,
		GraduationCap,
		Mail,
		Settings,
		AlertCircle,
		Check,
		Trash2
	} from 'lucide-svelte';
	import { Badge } from 'flowbite-svelte';
	import type { NotificationRecord } from '$lib/server/notifications/NotificationTypes';

	interface Props {
		notification: NotificationRecord;
		onMarkRead?: (id: string) => void;
		onDelete?: (id: string) => void;
		compact?: boolean;
	}

	const { notification, onMarkRead, onDelete, compact = false }: Props = $props();

	// Icono según tipo de notificación
	function getIcon(type: string) {
		switch (type) {
			case 'activity_completed':
				return Check;
			case 'enrollment':
				return GraduationCap;
			case 'new_activity':
				return BookOpen;
			case 'course_update':
				return Settings;
			case 'contact_form':
				return Mail;
			case 'system':
				return AlertCircle;
			default:
				return Bell;
		}
	}

	// Color del icono según tipo
	function getIconColor(type: string): string {
		switch (type) {
			case 'activity_completed':
				return 'text-green-600 dark:text-green-400';
			case 'enrollment':
				return 'text-blue-600 dark:text-blue-400';
			case 'new_activity':
				return 'text-purple-600 dark:text-purple-400';
			case 'course_update':
				return 'text-orange-600 dark:text-orange-400';
			case 'contact_form':
				return 'text-pink-600 dark:text-pink-400';
			case 'system':
				return 'text-yellow-600 dark:text-yellow-400';
			default:
				return 'text-gray-600 dark:text-gray-400';
		}
	}

	// Fondo del icono según tipo
	function getIconBg(type: string): string {
		switch (type) {
			case 'activity_completed':
				return 'bg-green-100 dark:bg-green-900/40';
			case 'enrollment':
				return 'bg-blue-100 dark:bg-blue-900/40';
			case 'new_activity':
				return 'bg-purple-100 dark:bg-purple-900/40';
			case 'course_update':
				return 'bg-orange-100 dark:bg-orange-900/40';
			case 'contact_form':
				return 'bg-pink-100 dark:bg-pink-900/40';
			case 'system':
				return 'bg-yellow-100 dark:bg-yellow-900/40';
			default:
				return 'bg-gray-100 dark:bg-gray-800';
		}
	}

	// Color del badge de prioridad
	function getPriorityColor(
		priority: string
	):
		| 'gray'
		| 'red'
		| 'yellow'
		| 'green'
		| 'indigo'
		| 'purple'
		| 'pink'
		| 'blue'
		| 'primary'
		| undefined {
		switch (priority) {
			case 'urgent':
				return 'red';
			case 'high':
				return 'yellow';
			case 'low':
				return 'gray';
			default:
				return 'blue';
		}
	}

	// Tiempo relativo
	function getRelativeTime(date: Date): string {
		const now = new Date();
		const diff = now.getTime() - new Date(date).getTime();
		const minutes = Math.floor(diff / 60000);
		const hours = Math.floor(diff / 3600000);
		const days = Math.floor(diff / 86400000);

		if (minutes < 1) return 'Ahora';
		if (minutes < 60) return `Hace ${minutes} min`;
		if (hours < 24) return `Hace ${hours}h`;
		if (days < 7) return `Hace ${days}d`;
		return new Date(date).toLocaleDateString('es-ES', { day: 'numeric', month: 'short' });
	}

	const IconComponent = $derived(getIcon(notification.type));
</script>

<div
	class="group relative border-b border-gray-100 p-3 transition-colors duration-150 hover:bg-gray-50 dark:border-gray-700 dark:hover:bg-gray-700/50 {!notification.read
		? 'bg-blue-50/50 dark:bg-blue-900/10'
		: ''}"
>
	<div class="flex items-start gap-3">
		<!-- Icono -->
		<div class="flex-shrink-0 rounded-full p-2 {getIconBg(notification.type)}">
			<svelte:component
				this={IconComponent}
				size={compact ? 14 : 16}
				class={getIconColor(notification.type)}
			/>
		</div>

		<!-- Contenido -->
		<div class="min-w-0 flex-1">
			<div class="flex items-start justify-between gap-2">
				<p
					class="text-sm font-medium text-gray-900 dark:text-white {!notification.read
						? 'font-semibold'
						: ''}"
				>
					{notification.title}
				</p>
				{#if notification.priority !== 'normal'}
					<Badge color={getPriorityColor(notification.priority)} class="px-1.5 py-0.5 text-[10px]">
						{notification.priority === 'urgent'
							? 'Urgente'
							: notification.priority === 'high'
								? 'Alta'
								: 'Baja'}
					</Badge>
				{/if}
			</div>

			<p class="mt-0.5 line-clamp-2 text-xs text-gray-500 dark:text-gray-400">
				{notification.message}
			</p>

			<div class="mt-1.5 flex items-center gap-2">
				<span class="text-[10px] text-gray-400 dark:text-gray-500">
					{getRelativeTime(notification.createdAt)}
				</span>
				{#if notification.courseName}
					<span class="text-[10px] text-gray-400 dark:text-gray-500">•</span>
					<span class="text-primary-600 dark:text-primary-400 max-w-24 truncate text-[10px]">
						{notification.courseName}
					</span>
				{/if}
			</div>
		</div>

		<!-- Acciones (visibles al hover) -->
		<div
			class="flex flex-shrink-0 items-center gap-1 opacity-0 transition-opacity duration-200 group-hover:opacity-100"
		>
			{#if !notification.read && onMarkRead}
				<button
					onclick={() => onMarkRead?.(notification.id)}
					class="rounded-full p-1.5 text-gray-500 transition-colors hover:bg-gray-200 hover:text-green-600 dark:text-gray-400 dark:hover:bg-gray-600 dark:hover:text-green-400"
					title="Marcar como leída"
				>
					<Check size={14} />
				</button>
			{/if}
			{#if onDelete}
				<button
					onclick={() => onDelete?.(notification.id)}
					class="rounded-full p-1.5 text-gray-500 transition-colors hover:bg-gray-200 hover:text-red-600 dark:text-gray-400 dark:hover:bg-gray-600 dark:hover:text-red-400"
					title="Eliminar"
				>
					<Trash2 size={14} />
				</button>
			{/if}
		</div>
	</div>

	<!-- Indicador de no leída -->
	{#if !notification.read}
		<div
			class="absolute top-1/2 left-1 h-1.5 w-1.5 -translate-y-1/2 rounded-full bg-blue-500"
		></div>
	{/if}
</div>
