<script lang="ts">
	import ResponsiveSidebar from '$lib/components/ResponsiveSidebar.svelte';
	import { resolve } from '$app/paths';
	import type { LayoutData } from './$types';
	import type { Snippet } from 'svelte';
	import { page } from '$app/state';
	import {
		SidebarGroup,
		SidebarItem,
		SidebarWrapper,
		SidebarButton,
		uiHelpers,
		Badge
	} from 'flowbite-svelte';
	import {
		LayoutDashboard,
		Users,
		BookOpen,
		Settings,
		ChevronLeft,
		GraduationCap,
		Eye
	} from 'lucide-svelte';

	let { data, children }: { data: LayoutData; children: Snippet } = $props();

	// Sidebar state
	const sidebarUi = uiHelpers();
	const isSidebarOpen = $derived(sidebarUi.isOpen);

	// Active URL
	let activeUrl = $derived(page.url.pathname);

	// Course-specific menu items
	const courseId = $derived(data.course.id);
	const menuItems = $derived([
		{
			id: 'overview',
			label: 'Visión general',
			href: `/admin/courses/${courseId}`,
			icon: LayoutDashboard,
			badge: null
		},
		{
			id: 'edit',
			label: 'Configuración',
			href: `/admin/courses/${courseId}/edit`,
			icon: Settings,
			badge: null
		},
		{
			id: 'teachers',
			label: 'Profesores',
			href: `/admin/courses/${courseId}/teachers`,
			icon: Users,
			badge: data.teachers?.length || 0
		},
		{
			id: 'students',
			label: 'Estudiantes',
			href: `/admin/courses/${courseId}/students`,
			icon: GraduationCap,
			badge: data.students?.length || 0
		},
		{
			id: 'interactives',
			label: 'Actividades',
			href: `/admin/courses/${courseId}/interactives`,
			icon: BookOpen,
			badge: data.interactives?.length || 0
		}
	]);

	const spanClass = 'ms-3 flex-1 whitespace-nowrap';
	const iconClass = 'h-[18px] w-[18px] shrink-0 text-current';

	// Get status badge color
	function getStatusBadgeColor(status: string): 'green' | 'yellow' | 'gray' {
		switch (status) {
			case 'published':
				return 'green';
			case 'draft':
				return 'yellow';
			case 'archived':
				return 'gray';
			default:
				return 'gray';
		}
	}

	// Get status label
	function getStatusLabel(status: string): string {
		switch (status) {
			case 'published':
				return 'Publicado';
			case 'draft':
				return 'Borrador';
			case 'archived':
				return 'Archivado';
			default:
				return status;
		}
	}
</script>

<svelte:head>
	<title>{data.course.name} · Administración - SAPIN</title>
</svelte:head>

