<script lang="ts">
    import { page } from '$app/stores';
    import { LogOut, LogIn, User, Menu, Moon, Sun, X, Home, Settings, Shield, GraduationCap, BookOpen } from 'lucide-svelte';
    import { theme } from '$lib/stores/theme';
    import { topbarMenuItems } from '$lib/stores/topbarNavigation';
    import { goto } from '$app/navigation';
    import { m } from '$lib/paraglide/messages.js';
    import { Button, Avatar, Badge, Dropdown, DropdownHeader, DropdownItem, DropdownDivider, DropdownGroup, GradientButton } from 'flowbite-svelte';
    import { fade, slide, fly } from 'svelte/transition';
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
    const filteredMenuItems = $derived($topbarMenuItems.filter(
        (item) => {
            // Si no tiene restricción, mostrar siempre
            if (!item.minLevel && !item.roles) return true;
            // Nuevo sistema: verificar nivel
            if (item.minLevel) return userHighestRoleLevel >= item.minLevel;
            // Sistema legacy: verificar rol por nombre
            return userRoleName && item.roles?.includes(userRoleName);
        }
    ));

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
            <!-- Mobile menu button -->
            <button
                class="md:hidden p-2 rounded-xl text-gray-600 hover:bg-gray-100/50 dark:text-gray-400 dark:hover:bg-gray-800/50 transition-all duration-200"
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
            <a href="/" class="flex items-center group gap-2">
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
        </div>

        <!-- Desktop Navigation -->
        <nav class="hidden md:flex items-center gap-8">
            {#each filteredMenuItems as item, i}
                <a
                    href={item.href}
                    class="group relative text-sm font-semibold tracking-wide text-slate-600 dark:text-slate-300 hover:text-primary-600 dark:hover:text-primary-400 transition-all duration-300 px-1 py-2"
                >
                    <span class="relative z-10">{item.label}</span>
                    <span class="absolute bottom-0 left-0 w-full h-0.5 bg-primary-500 scale-x-0 transition-transform duration-500 origin-right group-hover:scale-x-100 group-hover:origin-left"></span>
                    {#if $page.url.pathname === item.href}
                        <span class="absolute bottom-0 left-0 w-full h-0.5 bg-primary-500/50"></span>
                    {/if}
                </a>
            {/each}
        </nav>

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
                <Button pill color="light" id="user-menu-btn" class="p-1.5! flex items-center gap-2.5 bg-gray-50/50 dark:bg-gray-800/50 border-gray-200/50 dark:border-gray-700/50 hover:bg-white dark:hover:bg-gray-800 transition-all duration-300">
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
                <Dropdown triggeredBy="#user-menu-btn" class="w-72 rounded-2xl shadow-2xl border-none ring-1 ring-black/5 dark:ring-white/10 overflow-hidden">
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
                        <DropdownItem href="/dashboard" class="rounded-xl hover:bg-indigo-50/50 dark:hover:bg-indigo-900/20 group/item transition-all duration-200">
                            <div class="flex items-center gap-3.5">
                                <div class="p-2 rounded-xl bg-indigo-100/50 dark:bg-indigo-900/40 group-hover/item:scale-110 transition-transform duration-300">
                                    <Home class="w-4 h-4 text-indigo-600 dark:text-indigo-400" />
                                </div>
                                <div>
                                    <p class="font-bold text-sm text-slate-700 dark:text-slate-200 tracking-tight">Mi Espacio</p>
                                    <p class="text-[11px] text-slate-500 dark:text-slate-400">Dashboard personal</p>
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
                                    <p class="text-[11px] text-slate-500 dark:text-slate-400">Datos y biografía</p>
                                </div>
                            </div>
                        </DropdownItem>

                        <DropdownItem href="/student" class="rounded-xl hover:bg-blue-50/50 dark:hover:bg-blue-900/20 group/item transition-all duration-200">
                            <div class="flex items-center gap-3.5">
                                <div class="p-2 rounded-xl bg-blue-100/50 dark:bg-blue-900/40 group-hover/item:scale-110 transition-transform duration-300">
                                    <BookOpen class="w-4 h-4 text-blue-600 dark:text-blue-400" />
                                </div>
                                <div>
                                    <p class="font-bold text-sm text-slate-700 dark:text-slate-200 tracking-tight">Mis Cursos</p>
                                    <p class="text-[11px] text-slate-500 dark:text-slate-400">Aula virtual interactiva</p>
                                </div>
                            </div>
                        </DropdownItem>
                    </DropdownGroup>

                    <!-- Admin Section -->
                    {#if canAccessAdmin}
                        <div class="px-4 py-2 mt-1">
                            <div class="h-px bg-slate-100 dark:bg-slate-800"></div>
                        </div>
                        <DropdownGroup class="p-2">
                            <DropdownItem href="/admin" class="rounded-xl hover:bg-purple-50/50 dark:hover:bg-purple-900/20 group/item transition-all duration-200">
                                <div class="flex items-center gap-3.5">
                                    <div class="p-2 rounded-xl bg-purple-100/50 dark:bg-purple-900/40 group-hover/item:scale-110 transition-transform duration-300">
                                        <Shield class="w-4 h-4 text-purple-600 dark:text-purple-400" />
                                    </div>
                                    <div>
                                        <p class="font-bold text-sm text-purple-700 dark:text-purple-300 tracking-tight">Administración</p>
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
                <div class="flex items-center gap-3">
                    <a href="/login" class="hidden sm:block text-sm font-bold text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white transition-colors duration-200 px-4 py-2">
                        {m.login()}
                    </a>
                    <GradientButton href="/register" size="sm" color="purpleToBlue" class="hidden sm:flex items-center gap-2 px-6 py-2.5 rounded-full text-xs font-black uppercase tracking-widest shadow-lg shadow-blue-500/20 transform hover:scale-105 transition-all duration-300">
                        Registro
                    </GradientButton>
                    <Button href="/login" size="sm" color="blue" class="sm:hidden flex items-center justify-center p-2.5 rounded-full shadow-lg shadow-blue-500/20">
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
            class="fixed inset-0 top-14 z-40 bg-white/95 dark:bg-gray-900/95 backdrop-blur-xl md:hidden overflow-y-auto"
        >
            <nav class="p-6 space-y-6">
                <div class="space-y-3">
                    <p class="text-[10px] font-black uppercase tracking-widest text-slate-400 dark:text-slate-500 ml-2">Navegación</p>
                    <div class="grid grid-cols-1 gap-3">
                        {#each filteredMenuItems as item}
                            <a
                                href={item.href}
                                class="flex items-center gap-4 p-4 rounded-2xl bg-slate-50 dark:bg-slate-800/50 text-slate-700 dark:text-slate-200 hover:bg-primary-50 dark:hover:bg-primary-900/20 transition-all duration-300 group"
                                onclick={onMenuToggle}
                            >
                                <div class="bg-primary-100 dark:bg-primary-900/50 p-2.5 rounded-xl group-hover:scale-110 transition-transform duration-300">
                                    <Home class="w-5 h-5 text-primary-600 dark:text-primary-400" />
                                </div>
                                <span class="font-bold tracking-tight">{item.label}</span>
                                {#if $page.url.pathname === item.href}
                                    <div class="ml-auto w-2 h-2 rounded-full bg-primary-500 animate-pulse"></div>
                                {/if}
                            </a>
                        {/each}
                    </div>
                </div>

                {#if !user}
                    <div class="pt-6 space-y-4">
                        <GradientButton href="/register" color="purpleToBlue" class="w-full py-4 rounded-2xl font-black text-sm uppercase tracking-widest shadow-xl shadow-blue-500/20" onclick={onMenuToggle}>
                            Comenzar Gratis
                        </GradientButton>
                        <Button color="light" href="/login" class="w-full py-4 rounded-2xl font-bold text-sm bg-slate-100 dark:bg-slate-800 border-none" onclick={onMenuToggle}>
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
