<script lang="ts">
	import type { Snippet } from 'svelte';
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
		LayoutDashboard,
		Edit,
		Eye,
		Users,
		ChevronLeft,
		BarChart3,
		Sparkles,
		MessageSquare,
		Bot,
		ShieldAlert,
		Route
	} from 'lucide-svelte';
	import { resolve } from '$app/paths';

	let { data, children }: { data: LayoutData; children: Snippet } = $props();

	// Get the interactive and course IDs from the URL params
	const { cid, ilid } = page.params;

	// Sidebar state
	const sidebarUi = uiHelpers();
	let isSidebarOpen = $derived(sidebarUi.isOpen);

	// Active URL
	let activeUrl = $derived(page.url.pathname);

	const isAgent = $derived(data.interactive.type === 'agent');
	const isLesson = $derived(data.interactive.type === 'lesson');

	// Menu items for interactive admin
	const managementItems = $derived([
		{
			id: 'overview',
			label: 'Visión general',
			href: resolve(`/course/${cid}/admin/interactives/${ilid}`),
			icon: LayoutDashboard
		},
		{
			id: 'editor',
			label: 'Editor',
			href: resolve(`/course/${cid}/admin/interactives/${ilid}/${isLesson ? 'lessonedit' : isAgent ? 'agentedit' : 'chatedit'}`),
			icon: Edit
		},
		...(isLesson
			? [
					{
						id: 'review',
						label: 'Revisión',
						href: resolve(`/course/${cid}/admin/interactives/${ilid}/lesson-review`),
						icon: Eye
					}
				]
			: [
					{
						id: 'review',
						label: 'Revisión',
						href: resolve(
							`/course/${cid}/admin/interactives/${ilid}/${isAgent ? 'agent-review' : 'chat-review'}`
						),
						icon: Eye
					},
					{
						id: 'students',
						label: 'Estudiantes',
						href: resolve(`/course/${cid}/admin/interactives/${ilid}/students`),
						icon: Users
					}
				])
	]);
	const diagnosticItems = $derived([
		...(!isAgent && !isLesson
			? [
					{
						id: 'insights',
						label: 'Insights',
						href: resolve(`/course/${cid}/admin/interactives/${ilid}/insights`),
						icon: BarChart3
					}
				]
			: []),
		{
			id: 'staff-agent',
			label: 'Agente de intervencion',
			href: resolve(`/course/${cid}/admin/interactives/${ilid}/staff-agent`),
			icon: Bot
		},
		{
			id: 'agentic-insights',
			label: 'Asistente de analisis',
			href: resolve(`/course/${cid}/admin/interactives/${ilid}/agentic-insights`),
			icon: Sparkles
		}
	]);

	const previewHref = $derived(
		isLesson
			? resolve(`/lesson/${ilid}`)
			: isAgent
				? resolve(`/agent-chat/${ilid}`)
				: resolve(`/interactive-chat/${ilid}`)
	);

	const spanClass = 'ms-3 flex-1 whitespace-nowrap';
	const iconClass =
		'h-5 w-5 text-gray-500 transition duration-75 group-hover:text-gray-900 dark:text-gray-400 dark:group-hover:text-white';

	// Default course image
	const defaultCourseImage = '/images/default-course.jpg';
</script>

