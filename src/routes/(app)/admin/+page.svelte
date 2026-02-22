<script lang="ts">
    import type { PageData } from './$types';
    import { Card, Avatar, Badge } from 'flowbite-svelte';
    import { Users, GraduationCap, BookOpen, Shield, TrendingUp, Clock, Bell } from 'lucide-svelte';

    let { data }: { data: PageData } = $props();

    let statCards = $derived.by(() => [
        {
            title: 'Total Usuarios',
            value: data.stats.totalUsers,
            icon: Users,
            color: 'bg-blue-100 text-blue-600 dark:bg-blue-900 dark:text-blue-400',
            trend: '+12%'
        },
        {
            title: 'Estudiantes',
            value: data.stats.students,
            icon: Users,
            color: 'bg-green-100 text-green-600 dark:bg-green-900 dark:text-green-400',
            trend: '+8%'
        },
        {
            title: 'Profesores',
            value: data.stats.teachers,
            icon: GraduationCap,
            color: 'bg-purple-100 text-purple-600 dark:bg-purple-900 dark:text-purple-400',
            trend: '+3%'
        },
        {
            title: 'Cursos',
            value: data.stats.totalCourses,
            icon: BookOpen,
            color: 'bg-orange-100 text-orange-600 dark:bg-orange-900 dark:text-orange-400',
            trend: '+5%'
        }
    ]);

    function formatDate(date: Date | string) {
        return new Date(date).toLocaleDateString('es-ES', {
            day: 'numeric',
            month: 'short',
            year: 'numeric'
        });
    }

    function getRoleBadgeColor(level: number): 'red' | 'purple' | 'blue' | 'yellow' | 'green' {
        if (level >= 100) return 'red';
        if (level >= 90) return 'purple';
        if (level >= 50) return 'blue';
        if (level >= 40) return 'yellow';
        return 'green';
    }

    function getUserRoleDisplay(user: { highestRole?: { displayName: string; level: number } | null }) {
        return user.highestRole?.displayName || 'Usuario';
    }
</script>

