<script lang="ts">
	import { resolve } from '$app/paths';
	import { page } from '$app/stores';
	import { LogOut, LogIn, User, Menu, Moon, Sun, X, Home, Shield, BookOpen } from 'lucide-svelte';
	import { theme } from '$lib/stores/theme';
	import { topbarMenuItems } from '$lib/stores/topbarNavigation';
	import '$app/navigation';
	import { m } from '$lib/paraglide/messages.js';
	import {
		Button,
		Avatar,
		Badge,
		Dropdown,
		DropdownHeader,
		DropdownItem,
		DropdownGroup,
		GradientButton
	} from 'flowbite-svelte';
	import { slide } from 'svelte/transition';
	import { ChevronDownOutline } from 'flowbite-svelte-icons';
	import NotificationBell from './notifications/NotificationBell.svelte';
	import { scale } from 'svelte/transition';

	const { user, isMobileMenuOpen, onMenuToggle } = $props<{
		user: any;
		isMobileMenuOpen: boolean;
		onMenuToggle: () => void;
	}>();

	// Usar $derived para mantener reactividad con los props - nuevo sistema de roles
	const userHighestRole = $derived(user?.highestRole);
	const userRoleName = $derived(userHighestRole?.name || 'student');
	const userHighestRoleLevel = $derived(user?.highestRoleLevel || 0);

	// Verificar si el usuario puede acceder a administración (nivel >= 90)
	const canAccessAdmin = $derived(userHighestRoleLevel >= 90);

	// Filtrar items del menú usando el nuevo sistema de niveles
	const filteredMenuItems = $derived(
		$topbarMenuItems.filter((item) => {
			// Si no tiene restricción, mostrar siempre
			if (!item.minLevel && !item.roles) return true;
			// Nuevo sistema: verificar nivel
			if (item.minLevel) return userHighestRoleLevel >= item.minLevel;
			// Sistema legacy: verificar rol por nombre
			return userRoleName && item.roles?.includes(userRoleName);
		})
	);

	function toggleTheme() {
		$theme = $theme === 'dark' ? 'light' : 'dark';
	}

	// Obtener el nombre a mostrar del rol - usa displayName del nuevo sistema o fallback
	function getRoleDisplayName(): string {
		if (userHighestRole?.displayName) {
			return userHighestRole.displayName;
		}
		// Fallback para roles sin displayName
		switch (userRoleName) {
			case 'super_admin':
				return 'Super Administrador';
			case 'admin':
				return 'Administrador';
			case 'teacher':
				return 'Profesor';
			case 'assistant':
				return 'Asistente';
			case 'student':
				return 'Estudiante';
			default:
				return 'Usuario';
		}
	}

	function getRoleBadgeColor(roleName: string): 'red' | 'purple' | 'blue' | 'yellow' | 'green' {
		switch (roleName) {
			case 'super_admin':
				return 'red';
			case 'admin':
				return 'purple';
			case 'teacher':
				return 'blue';
			case 'assistant':
				return 'yellow';
			default:
				return 'green';
		}
	}
</script>

<header
	class="fixed top-0 right-0 left-0 z-50 border-b border-gray-200/50 bg-white/80 backdrop-blur-lg transition-all duration-300 dark:border-gray-700/50 dark:bg-gray-900/80"
