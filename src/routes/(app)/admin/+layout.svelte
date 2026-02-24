<script lang="ts">
	import { type Snippet } from 'svelte';
	import type { LayoutData } from './$types';
	import { page } from '$app/state';
	import {
		Sidebar,
		SidebarGroup,
		SidebarItem,
		SidebarWrapper,
		SidebarButton,
		uiHelpers
	} from 'flowbite-svelte';
	import {
		Users,
		User,
		BookOpen,
		Settings,
		LayoutDashboard,
		Home,
		Bot,
		ImagePlus,
		Database,
		BarChart3,
		Cpu,
		FolderOpen,
		ScrollText,
		TicketPlus,
		Wrench
	} from 'lucide-svelte';
	import { min } from 'drizzle-orm';

	let { data, children }: { data: LayoutData; children: Snippet } = $props();

	// Sidebar state
	const sidebarUi = uiHelpers();
	let isSidebarOpen = $derived(sidebarUi.isOpen);

	// Determine active URL based on current path
	let activeUrl = $derived(page.url.pathname);

	// Constantes de niveles de rol (deben coincidir con ROLE_LEVELS del servidor)
	const ROLE_LEVELS = {
		SUPER_ADMIN: 100,
		ADMIN: 90,
		TEACHER: 50,
		ASSISTANT: 40,
		STUDENT: 10
	} as const;

	// Menu items for admin sidebar - ahora usando niveles de rol
	const menuItems = [
		{ id: 'dashboard', label: 'Dashboard', href: '/admin', icon: LayoutDashboard, minLevel: ROLE_LEVELS.ADMIN },
		{ id: 'users', label: 'Usuarios', href: '/admin/users', icon: Users, minLevel: ROLE_LEVELS.ADMIN },
		{
			id: 'courses',
			label: 'Cursos',
			href: '/admin/courses',
			icon: BookOpen,
			minLevel: ROLE_LEVELS.ADMIN
		},
		{
			id: 'invites',
			label: 'Invitaciones',
			href: '/admin/invites',
			icon: TicketPlus,
			minLevel: ROLE_LEVELS.ADMIN
		},
		{
			id: 'ai-models',
			label: 'Modelos IA',
			href: '/admin/ai-models',
			icon: Cpu,
			minLevel: ROLE_LEVELS.ADMIN
		},
		{
			id: 'model-playground',
			label: 'Playground IA',
			href: '/admin/model-playground',
			icon: Bot,
			minLevel: ROLE_LEVELS.ADMIN
		},
		{
			id: 'image-playground',
			label: 'Playground Imágenes',
			href: '/admin/image-playground',
			icon: ImagePlus,
			minLevel: ROLE_LEVELS.ADMIN
		},
		{
			id: 'qdrant',
			label: 'Qdrant (Vectores)',
			href: '/admin/qdrant',
			icon: Database,
			minLevel: ROLE_LEVELS.ADMIN
		},
		{
			id: 'analytics',
			label: 'Analytics',
			href: '/admin/analytics',
			icon: BarChart3,
			minLevel: ROLE_LEVELS.ADMIN
		},
		{
			id: 'files',
			label: 'Archivos',
			href: '/admin/files',
			icon: FolderOpen,
			minLevel: ROLE_LEVELS.ADMIN
		},
		{
			id: 'logs',
			label: 'Audit Logs',
			href: '/admin/logs',
			icon: ScrollText,
			minLevel: ROLE_LEVELS.ADMIN
		},
		{
			id: 'maintenance',
			label: 'Mantenimiento',
			href: '/admin/maintenance',
			icon: Wrench,
			minLevel: ROLE_LEVELS.SUPER_ADMIN
		},
		{ id: 'settings', label: 'Configuración', href: '/admin/settings', icon: Settings }
	];

	const spanClass = 'ms-3 flex-1 whitespace-nowrap';
	const iconClass =
		'h-5 w-5 text-gray-500 transition duration-75 group-hover:text-gray-900 dark:text-gray-400 dark:group-hover:text-white';
</script>

