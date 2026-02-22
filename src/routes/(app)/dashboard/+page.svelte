<script lang="ts">
    import type { PageData } from './$types';
    import { 
        GraduationCap, 
        BookOpen, 
        Users, 
        Plus, 
        ArrowRight, 
        ChevronRight,
        Sparkles,
        PenTool,
        Layout
    } from 'lucide-svelte';
    import { Button, Card, Badge, Avatar } from 'flowbite-svelte';
    import CreateCourseModal from '$lib/components/CreateCourseModal.svelte';

    let { data }: { data: PageData } = $props();

    let showCreateModal = $state(false);

    const teacherGradients = [
        'from-violet-500/80 to-purple-600/80',
        'from-blue-500/80 to-indigo-600/80',
        'from-cyan-500/80 to-blue-600/80',
        'from-emerald-500/80 to-teal-600/80',
    ];

    const studentGradients = [
        'from-blue-300/60 via-indigo-200/60 to-violet-300/60',
        'from-rose-200/60 via-pink-200/60 to-purple-300/60',
        'from-sky-200/60 via-cyan-200/60 to-blue-300/60',
        'from-teal-200/60 via-emerald-200/60 to-green-300/60',
    ];

    function truncateText(text: string | null | undefined, maxLength: number) {
        if (!text) return 'Sin descripción';
        return text.length > maxLength ? text.slice(0, maxLength) + '...' : text;
    }

    function getRoleLabel(role: string): string {
        switch (role) {
            case 'owner': return 'Propietario';
            case 'admin': return 'Administrador';
            case 'teacher': return 'Profesor';
            case 'assistant': return 'Asistente';
            case 'student': return 'Estudiante';
            default: return 'Participante';
        }
    }

    function getRoleBadgeColor(role: string): 'purple' | 'blue' | 'green' | 'yellow' | 'indigo' {
        switch (role) {
            case 'owner': return 'purple';
            case 'admin': return 'indigo';
            case 'teacher': return 'blue';
            case 'assistant': return 'yellow';
            default: return 'green';
        }
    }
</script>

<svelte:head>
    <title>Mi Espacio - SAPIN</title>
</svelte:head>

