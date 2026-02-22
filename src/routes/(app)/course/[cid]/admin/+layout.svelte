<script lang="ts">
	import type { LayoutData } from './$types';
	import type { Snippet } from 'svelte';
	import { page } from '$app/state';
	import { resolve } from '$app/paths';
	import {
		Sidebar,
		SidebarGroup,
		SidebarItem,
		SidebarWrapper,
		SidebarButton,
		uiHelpers
	} from 'flowbite-svelte';
	import {
		LayoutDashboard,
		Users,
		BookOpen,
		BarChart3,
		Settings,
		ChevronLeft,
		GraduationCap,
		Menu,
		Plus,
		Eye
	} from 'lucide-svelte';

	let { data, children }: { data: LayoutData; children: Snippet } = $props();

	// Sidebar state
	const sidebarUi = uiHelpers();
	let isSidebarOpen = $derived(sidebarUi.isOpen);

	// Active URL
	let activeUrl = $derived(page.url.pathname);

	// Course-specific menu items
	const courseId = $derived(data.course.id);
	const menuItems = $derived([
		{
			id: 'overview',
			label: 'Visión general',
			href: `/course/${courseId}/admin`,
			icon: LayoutDashboard
		},
		{
			id: 'analytics',
			label: 'Learning analytics',
			href: `/course/${courseId}/admin/analytics`,
			icon: BarChart3
		},
		{
			id: 'activities',
			label: 'Actividades',
			href: `/course/${courseId}/admin/interactives`,
			icon: BookOpen
		},
		{
			id: 'students',
			label: 'Estudiantes',
			href: `/course/${courseId}/admin/students`,
			icon: Users
		},
		{
			id: 'edit',
			label: 'Editar curso',
			href: `/course/${courseId}/admin/edit`,
			icon: Settings
		}
	]);

	const spanClass = 'ms-3 flex-1 whitespace-nowrap';
	const iconClass =
		'h-5 w-5 text-gray-500 transition duration-75 group-hover:text-gray-900 dark:text-gray-400 dark:group-hover:text-white';

	// Default course image
	const defaultCourseImage = '/images/default-course.jpg';
</script>