>
	<div class="mx-auto flex h-14 max-w-7xl items-center justify-between px-6 md:h-16">
		<div class="flex items-center gap-4">
			<!-- Mobile menu button -->
			<button
				class="rounded-xl p-2 text-gray-600 transition-all duration-200 hover:bg-gray-100/50 md:hidden dark:text-gray-400 dark:hover:bg-gray-800/50"
				onclick={onMenuToggle}
				aria-label="Menu"
			>
				{#if isMobileMenuOpen}
					<div in:scale={{ duration: 200, start: 0.8 }}>
						<X size={20} />
					</div>
				{:else}
					<div in:scale={{ duration: 200, start: 0.8 }}>
						<Menu size={20} />
					</div>
				{/if}
			</button>

			<!-- Site Logo -->
			<a href={resolve('/')} class="group flex items-center gap-2">
				<div class="relative flex items-center justify-center">
					<div
						class="bg-primary-500/20 group-hover:bg-primary-500/30 absolute inset-0 rounded-full blur-lg transition-all duration-500"
					></div>
					<img
						src="/images/sapin-magic_128.webp"
						alt="SAPIN Logo"
						class="relative z-10 h-9 w-auto transition-transform duration-500 group-hover:scale-110 group-hover:rotate-6 md:h-10"
					/>
				</div>
				<span
					class="hidden bg-linear-to-r from-slate-900 to-slate-700 bg-clip-text text-xl font-black tracking-tight text-transparent sm:block dark:from-white dark:to-slate-300"
				>
					SAPIN
				</span>
			</a>
		</div>

		<!-- Desktop Navigation -->
		<nav class="hidden items-center gap-8 md:flex">
			{#each filteredMenuItems as item (item.href)}
				<a
					href={resolve(...([item.href] as Parameters<typeof resolve>))}
					class="group hover:text-primary-600 dark:hover:text-primary-400 relative px-1 py-2 text-sm font-semibold tracking-wide text-slate-600 transition-all duration-300 dark:text-slate-300"
				>
					<span class="relative z-10">{item.label}</span>
					<span
						class="bg-primary-500 absolute bottom-0 left-0 h-0.5 w-full origin-right scale-x-0 transition-transform duration-500 group-hover:origin-left group-hover:scale-x-100"
					></span>
					{#if $page.url.pathname === item.href}
						<span class="bg-primary-500/50 absolute bottom-0 left-0 h-0.5 w-full"></span>
					{/if}
				</a>
			{/each}
		</nav>

		<!-- Right side controls -->
		<div class="flex items-center gap-2 md:gap-4">
			<!-- Theme Toggle -->
			<Button
				pill
				color="light"
				class="border-none bg-transparent p-2.5! transition-all duration-300 hover:bg-gray-100 dark:hover:bg-gray-800"
				onclick={toggleTheme}
			>
				{#if $theme === 'dark'}
					<Sun size={18} class="animate-pulse text-yellow-400" />
				{:else}
					<Moon size={18} class="text-indigo-600" />
				{/if}
			</Button>

			<!-- Notifications -->
			{#if user}
				<NotificationBell userId={user.id} />
			{/if}

			{#if user}
				<!-- User Avatar Button -->
				<Button
					pill
					color="light"
					id="user-menu-btn"
					class="flex items-center gap-2.5 border-gray-200/50 bg-gray-50/50 p-1.5! transition-all duration-300 hover:bg-white dark:border-gray-700/50 dark:bg-gray-800/50 dark:hover:bg-gray-800"
				>
					<Avatar
						src={user.image || '/images/default_avatar.png'}
						class="ring-primary-500/20 h-7 w-7 shadow-sm ring-2 md:h-8 md:w-8"
						alt={user.username || 'Usuario'}
					/>
					<span
						class="hidden max-w-24 truncate text-sm font-bold text-slate-700 lg:block dark:text-slate-200"
					>
						{user.username?.split(' ')[0] || 'Usuario'}
					</span>
					<ChevronDownOutline
						class="h-3.5 w-3.5 text-gray-500 transition-transform duration-300 group-hover:translate-y-0.5 dark:text-gray-400"
					/>
				</Button>

				<!-- User Dropdown Menu -->
				<Dropdown
					triggeredBy="#user-menu-btn"
					class="w-72 overflow-hidden rounded-2xl border-none shadow-2xl ring-1 ring-black/5 dark:ring-white/10"
				>
					<!-- Header con info del usuario -->
					<DropdownHeader class="border-none p-0!">
						<div
							class="bg-linear-to-br from-indigo-50/50 via-blue-50/50 to-white p-5 dark:from-indigo-950/40 dark:via-gray-900/40 dark:to-gray-900"
						>
							<div class="flex items-center gap-4">
								<div class="relative">
									<Avatar
										src={user.image || '/images/default_avatar.png'}
										size="lg"
										class="shadow-xl ring-4 ring-white dark:ring-gray-800"
										alt={user.username || 'Usuario'}
									/>
									<div
										class="absolute -right-1 -bottom-1 h-4 w-4 rounded-full border-2 border-white bg-green-500 dark:border-gray-800"
									></div>
								</div>
								<div class="min-w-0 flex-1">
									<p
										class="truncate text-base font-black tracking-tight text-slate-900 dark:text-white"
									>
										{user.username || 'Usuario'}
									</p>
									<p class="truncate text-xs font-medium text-slate-500 dark:text-slate-400">
										{user.email || ''}
									</p>
									<div class="mt-2.5">
										<Badge
											color={getRoleBadgeColor(userRoleName)}
											class="rounded-full px-2 py-0.5 text-[10px] font-bold tracking-wider uppercase shadow-sm"
										>
											{getRoleDisplayName()}
										</Badge>
									</div>
								</div>
							</div>
						</div>
					</DropdownHeader>

					<!-- Menu Items -->
					<DropdownGroup class="space-y-1 p-2">
						<DropdownItem
							href={resolve('/dashboard')}
							class="group/item rounded-xl transition-all duration-200 hover:bg-indigo-50/50 dark:hover:bg-indigo-900/20"
						>
							<div class="flex items-center gap-3.5">
								<div
									class="rounded-xl bg-indigo-100/50 p-2 transition-transform duration-300 group-hover/item:scale-110 dark:bg-indigo-900/40"
								>
									<Home class="h-4 w-4 text-indigo-600 dark:text-indigo-400" />
								</div>
								<div>
									<p class="text-sm font-bold tracking-tight text-slate-700 dark:text-slate-200">
										Mi Espacio
									</p>
									<p class="text-[11px] text-slate-500 dark:text-slate-400">Dashboard personal</p>
								</div>
							</div>
						</DropdownItem>

						<DropdownItem
							href={resolve('/profile')}
							class="group/item rounded-xl transition-all duration-200 hover:bg-slate-50/50 dark:hover:bg-slate-800/50"
						>
							<div class="flex items-center gap-3.5">
								<div
									class="rounded-xl bg-slate-100/50 p-2 transition-transform duration-300 group-hover/item:scale-110 dark:bg-slate-800/50"
								>
									<User class="h-4 w-4 text-slate-600 dark:text-slate-400" />
								</div>
								<div>
									<p class="text-sm font-bold tracking-tight text-slate-700 dark:text-slate-200">
										Mi Perfil
									</p>
									<p class="text-[11px] text-slate-500 dark:text-slate-400">Datos y biografía</p>
								</div>
							</div>
						</DropdownItem>

						<DropdownItem
							href={resolve('/student')}
							class="group/item rounded-xl transition-all duration-200 hover:bg-blue-50/50 dark:hover:bg-blue-900/20"
						>
							<div class="flex items-center gap-3.5">
								<div
									class="rounded-xl bg-blue-100/50 p-2 transition-transform duration-300 group-hover/item:scale-110 dark:bg-blue-900/40"
								>
									<BookOpen class="h-4 w-4 text-blue-600 dark:text-blue-400" />
								</div>
								<div>
									<p class="text-sm font-bold tracking-tight text-slate-700 dark:text-slate-200">
										Mis Cursos
									</p>
									<p class="text-[11px] text-slate-500 dark:text-slate-400">
										Aula virtual interactiva
									</p>
								</div>
							</div>
						</DropdownItem>
					</DropdownGroup>

					<!-- Admin Section -->
					{#if canAccessAdmin}
						<div class="mt-1 px-4 py-2">
							<div class="h-px bg-slate-100 dark:bg-slate-800"></div>
						</div>
						<DropdownGroup class="p-2">
							<DropdownItem
								href={resolve('/admin')}
								class="group/item rounded-xl transition-all duration-200 hover:bg-purple-50/50 dark:hover:bg-purple-900/20"
							>
								<div class="flex items-center gap-3.5">
									<div
										class="rounded-xl bg-purple-100/50 p-2 transition-transform duration-300 group-hover/item:scale-110 dark:bg-purple-900/40"
									>
										<Shield class="h-4 w-4 text-purple-600 dark:text-purple-400" />
									</div>
									<div>
										<p
											class="text-sm font-bold tracking-tight text-purple-700 dark:text-purple-300"
										>
											Administración
										</p>
										<p class="text-[11px] text-purple-500/70">Control global</p>
									</div>
								</div>
							</DropdownItem>
						</DropdownGroup>
					{/if}

					<div class="px-4 py-2">
						<div class="h-px bg-slate-100 dark:bg-slate-800"></div>
					</div>

					<!-- Logout -->
					<DropdownGroup class="p-2">
						<DropdownItem
							href={resolve('/logout')}
							class="group/item rounded-xl transition-all duration-200 hover:bg-red-50/50 dark:hover:bg-red-900/20"
						>
							<div class="flex items-center gap-3.5">
								<div
									class="rounded-xl bg-red-100/50 p-2 transition-transform duration-300 group-hover/item:scale-110 dark:bg-red-900/40"
								>
									<LogOut class="h-4 w-4 text-red-600 dark:text-red-400" />
								</div>
								<div>
									<p class="text-sm font-bold tracking-tight text-red-600 dark:text-red-400">
										Cerrar sesión
									</p>
								</div>
							</div>
						</DropdownItem>
					</DropdownGroup>
				</Dropdown>
			{:else}
				<div class="flex items-center gap-3">
					<a
						href={resolve('/login')}
						class="hidden px-4 py-2 text-sm font-bold text-slate-600 transition-colors duration-200 hover:text-slate-900 sm:block dark:text-slate-400 dark:hover:text-white"
					>
						{m.login()}
					</a>
					<GradientButton
						href={resolve('/register')}
						size="sm"
						color="purpleToBlue"
						class="hidden transform items-center gap-2 rounded-full px-6 py-2.5 text-xs font-black tracking-widest uppercase shadow-lg shadow-blue-500/20 transition-all duration-300 hover:scale-105 sm:flex"
					>
						Registro
					</GradientButton>
					<Button
						href={resolve('/login')}
						size="sm"
						color="blue"
						class="flex items-center justify-center rounded-full p-2.5 shadow-lg shadow-blue-500/20 sm:hidden"
					>
						<LogIn size={18} />
					</Button>
				</div>
			{/if}
		</div>
	</div>

	<!-- Mobile Navigation -->
	{#if isMobileMenuOpen}
		<div
			transition:slide={{ duration: 400 }}
			class="fixed inset-0 top-14 z-40 overflow-y-auto bg-white/95 backdrop-blur-xl md:hidden dark:bg-gray-900/95"
		>
			<nav class="space-y-6 p-6">
				<div class="space-y-3">
					<p
						class="ml-2 text-[10px] font-black tracking-widest text-slate-400 uppercase dark:text-slate-500"
					>
						Navegación
					</p>
					<div class="grid grid-cols-1 gap-3">
						{#each filteredMenuItems as item (item.href)}
							<a
								href={resolve(...([item.href] as Parameters<typeof resolve>))}
								class="hover:bg-primary-50 dark:hover:bg-primary-900/20 group flex items-center gap-4 rounded-2xl bg-slate-50 p-4 text-slate-700 transition-all duration-300 dark:bg-slate-800/50 dark:text-slate-200"
								onclick={onMenuToggle}
							>
								<div
									class="bg-primary-100 dark:bg-primary-900/50 rounded-xl p-2.5 transition-transform duration-300 group-hover:scale-110"
								>
									<Home class="text-primary-600 dark:text-primary-400 h-5 w-5" />
								</div>
								<span class="font-bold tracking-tight">{item.label}</span>
								{#if $page.url.pathname === item.href}
									<div class="bg-primary-500 ml-auto h-2 w-2 animate-pulse rounded-full"></div>
								{/if}
							</a>
						{/each}
					</div>
				</div>

				{#if !user}
					<div class="space-y-4 pt-6">
						<GradientButton
							href={resolve('/register')}
							color="purpleToBlue"
							class="w-full rounded-2xl py-4 text-sm font-black tracking-widest uppercase shadow-xl shadow-blue-500/20"
							onclick={onMenuToggle}
						>
							Comenzar Gratis
						</GradientButton>
						<Button
							color="light"
							href={resolve('/login')}
							class="w-full rounded-2xl border-none bg-slate-100 py-4 text-sm font-bold dark:bg-slate-800"
							onclick={onMenuToggle}
						>
							Iniciar sesión
						</Button>
					</div>
				{/if}
			</nav>
		</div>
	{/if}
</header>

<style lang="postcss">
	/* Estilos adicionales */
	:global(body) {
		@apply transition-colors duration-500;
	}

	:global(body.mobile-menu-open) {
		@apply overflow-hidden;
	}

	/* Mejora de legibilidad del logo en dark mode */
	img {
		filter: drop-shadow(0 0 10px rgba(79, 70, 229, 0.1));
	}
</style>