<div class="max-w-7xl mx-auto p-4 md:p-6 space-y-8">
    <!-- Header de bienvenida -->
    <div class="relative overflow-hidden rounded-2xl bg-gradient-to-r from-blue-600 via-indigo-600 to-purple-600 p-8 text-white shadow-xl">
        <div class="absolute top-0 right-0 -translate-y-1/4 translate-x-1/4 opacity-20">
            <Sparkles class="w-64 h-64" />
        </div>
        <div class="relative z-10">
            <div class="flex flex-col md:flex-row md:items-center gap-4">
                <Avatar 
                    src={data.user?.image || '/images/default_avatar.png'} 
                    size="lg"
                    class="ring-4 ring-white/30"
                />
                <div>
                    <h1 class="text-3xl md:text-4xl font-bold mb-2">
                        ¡Hola, {data.user?.username?.split(' ')[0] || 'Usuario'}!
                    </h1>
                    <p class="text-blue-100 text-lg">
                        Bienvenido a tu espacio de aprendizaje
                    </p>
                </div>
            </div>
            
            <!-- Stats rápidos -->
            <div class="grid grid-cols-2 md:grid-cols-4 gap-4 mt-8">
                <div class="bg-white/10 backdrop-blur-sm rounded-xl p-4">
                    <div class="flex items-center gap-3">
                        <div class="p-2 bg-white/20 rounded-lg">
                            <BookOpen class="w-5 h-5" />
                        </div>
                        <div>
                            <p class="text-2xl font-bold">{data.totalCourses}</p>
                            <p class="text-blue-100 text-sm">Cursos totales</p>
                        </div>
                    </div>
                </div>
                <div class="bg-white/10 backdrop-blur-sm rounded-xl p-4">
                    <div class="flex items-center gap-3">
                        <div class="p-2 bg-white/20 rounded-lg">
                            <PenTool class="w-5 h-5" />
                        </div>
                        <div>
                            <p class="text-2xl font-bold">{data.teachingCourses.length}</p>
                            <p class="text-blue-100 text-sm">Como docente</p>
                        </div>
                    </div>
                </div>
                <div class="bg-white/10 backdrop-blur-sm rounded-xl p-4">
                    <div class="flex items-center gap-3">
                        <div class="p-2 bg-white/20 rounded-lg">
                            <GraduationCap class="w-5 h-5" />
                        </div>
                        <div>
                            <p class="text-2xl font-bold">{data.learningCourses.length}</p>
                            <p class="text-blue-100 text-sm">Como estudiante</p>
                        </div>
                    </div>
                </div>
                <div class="bg-white/10 backdrop-blur-sm rounded-xl p-4 hidden md:block">
                    <div class="flex items-center gap-3">
                        <div class="p-2 bg-white/20 rounded-lg">
                            <Layout class="w-5 h-5" />
                        </div>
                        <div>
                            <p class="text-2xl font-bold">
                                {data.teachingCourses.reduce((sum, c) => sum + c.activityCount, 0) + 
                                 data.learningCourses.reduce((sum, c) => sum + c.activityCount, 0)}
                            </p>
                            <p class="text-blue-100 text-sm">Actividades</p>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    </div>

    <!-- Sección: Cursos como Docente -->
    {#if data.teachingCourses.length > 0}
        <section>
            <div class="flex items-center justify-between mb-6">
                <div class="flex items-center gap-3">
                    <div class="p-2 bg-purple-100 dark:bg-purple-900/50 rounded-lg">
                        <PenTool class="w-6 h-6 text-purple-600 dark:text-purple-400" />
                    </div>
                    <div>
                        <h2 class="text-2xl font-bold text-gray-800 dark:text-white">Mis cursos como docente</h2>
                        <p class="text-gray-600 dark:text-gray-400 text-sm">Cursos que gestionas o enseñas</p>
                    </div>
                </div>
                <Button href="/teacher" color="light" class="hidden md:flex items-center gap-2">
                    Ver todos
                    <ChevronRight class="w-4 h-4" />
                </Button>
            </div>

            <div class="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
                {#each data.teachingCourses.slice(0, 6) as course, i}
                    <Card class="group overflow-hidden hover:shadow-xl transition-all duration-300 border-0">
                        <div class="relative h-40 bg-gradient-to-br {teacherGradients[i % teacherGradients.length]}">
                            {#if course.image}
                                <img 
                                    src={course.image} 
                                    alt={course.name}
                                    class="w-full h-full object-cover opacity-80 group-hover:scale-105 transition-transform duration-300"
                                />
                            {:else}
                                <div class="absolute inset-0 flex items-center justify-center">
                                    <BookOpen class="w-16 h-16 text-white/50" />
                                </div>
                            {/if}
                            <div class="absolute top-3 right-3">
                                <Badge color={getRoleBadgeColor(course.role)}>
                                    {getRoleLabel(course.role)}
                                </Badge>
                            </div>
                        </div>
                        <div class="p-5">
                            <h3 class="text-lg font-bold text-gray-800 dark:text-white mb-2 line-clamp-1">
                                {course.name}
                            </h3>
                            <p class="text-gray-600 dark:text-gray-400 text-sm mb-4 line-clamp-2">
                                {truncateText(course.description, 80)}
                            </p>
                            <div class="flex items-center justify-between">
                                <span class="text-sm text-gray-500 dark:text-gray-400">
                                    {course.activityCount} actividades
                                </span>
                                <Button href={`/course/${course.id}/admin`} size="sm" color="purple">
                                    Gestionar
                                    <ArrowRight class="w-4 h-4 ml-1" />
                                </Button>
                            </div>
                        </div>
                    </Card>
                {/each}
            </div>

            {#if data.teachingCourses.length > 6}
                <div class="mt-6 text-center md:hidden">
                    <Button href="/teacher" color="light">
                        Ver todos los cursos ({data.teachingCourses.length})
                    </Button>
                </div>
            {/if}
        </section>
    {:else if data.user?.highestRoleLevel >= 50}
        <section>
            <div class="flex items-center gap-3 mb-6">
                <div class="p-2 bg-purple-100 dark:bg-purple-900/50 rounded-lg">
                    <PenTool class="w-6 h-6 text-purple-600 dark:text-purple-400" />
                </div>
                <div>
                    <h2 class="text-2xl font-bold text-gray-800 dark:text-white">Mis cursos como docente</h2>
                    <p class="text-gray-600 dark:text-gray-400 text-sm">Cursos que gestionas o enseñas</p>
                </div>
            </div>
            
            <Card class="p-8 text-center border-0 bg-gradient-to-br from-purple-50 to-indigo-50 dark:from-purple-900/20 dark:to-indigo-900/20">
                <div class="w-16 h-16 mx-auto mb-4 bg-purple-100 dark:bg-purple-900/50 rounded-full flex items-center justify-center">
                    <BookOpen class="w-8 h-8 text-purple-600 dark:text-purple-400" />
                </div>
                <h3 class="text-xl font-bold text-gray-800 dark:text-white mb-2">
                    Comienza a crear contenido
                </h3>
                <p class="text-gray-600 dark:text-gray-400 mb-6 max-w-md mx-auto">
                    Crea tu primer curso y comparte tu conocimiento con actividades de aprendizaje interactivo potenciadas por IA
                </p>
                <Button onclick={() => showCreateModal = true} color="purple" size="lg" class="text-white">
                    <Plus class="w-5 h-5 mr-2" />
                    Crear mi primer curso
                </Button>
            </Card>
        </section>
    {/if}

    <!-- Sección: Cursos como Estudiante -->
    <section>
        <div class="flex items-center justify-between mb-6">
            <div class="flex items-center gap-3">
                <div class="p-2 bg-blue-100 dark:bg-blue-900/50 rounded-lg">
                    <GraduationCap class="w-6 h-6 text-blue-600 dark:text-blue-400" />
                </div>
                <div>
                    <h2 class="text-2xl font-bold text-gray-800 dark:text-white">Mi aprendizaje</h2>
                    <p class="text-gray-600 dark:text-gray-400 text-sm">Cursos en los que participas como estudiante</p>
                </div>
            </div>
            {#if data.learningCourses.length > 0}
                <Button href="/student" color="light" class="hidden md:flex items-center gap-2">
                    Ver todos
                    <ChevronRight class="w-4 h-4" />
                </Button>
            {/if}
        </div>

        {#if data.learningCourses.length > 0}
            <div class="space-y-4">
                {#each data.learningCourses.slice(0, 4) as course, i}
                    <div class="group relative overflow-hidden rounded-xl bg-gradient-to-r {studentGradients[i % studentGradients.length]} shadow-lg hover:shadow-2xl transition-all duration-300 hover:scale-[1.01]">
                        <div class="flex flex-col md:flex-row items-center gap-6 p-6">
                            <div class="w-full md:w-48 h-32 rounded-lg overflow-hidden bg-black/10 shrink-0">
                                {#if course.image}
                                    <img
                                        src={course.image}
                                        alt={course.name}
                                        class="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                                    />
                                {:else}
                                    <div class="w-full h-full flex items-center justify-center">
                                        <BookOpen class="w-12 h-12 text-gray-600/50" />
                                    </div>
                                {/if}
                            </div>
                            <div class="flex-1 text-center md:text-left">
                                <h3 class="text-2xl font-bold text-gray-800 dark:text-white mb-2">
                                    {course.name}
                                </h3>
                                <p class="text-gray-700 dark:text-gray-200 mb-4">
                                    {truncateText(course.description, 120)}
                                </p>
                                <div class="flex flex-wrap items-center gap-4 justify-center md:justify-start">
                                    <span class="text-sm text-gray-600 dark:text-gray-300 flex items-center gap-1">
                                        <BookOpen class="w-4 h-4" />
                                        {course.activityCount} actividades
                                    </span>
                                    <Button href={`/course/${course.id}/run`} color="dark" class="px-6">
                                        Continuar
                                        <ArrowRight class="w-4 h-4 ml-2" />
                                    </Button>
                                </div>
                            </div>
                        </div>
                    </div>
                {/each}
            </div>

            {#if data.learningCourses.length > 4}
                <div class="mt-6 text-center md:hidden">
                    <Button href="/student" color="light">
                        Ver todos los cursos ({data.learningCourses.length})
                    </Button>
                </div>
            {/if}
        {:else}
            <Card class="p-8 text-center border-0 bg-gray-50 dark:bg-gray-800/50">
                <div class="w-16 h-16 mx-auto mb-4 bg-blue-100 dark:bg-blue-900/50 rounded-full flex items-center justify-center">
                    <GraduationCap class="w-8 h-8 text-blue-600 dark:text-blue-400" />
                </div>
                <h3 class="text-xl font-bold text-gray-800 dark:text-white mb-2">
                    Aún no estás inscrito en ningún curso
                </h3>
                <p class="text-gray-600 dark:text-gray-400 mb-4">
                    Utiliza un código de inscripción para unirte a un curso como estudiante
                </p>
                <Button color="blue" class="text-white">
                    <Plus class="w-4 h-4 mr-2" />
                    Unirse a un curso
                </Button>
            </Card>
        {/if}
    </section>

    <!-- Acciones rápidas para docentes -->
    {#if data.teachingCourses.length > 0 || data.user?.highestRoleLevel >= 50}
        <section class="mt-8">
            <h2 class="text-xl font-bold text-gray-800 dark:text-white mb-4">Acciones rápidas</h2>
            <div class="grid sm:grid-cols-2 lg:grid-cols-4 gap-4">
                <Button onclick={() => showCreateModal = true} color="light" class="h-auto py-4 flex-col gap-2">
                    <Plus class="w-6 h-6 text-purple-600" />
                    <span>Crear curso</span>
                </Button>
                <Button href="/teacher" color="light" class="h-auto py-4 flex-col gap-2">
                    <Layout class="w-6 h-6 text-blue-600" />
                    <span>Panel de docente</span>
                </Button>
                <Button href="/profile" color="light" class="h-auto py-4 flex-col gap-2">
                    <Users class="w-6 h-6 text-green-600" />
                    <span>Mi perfil</span>
                </Button>
                <Button href="/student" color="light" class="h-auto py-4 flex-col gap-2">
                    <GraduationCap class="w-6 h-6 text-orange-600" />
                    <span>Mis cursos</span>
                </Button>
            </div>
        </section>
    {/if}
</div>

<CreateCourseModal bind:show={showCreateModal} />