<div class="bg-gray-50 dark:bg-gray-900">
	<!-- Mobile sidebar toggle -->
	<div
		class="sticky top-16 z-30 flex items-center gap-4 border-b border-gray-200 bg-white px-4 py-3 dark:border-gray-700 dark:bg-gray-800 lg:hidden"
	>
		<SidebarButton
			onclick={sidebarUi.toggle}
			class="text-gray-500 hover:text-gray-900 dark:text-gray-400 dark:hover:text-white"
		/>
		<div class="flex items-center gap-3 truncate">
			<img
				src={data.course.image || defaultCourseImage}
				alt={data.course.name}
				class="h-8 w-8 rounded-lg object-cover"
			/>
			<span class="truncate text-lg font-semibold text-gray-900 dark:text-white">
				{data.course.name}
			</span>
		</div>
	</div>

	<div class="flex">
		<!-- Sidebar -->
		<Sidebar
			{activeUrl}
			isOpen={isSidebarOpen}
			closeSidebar={sidebarUi.close}
			class="fixed left-0 top-16 z-40 h-[calc(100dvh-4rem)] w-64 overflow-y-auto border-r border-gray-200 bg-white transition-transform dark:border-gray-700 dark:bg-gray-800 lg:translate-x-0"
			position="fixed"
			backdrop={true}
			backdropClass="!top-16"
			breakpoint="lg"
			classes={{
				nonactive:
					'flex items-center p-2.5 text-base font-normal text-gray-900 rounded-lg dark:text-white hover:bg-gray-100 dark:hover:bg-gray-700',
				active:
					'flex items-center p-2.5 text-base font-normal text-white bg-primary-600 rounded-lg dark:bg-primary-700 hover:bg-primary-700 dark:hover:bg-primary-800'
			}}
		>
			<SidebarWrapper class="flex h-full flex-col px-3 py-4">
				<!-- Course Header -->
				<div class="mb-6">
					<a
						href={resolve('/teacher')}
						class="mb-4 flex items-center gap-2 text-sm text-gray-500 hover:text-primary-600 dark:text-gray-400 dark:hover:text-primary-400"
					>
						<ChevronLeft class="h-4 w-4" />
						Volver a cursos
					</a>
					<div class="overflow-hidden rounded-xl">
						<img
							src={data.course.image || defaultCourseImage}
							alt={data.course.name}
							class="h-32 w-full object-cover"
						/>
					</div>
					<div class="mt-3">
						<h2 class="line-clamp-2 text-lg font-bold text-gray-900 dark:text-white">
							{data.course.name}
						</h2>
						{#if data.course.description}
							<p class="mt-1 line-clamp-2 text-sm text-gray-500 dark:text-gray-400">
								{data.course.description}
							</p>
						{/if}
					</div>
				</div>

				<!-- Navigation -->
				<SidebarGroup>
					<p class="mb-2 px-2 text-xs font-semibold uppercase tracking-wider text-gray-500 dark:text-gray-400">
						Gestión
					</p>
					{#each menuItems as item (item.id)}
						<SidebarItem label={item.label} href={item.href} {spanClass}>
							{#snippet icon()}
								<item.icon class={iconClass} />
							{/snippet}
						</SidebarItem>
					{/each}
				</SidebarGroup>

				<!-- Quick Actions -->
				<SidebarGroup border class="mt-4">
					<p class="mb-2 px-2 text-xs font-semibold uppercase tracking-wider text-gray-500 dark:text-gray-400">
						Acciones rápidas
					</p>
					<a
						href={resolve(`/course/${courseId}/admin/interactives/new`)}
						class="flex items-center gap-3 rounded-lg bg-green-50 p-3 text-green-700 transition-colors hover:bg-green-100 dark:bg-green-900/30 dark:text-green-400 dark:hover:bg-green-900/50"
					>
						<Plus class="h-5 w-5" />
						<span class="font-medium">Nueva actividad</span>
					</a>
					<a
						href={resolve(`/course/${courseId}/run`)}
						class="mt-2 flex items-center gap-3 rounded-lg bg-blue-50 p-3 text-blue-700 transition-colors hover:bg-blue-100 dark:bg-blue-900/30 dark:text-blue-400 dark:hover:bg-blue-900/50"
					>
						<Eye class="h-5 w-5" />
						<span class="font-medium">Vista estudiante</span>
					</a>
				</SidebarGroup>

				<!-- Stats Summary at Bottom -->
				<div class="mt-auto pt-4">
					<div class="rounded-xl bg-gray-100 p-4 dark:bg-gray-700">
						<div class="flex items-center justify-between">
							<div class="flex items-center gap-2">
								<Users class="h-4 w-4 text-gray-500 dark:text-gray-400" />
								<span class="text-sm text-gray-600 dark:text-gray-300">Estudiantes</span>
							</div>
							<span class="font-bold text-gray-900 dark:text-white">
								{data.enrolledStudents?.length || 0}
							</span>
						</div>
						<div class="mt-2 flex items-center justify-between">
							<div class="flex items-center gap-2">
								<BookOpen class="h-4 w-4 text-gray-500 dark:text-gray-400" />
								<span class="text-sm text-gray-600 dark:text-gray-300">Actividades</span>
							</div>
							<span class="font-bold text-gray-900 dark:text-white">
								{data.interactives?.length || 0}
							</span>
						</div>
					</div>
				</div>
			</SidebarWrapper>
		</Sidebar>

		<!-- Main content -->
		<main class="flex-1 lg:ml-64">
			<div class="p-4 lg:p-6">
				{@render children()}
			</div>
		</main>
	</div>
</div>