<div class="space-y-6">
    <!-- Stats Grid -->
    <div class="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {#each statCards as card (card.title)}
            <div class="rounded-xl border border-gray-200 bg-white p-5 dark:border-gray-700 dark:bg-gray-800">
                <div class="flex items-center justify-between">
                    <div>
                        <p class="text-sm font-medium text-gray-500 dark:text-gray-400">{card.title}</p>
                        <p class="mt-1 text-2xl font-bold text-gray-900 dark:text-white">{card.value}</p>
                    </div>
                    <div class="flex h-12 w-12 items-center justify-center rounded-lg {card.color}">
                        <card.icon class="h-6 w-6" />
                    </div>
                </div>
                <div class="mt-3 flex items-center text-sm">
                    <TrendingUp class="mr-1 h-4 w-4 text-green-500" />
                    <span class="font-medium text-green-500">{card.trend}</span>
                    <span class="ml-2 text-gray-500 dark:text-gray-400">vs mes anterior</span>
                </div>
            </div>
        {/each}
    </div>

    <!-- Quick Actions & Recent Users -->
    <div class="grid grid-cols-1 gap-6 lg:grid-cols-3">
        <!-- Quick Actions -->
        <div class="rounded-xl border border-gray-200 bg-white p-5 dark:border-gray-700 dark:bg-gray-800">
            <h3 class="mb-4 text-lg font-semibold text-gray-900 dark:text-white">Acciones Rápidas</h3>
            <div class="space-y-3">
                <a
                    href="/admin/users"
                    class="flex items-center gap-3 rounded-lg border border-gray-200 p-3 transition-colors hover:bg-gray-50 dark:border-gray-700 dark:hover:bg-gray-700"
                >
                    <div class="flex h-10 w-10 items-center justify-center rounded-lg bg-blue-100 text-blue-600 dark:bg-blue-900 dark:text-blue-400">
                        <Users class="h-5 w-5" />
                    </div>
                    <div>
                        <p class="font-medium text-gray-900 dark:text-white">Gestionar Usuarios</p>
                        <p class="text-sm text-gray-500 dark:text-gray-400">Ver y editar usuarios</p>
                    </div>
                </a>
                <a
                    href="/admin/courses"
                    class="flex items-center gap-3 rounded-lg border border-gray-200 p-3 transition-colors hover:bg-gray-50 dark:border-gray-700 dark:hover:bg-gray-700"
                >
                    <div class="flex h-10 w-10 items-center justify-center rounded-lg bg-orange-100 text-orange-600 dark:bg-orange-900 dark:text-orange-400">
                        <BookOpen class="h-5 w-5" />
                    </div>
                    <div>
                        <p class="font-medium text-gray-900 dark:text-white">Gestionar Cursos</p>
                        <p class="text-sm text-gray-500 dark:text-gray-400">Crear y editar cursos</p>
                    </div>
                </a>
                <a
                    href="/admin/notifications"
                    class="flex items-center gap-3 rounded-lg border border-gray-200 p-3 transition-colors hover:bg-gray-50 dark:border-gray-700 dark:hover:bg-gray-700"
                >
                    <div class="flex h-10 w-10 items-center justify-center rounded-lg bg-purple-100 text-purple-600 dark:bg-purple-900 dark:text-purple-400">
                        <Bell class="h-5 w-5" />
                    </div>
                    <div>
                        <p class="font-medium text-gray-900 dark:text-white">Enviar Notificaciones</p>
                        <p class="text-sm text-gray-500 dark:text-gray-400">Comunicar a usuarios</p>
                    </div>
                </a>
                <a
                    href="/admin/settings"
                    class="flex items-center gap-3 rounded-lg border border-gray-200 p-3 transition-colors hover:bg-gray-50 dark:border-gray-700 dark:hover:bg-gray-700"
                >
                    <div class="flex h-10 w-10 items-center justify-center rounded-lg bg-gray-100 text-gray-600 dark:bg-gray-700 dark:text-gray-400">
                        <Shield class="h-5 w-5" />
                    </div>
                    <div>
                        <p class="font-medium text-gray-900 dark:text-white">Configuración</p>
                        <p class="text-sm text-gray-500 dark:text-gray-400">Ajustes del sistema</p>
                    </div>
                </a>
            </div>
        </div>

        <!-- Recent Users -->
        <div class="rounded-xl border border-gray-200 bg-white p-5 dark:border-gray-700 dark:bg-gray-800 lg:col-span-2">
            <div class="mb-4 flex items-center justify-between">
                <h3 class="text-lg font-semibold text-gray-900 dark:text-white">Usuarios Recientes</h3>
                <a
                    href="/admin/users"
                    class="text-sm font-medium text-primary-600 hover:underline dark:text-primary-400"
                >
                    Ver todos
                </a>
            </div>
            <div class="space-y-4">
                {#each data.recentUsers as user (user.id)}
                    <div class="flex items-center justify-between rounded-lg border border-gray-100 p-3 dark:border-gray-700">
                        <div class="flex items-center gap-3">
                            <Avatar src={user.image || '/images/default_avatar.png'} size="sm" />
                            <div>
                                <p class="font-medium text-gray-900 dark:text-white">{user.username || 'Sin nombre'}</p>
                                <p class="text-sm text-gray-500 dark:text-gray-400">{user.email}</p>
                            </div>
                        </div>
                        <div class="flex items-center gap-3">
                            <Badge color={getRoleBadgeColor(user.highestRole?.level ?? 0)}>{getUserRoleDisplay(user)}</Badge>
                            <div class="flex items-center text-xs text-gray-500 dark:text-gray-400">
                                <Clock class="mr-1 h-3 w-3" />
                                {formatDate(user.createdAt)}
                            </div>
                        </div>
                    </div>
                {/each}
                {#if data.recentUsers.length === 0}
                    <p class="text-center text-gray-500 dark:text-gray-400">No hay usuarios recientes</p>
                {/if}
            </div>
        </div>
    </div>

    <!-- System Overview -->
    <div class="rounded-xl border border-gray-200 bg-white p-5 dark:border-gray-700 dark:bg-gray-800">
        <h3 class="mb-4 text-lg font-semibold text-gray-900 dark:text-white">Resumen del Sistema</h3>
        <div class="grid grid-cols-2 gap-4 md:grid-cols-4">
            <div class="text-center">
                <p class="text-3xl font-bold text-gray-900 dark:text-white">{data.stats.admins}</p>
                <p class="text-sm text-gray-500 dark:text-gray-400">Administradores</p>
            </div>
            <div class="text-center">
                <p class="text-3xl font-bold text-gray-900 dark:text-white">{data.stats.teachers}</p>
                <p class="text-sm text-gray-500 dark:text-gray-400">Profesores</p>
            </div>
            <div class="text-center">
                <p class="text-3xl font-bold text-gray-900 dark:text-white">{data.stats.students}</p>
                <p class="text-sm text-gray-500 dark:text-gray-400">Estudiantes</p>
            </div>
            <div class="text-center">
                <p class="text-3xl font-bold text-gray-900 dark:text-white">{data.stats.totalCourses}</p>
                <p class="text-sm text-gray-500 dark:text-gray-400">Cursos Activos</p>
            </div>
        </div>
    </div>
</div>