{#snippet courseThumbnail(size: string)}
	<div
		class="{size} flex shrink-0 items-center justify-center overflow-hidden rounded-lg border border-gray-200 bg-white text-gray-500 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-400"
	>
		{#if data.course.image}
			<img src={data.course.image} alt="" class="h-full w-full object-cover" />
		{:else}
			<BookOpen class="h-5 w-5" aria-hidden="true" />
		{/if}
	</div>
{/snippet}

<div class="bg-gray-50 dark:bg-gray-900">
	<!-- Keep the existing mobile drawer and breakpoint. -->
	<div
		class="sticky top-16 z-30 flex items-center gap-3 border-b border-gray-200 bg-white px-4 py-3 lg:hidden dark:border-gray-700 dark:bg-gray-800"
	>
		<SidebarButton
			breakpoint="lg"
			aria-expanded={isSidebarOpen}
			aria-controls="context-sidebar"
			onclick={sidebarUi.toggle}
			class="text-gray-500 hover:text-gray-900 dark:text-gray-400 dark:hover:text-white"
		/>
		{@render courseThumbnail('h-8 w-8')}
		<span class="truncate text-sm font-semibold text-gray-900 dark:text-white"
			>{data.course.name}</span
		>
	</div>

	<div class="flex">
		<ResponsiveSidebar
			ariaLabel="Navegación de administración"
			{activeUrl}
			isOpen={isSidebarOpen}
			closeSidebar={sidebarUi.close}
			class="fixed top-16 left-0 z-40 h-[calc(100dvh-4rem)] w-64 border-r border-gray-200 bg-gray-50 transition-transform lg:translate-x-0 dark:border-gray-800 dark:bg-gray-900"
			position="fixed"
			backdrop={true}
			breakpoint="lg"
			classes={{
				div: 'h-full overflow-y-auto bg-gray-50 p-0 dark:bg-gray-900',
				backdrop: '!top-16',
				nonactive:
					'flex min-h-10 items-center rounded-lg px-3 py-2 text-sm font-medium text-gray-600 transition-colors hover:bg-gray-100 hover:text-gray-950 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary-600 dark:text-gray-300 dark:hover:bg-gray-800 dark:hover:text-white',
				active:
					'flex min-h-10 items-center rounded-lg bg-primary-50 px-3 py-2 text-sm font-semibold text-primary-800 ring-1 ring-inset ring-primary-200/60 hover:bg-primary-100 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary-600 dark:bg-primary-900/20 dark:text-primary-200 dark:ring-primary-800/50 dark:hover:bg-primary-900/30'
			}}
		>
			<SidebarWrapper class="flex min-h-full flex-col px-3 py-4">
				<a
					href={resolve('/admin/courses')}
					class="focus-visible:outline-primary-600 mb-5 flex min-h-9 items-center gap-2 rounded-lg px-2 text-xs font-medium text-gray-500 hover:bg-gray-100 hover:text-gray-900 focus-visible:outline-2 dark:text-gray-400 dark:hover:bg-gray-800 dark:hover:text-white"
				>
					<ChevronLeft class="h-4 w-4" aria-hidden="true" />
					Volver a cursos
				</a>

				<div class="mb-5 flex items-start gap-3 px-2">
					{@render courseThumbnail('h-10 w-10')}
					<div class="min-w-0 flex-1">
						<h2
							class="line-clamp-2 text-sm leading-5 font-semibold break-words text-gray-950 dark:text-white"
							title={data.course.name}
						>
							{data.course.name}
						</h2>
						<Badge
							color={getStatusBadgeColor(data.course.status)}
							class="mt-1.5 text-[11px] font-medium">{getStatusLabel(data.course.status)}</Badge
						>
					</div>
				</div>

				<p class="mb-2 px-3 text-xs font-medium text-gray-500 dark:text-gray-400">
					Administración del curso
				</p>
				<SidebarGroup class="space-y-1">
					{#each menuItems as item (item.id)}
						<SidebarItem
							label={item.label}
							href={item.href}
							{spanClass}
							aria-current={activeUrl === item.href ? 'page' : undefined}
						>
							{#snippet icon()}
								<item.icon class={iconClass} aria-hidden="true" />
							{/snippet}
							{#snippet subtext()}
								{#if item.badge !== null}
									<span
										class="ml-auto min-w-5 text-right text-xs font-medium tabular-nums opacity-80"
										>{item.badge}</span
									>
								{/if}
							{/snippet}
						</SidebarItem>
					{/each}
				</SidebarGroup>

				<div class="mt-auto pt-6">
					<div class="border-t border-gray-200 pt-3 dark:border-gray-800">
						<a
							href={resolve(`/course/${courseId}/run`)}
							class="focus-visible:outline-primary-600 flex min-h-10 items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium text-gray-600 hover:bg-gray-100 hover:text-gray-950 focus-visible:outline-2 focus-visible:outline-offset-2 dark:text-gray-300 dark:hover:bg-gray-800 dark:hover:text-white"
						>
							<Eye class="h-[18px] w-[18px]" aria-hidden="true" />
							Vista estudiante
						</a>
					</div>
				</div>
			</SidebarWrapper>
		</ResponsiveSidebar>

		<!-- Main content -->
		<main class="flex-1">
			<div class="p-4 lg:p-6">
				{@render children()}
			</div>
		</main>
	</div>
</div>
