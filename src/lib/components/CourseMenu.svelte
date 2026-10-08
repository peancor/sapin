<script lang="ts">
	import { page } from '$app/stores';
	export let courseId: string;

	const menuItems = [
		{ label: 'Visión general', href: `/course/${courseId}` },
		{ label: 'Editar', href: `/course/${courseId}/admin/edit` },
		{ label: 'Interactivos', href: `/course/${courseId}/admin/interactives` },
		{ label: 'Invitaciones', href: `/course/${courseId}/admin/invites` },
		{ label: 'Estadísticas', href: `/course/${courseId}/stats` }
	];
</script>

<div class="mb-6 rounded-lg bg-white shadow dark:bg-gray-800">
	<nav class="flex">
		{#each menuItems as item}
			<a
				href={item.href}
				class="px-4 py-2 text-gray-700 hover:bg-gray-100 hover:text-gray-900 dark:text-gray-300 dark:hover:bg-gray-700 dark:hover:text-white {$page
					.url.pathname === item.href
					? 'border-b-2 border-blue-500'
					: ''}"
			>
				{item.label}
			</a>
		{/each}
	</nav>
</div>