<div class="min-h-screen bg-gray-50 dark:bg-gray-900">
	<!-- Mobile sidebar toggle -->
	<div
		class="sticky top-16 z-30 flex items-center gap-4 border-b border-gray-200 bg-white px-4 py-3 dark:border-gray-700 dark:bg-gray-800 lg:hidden"
	>
		<SidebarButton
			onclick={sidebarUi.toggle}
			class="text-gray-500 hover:text-gray-900 dark:text-gray-400 dark:hover:text-white"
		/>
		<div class="flex items-center gap-3 truncate">
			<div class="flex h-8 w-8 items-center justify-center rounded-lg {isAgent ? 'bg-green-100 dark:bg-green-900/50' : isLesson ? 'bg-amber-100 dark:bg-amber-900/30' : 'bg-blue-100 dark:bg-blue-900/50'}">
				{#if isAgent}
					<Bot class="h-4 w-4 text-green-600 dark:text-green-400" />
				{:else if isLesson}
					<Route class="h-4 w-4 text-amber-600 dark:text-amber-400" />
				{:else}
					<MessageSquare class="h-4 w-4 text-blue-600 dark:text-blue-400" />
				{/if}
			</div>
			<span class="truncate text-lg font-semibold text-gray-900 dark:text-white">
				{data.interactive.name}
			</span>
		</div>
	</div>

	<div class="flex">
		<!-- Sidebar -->
		<Sidebar
			{activeUrl}
			isOpen={isSidebarOpen}
			closeSidebar={sidebarUi.close}
			class="fixed left-0 top-16 z-40 h-[calc(100vh-4rem)] w-64 border-r border-gray-200 bg-white transition-transform dark:border-gray-700 dark:bg-gray-800 lg:translate-x-0"
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
				<!-- Back to course admin -->
				<div class="mb-6">
					<a
						href={resolve(`/course/${cid}/admin/interactives`)}
						class="mb-4 flex items-center gap-2 text-sm text-gray-500 hover:text-primary-600 dark:text-gray-400 dark:hover:text-primary-400"
					>
						<ChevronLeft class="h-4 w-4" />
						Volver a actividades
					</a>

					<!-- Interactive Header -->
					<div class="rounded-xl bg-linear-to-br {isAgent ? 'from-green-500 to-green-600' : isLesson ? 'from-amber-500 to-orange-500' : 'from-blue-500 to-blue-600'} p-4">
						<div class="flex items-center gap-3">
							<div class="flex h-10 w-10 items-center justify-center rounded-lg bg-white/20">
								{#if isAgent}
									<Bot class="h-5 w-5 text-white" />
								{:else if isLesson}
									<Route class="h-5 w-5 text-white" />
								{:else}
									<MessageSquare class="h-5 w-5 text-white" />
								{/if}
							</div>
							<div class="min-w-0 flex-1">
								<h2 class="line-clamp-2 text-sm font-bold text-white">
									{data.interactive.name}
								</h2>
								<span class="text-xs {isAgent ? 'text-green-100' : isLesson ? 'text-amber-100' : 'text-blue-100'}">
									{data.interactive.type || 'chat'}
								</span>
							</div>
						</div>
					</div>

					<!-- Course info -->
					<div class="mt-3 flex items-center gap-2 rounded-lg bg-gray-100 p-2 dark:bg-gray-700">
						<img
							src={data.course.image || defaultCourseImage}
							alt={data.course.name}
							class="h-8 w-8 rounded object-cover"
						/>
						<div class="min-w-0 flex-1">
							<p class="truncate text-xs font-medium text-gray-900 dark:text-white">
								{data.course.name}
							</p>
							<a
								href={resolve(`/course/${cid}/admin`)}
								class="text-xs text-primary-600 hover:underline dark:text-primary-400"
							>
								Ir al admin del curso
							</a>
						</div>
					</div>
				</div>

				<!-- Navigation -->
				<SidebarGroup>
					<p class="mb-2 px-2 text-xs font-semibold uppercase tracking-wider text-gray-500 dark:text-gray-400">
						Gestión de actividad
					</p>
					{#each managementItems as item (item.id)}
						<SidebarItem label={item.label} href={item.href} {spanClass}>
							{#snippet icon()}
								<item.icon class={iconClass} />
							{/snippet}
						</SidebarItem>
					{/each}
				</SidebarGroup>

				<SidebarGroup border class="mt-4">
					<p class="mb-2 px-2 text-xs font-semibold uppercase tracking-wider text-gray-500 dark:text-gray-400">
						Diagnóstico docente
					</p>
					{#each diagnosticItems as item (item.id)}
						<SidebarItem label={item.label} href={item.href} {spanClass}>
							{#snippet icon()}
								<item.icon class={iconClass} />
							{/snippet}
						</SidebarItem>
					{/each}
					<div class="mt-3 rounded-xl bg-sky-50 p-3 dark:bg-sky-900/20">
						<div class="flex items-start gap-2">
							<ShieldAlert class="mt-0.5 h-4 w-4 shrink-0 text-sky-600 dark:text-sky-400" />
							<p class="text-xs leading-5 text-sky-800 dark:text-sky-200">
								Desde aquí puedes revisar fricción, abandono, intervención y análisis guiado sin salir del contexto de la actividad.
							</p>
						</div>
					</div>
				</SidebarGroup>

				<!-- Quick Actions -->
				<SidebarGroup border class="mt-4">
					<p class="mb-2 px-2 text-xs font-semibold uppercase tracking-wider text-gray-500 dark:text-gray-400">
						Acciones rápidas
					</p>
					<a
						href={previewHref}
						target="_blank"
						class="flex items-center gap-3 rounded-lg bg-green-50 p-3 text-green-700 transition-colors hover:bg-green-100 dark:bg-green-900/30 dark:text-green-400 dark:hover:bg-green-900/50"
					>
						<Eye class="h-5 w-5" />
						<span class="font-medium">Previsualizar</span>
					</a>
				</SidebarGroup>

				<!-- Activity Description at Bottom -->
				{#if data.interactive.description}
					<div class="mt-auto pt-4">
						<div class="rounded-xl bg-gray-100 p-4 dark:bg-gray-700">
							<p class="mb-1 text-xs font-semibold uppercase tracking-wider text-gray-500 dark:text-gray-400">
								Descripción
							</p>
							<p class="line-clamp-4 text-sm text-gray-600 dark:text-gray-300">
								{data.interactive.description}
							</p>
						</div>
					</div>
				{/if}
			</SidebarWrapper>
		</Sidebar>

		<!-- Main content -->
		<main class="min-h-screen flex-1 lg:ml-64">
			<div class="p-4 lg:p-6">
				{@render children()}
			</div>
		</main>
	</div>
</div>
