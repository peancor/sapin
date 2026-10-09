<script lang="ts">
	import { resolve } from '$app/paths';
	import { LogOut, LogIn, User, Moon, Sun, BookOpen } from 'lucide-svelte';
	import { theme } from '$lib/stores/theme';
	import '$lib/paraglide/messages.js';
	import {
		Button,
		Avatar,
		Badge,
		Dropdown,
		DropdownHeader,
		DropdownItem,
		DropdownGroup
	} from 'flowbite-svelte';
	import { ChevronDownOutline } from 'flowbite-svelte-icons';
	import NotificationBell from './notifications/NotificationBell.svelte';

	const { course, user } = $props<{
		course: any;
		user: any;
		onMenuToggle: () => void;
	}>();

	const userHighestRole = $derived(user?.highestRole);
	const userRoleName = $derived(userHighestRole?.name || 'student');

	function toggleTheme() {
		$theme = $theme === 'dark' ? 'light' : 'dark';
	}

	function getRoleDisplayName(): string {
		if (userHighestRole?.displayName) {
			return userHighestRole.displayName;
		}
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
			<!-- Site Logo -->
			<a href={resolve('/student')} class="group flex items-center gap-2">
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

			<!-- Separador y nombre del curso -->
			<div class="hidden items-center gap-3 md:flex">
				<div class="h-6 w-px bg-gray-300 dark:bg-gray-600"></div>
				<span class="max-w-xs truncate text-sm font-semibold text-slate-600 dark:text-slate-300">
					{course.name}
				</span>
			</div>
		</div>

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
					id="course-user-menu-btn"
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
					triggeredBy="#course-user-menu-btn"
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
										Volver al listado de cursos
									</p>
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
									<p class="text-[11px] text-slate-500 dark:text-slate-400">
										Datos y configuración
									</p>
								</div>
							</div>
						</DropdownItem>
					</DropdownGroup>

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
				<Button
					href={resolve('/login')}
					size="sm"
					color="blue"
					class="flex items-center justify-center rounded-full p-2.5 shadow-lg shadow-blue-500/20"
				>
					<LogIn size={18} />
				</Button>
			{/if}
		</div>
	</div>

	<!-- Mobile: Course name (shown below on small screens) -->
	<div class="-mt-1 px-6 pb-2 md:hidden">
		<span class="block truncate text-xs font-medium text-slate-500 dark:text-slate-400">
			{course.name}
		</span>
	</div>
</header>

<style lang="postcss">
	img {
		filter: drop-shadow(0 0 10px rgba(79, 70, 229, 0.1));
	}
</style>