<div class="bg-gray-50 dark:bg-gray-900">
	<!-- Mobile sidebar toggle - positioned below main navbar -->
	<div
		class="sticky top-16 z-30 flex items-center gap-4 border-b border-gray-200 bg-white px-4 py-3 lg:hidden dark:border-gray-700 dark:bg-gray-800"
	>
		<SidebarButton
			onclick={sidebarUi.toggle}
			class="text-gray-500 hover:text-gray-900 dark:text-gray-400 dark:hover:text-white"
		/>
		<span class="text-lg font-semibold text-gray-900 dark:text-white">Panel de Administración</span>
	</div>

	<div class="flex">
		<!-- Sidebar - starts below main navbar on mobile -->
		<Sidebar
			{activeUrl}
			isOpen={isSidebarOpen}
			closeSidebar={sidebarUi.close}
			class="fixed top-16 left-0 z-40 h-[calc(100dvh-4rem)] w-64 overflow-y-auto border-r border-gray-200 bg-white pt-4 transition-transform lg:top-16 lg:h-[calc(100dvh-4rem)] lg:translate-x-0 dark:border-gray-700 dark:bg-gray-800"
			position="fixed"
			backdrop={true}
			backdropClass="!top-16"
			breakpoint="lg"
			classes={{
				nonactive:
					'flex items-center p-2 text-base font-normal text-gray-900 rounded-lg dark:text-white hover:bg-gray-100 dark:hover:bg-gray-700',
				active:
					'flex items-center p-2 text-base font-normal text-white bg-primary-600 rounded-lg dark:bg-primary-700 hover:bg-primary-700 dark:hover:bg-primary-800'
			}}
		>
			<SidebarWrapper class="px-3">
				<!-- Brand/Logo -->
				<div class="mb-6 flex items-center gap-3 px-2">
					<div
						class="bg-primary-600 flex h-10 w-10 items-center justify-center rounded-lg text-white"
					>
						<Home class="h-6 w-6" />
					</div>
					<div>
						<span class="text-lg font-bold text-gray-900 dark:text-white">SAPIN</span>
						<p class="text-xs text-gray-500 dark:text-gray-400">Panel Admin</p>
					</div>
				</div>

				<SidebarGroup>
					{#each menuItems as item (item.id)}
						{#if !item.minLevel || (data.user?.highestRoleLevel ?? 0) >= item.minLevel}
							<SidebarItem label={item.label} href={item.href} {spanClass}>
								{#snippet icon()}
									<item.icon class={iconClass} />
								{/snippet}
							</SidebarItem>
						{/if}
					{/each}
				</SidebarGroup>

				<!-- User info at bottom -->
				<SidebarGroup border class="mt-auto">
					<div class="flex items-center gap-3 rounded-lg bg-gray-100 p-3 dark:bg-gray-700">
						<div
							class="bg-primary-100 text-primary-600 dark:bg-primary-900 dark:text-primary-400 flex h-10 w-10 items-center justify-center rounded-full"
						>
							{(data.user?.username || 'A').charAt(0).toUpperCase()}
						</div>
						<div class="flex-1 truncate">
							<p class="truncate text-sm font-medium text-gray-900 dark:text-white">
								{data.user?.username || 'Admin'}
							</p>
							<p class="truncate text-xs text-gray-500 dark:text-gray-400">
								{data.user?.email || ''}
							</p>
						</div>
					</div>
				</SidebarGroup>
			</SidebarWrapper>
		</Sidebar>

		<!-- Main content -->
		<main class="flex-1 lg:ml-64">
			<div class="p-4 lg:p-8">
				<!-- Breadcrumb header -->
				<div class="mb-6 hidden items-center justify-between lg:flex">
					<div>
						<h1 class="text-2xl font-bold text-gray-900 dark:text-white">
							Panel de Administración
						</h1>
						<p class="mt-1 text-sm text-gray-500 dark:text-gray-400">
							Gestiona usuarios, cursos y configuración del sistema
						</p>
					</div>
					<a
						href="/"
						class="flex items-center gap-2 rounded-lg border border-gray-200 bg-white px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 dark:border-gray-600 dark:bg-gray-700 dark:text-gray-200 dark:hover:bg-gray-600"
					>
						<Home class="h-4 w-4" />
						Volver al inicio
					</a>
				</div>

				<!-- Page content -->
				<div class="rounded-xl bg-white p-4 shadow-sm lg:p-6 dark:bg-gray-800">
					{@render children()}
				</div>
			</div>
		</main>
	</div>
</div>
