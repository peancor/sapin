<script lang="ts">
    import { LogOut, LogIn, User, Moon, Sun, BookOpen, ArrowLeft } from 'lucide-svelte';
    import { theme } from '$lib/stores/theme';
    import { m } from '$lib/paraglide/messages.js';
    import { Button, Avatar, Badge, Dropdown, DropdownHeader, DropdownItem, DropdownDivider, DropdownGroup } from 'flowbite-svelte';
    import { ChevronDownOutline } from 'flowbite-svelte-icons';
    import NotificationBell from './notifications/NotificationBell.svelte';

    const { course, user, onMenuToggle } = $props<{
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
            case 'super_admin': return 'Super Administrador';
            case 'admin': return 'Administrador';
            case 'teacher': return 'Profesor';
            case 'assistant': return 'Asistente';
            case 'student': return 'Estudiante';
            default: return 'Usuario';
        }
    }

    function getRoleBadgeColor(roleName: string): 'red' | 'purple' | 'blue' | 'yellow' | 'green' {
        switch (roleName) {
            case 'super_admin': return 'red';
            case 'admin': return 'purple';
            case 'teacher': return 'blue';
            case 'assistant': return 'yellow';
            default: return 'green';
        }
    }
</script>

<header class="fixed top-0 left-0 right-0 z-50 bg-white/80 dark:bg-gray-900/80 backdrop-blur-lg border-b border-gray-200/50 dark:border-gray-700/50 transition-all duration-300">
    <div class="max-w-7xl mx-auto flex items-center justify-between px-6 h-14 md:h-16">
        <div class="flex items-center gap-4">
            <!-- Site Logo -->
            <a href="/student" class="flex items-center group gap-2">
                <div class="relative flex items-center justify-center">
                    <div class="absolute inset-0 bg-primary-500/20 blur-lg rounded-full group-hover:bg-primary-500/30 transition-all duration-500"></div>
                    <img
                        src="/images/sapin-magic_128.webp"
                        alt="SAPIN Logo"
                        class="h-9 w-auto md:h-10 relative z-10 transition-transform duration-500 group-hover:rotate-6 group-hover:scale-110"
                    />
                </div>
                <span class="font-black text-transparent bg-clip-text bg-linear-to-r from-slate-900 to-slate-700 dark:from-white dark:to-slate-300 text-xl tracking-tight hidden sm:block">
                    SAPIN
                </span>
            </a>

            <!-- Separador y nombre del curso -->
            <div class="hidden md:flex items-center gap-3">
                <div class="w-px h-6 bg-gray-300 dark:bg-gray-600"></div>
                <span class="text-sm font-semibold text-slate-600 dark:text-slate-300 max-w-xs truncate">
                    {course.name}
                </span>
            </div>
        </div>

        <!-- Right side controls -->
        <div class="flex items-center gap-2 md:gap-4">
            <!-- Theme Toggle -->
            <Button pill color="light" class="p-2.5! bg-transparent border-none hover:bg-gray-100 dark:hover:bg-gray-800 transition-all duration-300" onclick={toggleTheme}>
                {#if $theme === 'dark'}
                    <Sun size={18} class="text-yellow-400 animate-pulse" />
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
                <Button pill color="light" id="course-user-menu-btn" class="p-1.5! flex items-center gap-2.5 bg-gray-50/50 dark:bg-gray-800/50 border-gray-200/50 dark:border-gray-700/50 hover:bg-white dark:hover:bg-gray-800 transition-all duration-300">
                    <Avatar
                        src={user.image || '/images/default_avatar.png'}
                        class="w-7 h-7 md:w-8 md:h-8 ring-2 ring-primary-500/20 shadow-sm"
                        alt={user.username || 'Usuario'}
                    />
                    <span class="hidden lg:block text-sm font-bold text-slate-700 dark:text-slate-200 max-w-24 truncate">
                        {user.username?.split(' ')[0] || 'Usuario'}
                    </span>
                    <ChevronDownOutline class="w-3.5 h-3.5 text-gray-500 dark:text-gray-400 group-hover:translate-y-0.5 transition-transform duration-300" />
                </Button>

                <!-- User Dropdown Menu -->
                <Dropdown triggeredBy="#course-user-menu-btn" class="w-72 rounded-2xl shadow-2xl border-none ring-1 ring-black/5 dark:ring-white/10 overflow-hidden">
                    <!-- Header con info del usuario -->
                    <DropdownHeader class="p-0! border-none">
                        <div class="p-5 bg-linear-to-br from-indigo-50/50 via-blue-50/50 to-white dark:from-indigo-950/40 dark:via-gray-900/40 dark:to-gray-900">
                            <div class="flex items-center gap-4">
                                <div class="relative">
                                    <Avatar
                                        src={user.image || '/images/default_avatar.png'}
                                        size="lg"
                                        class="ring-4 ring-white dark:ring-gray-800 shadow-xl"
                                        alt={user.username || 'Usuario'}
                                    />
                                    <div class="absolute -bottom-1 -right-1 w-4 h-4 bg-green-500 border-2 border-white dark:border-gray-800 rounded-full"></div>
                                </div>
                                <div class="flex-1 min-w-0">
                                    <p class="text-base font-black text-slate-900 dark:text-white truncate tracking-tight">
                                        {user.username || 'Usuario'}
                                    </p>
                                    <p class="text-xs text-slate-500 dark:text-slate-400 truncate font-medium">
                                        {user.email || ''}
                                    </p>
                                    <div class="mt-2.5">
                                        <Badge color={getRoleBadgeColor(userRoleName)} class="px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider shadow-sm">
                                            {getRoleDisplayName()}
                                        </Badge>
                                    </div>
                                </div>
                            </div>
                        </div>
                    </DropdownHeader>

                    <!-- Menu Items -->
                    <DropdownGroup class="p-2 space-y-1">
                        <DropdownItem href="/student" class="rounded-xl hover:bg-blue-50/50 dark:hover:bg-blue-900/20 group/item transition-all duration-200">
                            <div class="flex items-center gap-3.5">
                                <div class="p-2 rounded-xl bg-blue-100/50 dark:bg-blue-900/40 group-hover/item:scale-110 transition-transform duration-300">
                                    <BookOpen class="w-4 h-4 text-blue-600 dark:text-blue-400" />
                                </div>
                                <div>
                                    <p class="font-bold text-sm text-slate-700 dark:text-slate-200 tracking-tight">Mis Cursos</p>
                                    <p class="text-[11px] text-slate-500 dark:text-slate-400">Volver al listado de cursos</p>
                                </div>
                            </div>
                        </DropdownItem>

                        <DropdownItem href="/profile" class="rounded-xl hover:bg-slate-50/50 dark:hover:bg-slate-800/50 group/item transition-all duration-200">
                            <div class="flex items-center gap-3.5">
                                <div class="p-2 rounded-xl bg-slate-100/50 dark:bg-slate-800/50 group-hover/item:scale-110 transition-transform duration-300">
                                    <User class="w-4 h-4 text-slate-600 dark:text-slate-400" />
                                </div>
                                <div>
                                    <p class="font-bold text-sm text-slate-700 dark:text-slate-200 tracking-tight">Mi Perfil</p>
                                    <p class="text-[11px] text-slate-500 dark:text-slate-400">Datos y configuración</p>
                                </div>
                            </div>
                        </DropdownItem>
                    </DropdownGroup>

                    <div class="px-4 py-2">
                        <div class="h-px bg-slate-100 dark:bg-slate-800"></div>
                    </div>

                    <!-- Logout -->
                    <DropdownGroup class="p-2">
                        <DropdownItem href="/logout" class="rounded-xl hover:bg-red-50/50 dark:hover:bg-red-900/20 group/item transition-all duration-200">
                            <div class="flex items-center gap-3.5">
                                <div class="p-2 rounded-xl bg-red-100/50 dark:bg-red-900/40 group-hover/item:scale-110 transition-transform duration-300">
                                    <LogOut class="w-4 h-4 text-red-600 dark:text-red-400" />
                                </div>
                                <div>
                                    <p class="font-bold text-sm text-red-600 dark:text-red-400 tracking-tight">Cerrar sesión</p>
                                </div>
                            </div>
                        </DropdownItem>
                    </DropdownGroup>
                </Dropdown>
            {:else}
                <Button href="/login" size="sm" color="blue" class="flex items-center justify-center p-2.5 rounded-full shadow-lg shadow-blue-500/20">
                    <LogIn size={18} />
                </Button>
            {/if}
        </div>
    </div>

    <!-- Mobile: Course name (shown below on small screens) -->
    <div class="md:hidden px-6 pb-2 -mt-1">
        <span class="text-xs font-medium text-slate-500 dark:text-slate-400 truncate block">
            {course.name}
        </span>
    </div>
</header>

<style lang="postcss">
    img {
        filter: drop-shadow(0 0 10px rgba(79, 70, 229, 0.1));
    }
</style>
