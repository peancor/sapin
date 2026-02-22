<script lang="ts">
    import { 
        Card, Modal, Button, Badge, Avatar, Tooltip, Spinner
    } from 'flowbite-svelte';
    import { 
        PlusOutline, PenSolid, TrashBinSolid, UsersSolid, ExclamationCircleOutline,
        BookOpenSolid, SearchOutline, GridSolid, ClipboardListSolid
    } from 'flowbite-svelte-icons';
    import type { PageData } from './$types';
    import { invalidateAll } from '$app/navigation';

    let { data }: { data: PageData } = $props();

    // Search & filter
    let searchTerm = $state('');
    
    // Modal states
    let showDeleteModal = $state(false);
    let courseToDelete = $state<{ id: string; name: string } | null>(null);
    let isLoading = $state(false);
    let showRebuildModal = $state(false);
    let courseToRebuild = $state<{ id: string; name: string } | null>(null);
    let rebuildMode = $state<'fill_missing' | 'rebuild_all'>('fill_missing');
    let isRebuilding = $state(false);
    let rebuildResult = $state<{ success: boolean; message: string } | null>(null);
    
    // Filtered courses
    let filteredCourses = $derived.by(() => {
        if (!searchTerm) return data.courses;
        const term = searchTerm.toLowerCase();
        return data.courses.filter(course => 
            course.name.toLowerCase().includes(term) ||
            (course.description?.toLowerCase().includes(term))
        );
    });

    // Course teachers helper
    function getCourseTeachers(course: typeof data.courses[0]) {
        return (course.courseRoles || [])
            .filter(r => ['owner', 'admin', 'teacher'].includes(r.role));
    }

    // Course students count
    function getCourseStudentsCount(course: typeof data.courses[0]) {
        return (course.courseRoles || [])
            .filter(r => r.role === 'student').length;
    }

    // Truncate text helper
    function truncateText(text: string | null, maxLength: number) {
        if (!text) return '';
        return text.length > maxLength ? text.slice(0, maxLength) + '...' : text;
    }

    function formatRebuildDate(dateIso: string): string {
        return new Date(dateIso).toLocaleString('es-ES', {
            day: '2-digit',
            month: '2-digit',
            year: 'numeric',
            hour: '2-digit',
            minute: '2-digit'
        });
    }

    function getRebuildModeLabel(mode: string): string {
        return mode === 'rebuild_all' ? 'Completa' : 'Solo faltantes';
    }

    // Delete course
    async function deleteCourse() {
        if (!courseToDelete) return;
        
        isLoading = true;
        try {
            const response = await fetch(`/api/courses?id=${courseToDelete.id}`, {
                method: 'DELETE'
            });

            if (response.ok) {
                showDeleteModal = false;
                courseToDelete = null;
                await invalidateAll();
            }
        } finally {
            isLoading = false;
        }
    }

    // Open delete confirmation
    function confirmDelete(course: typeof data.courses[0]) {
        courseToDelete = { id: course.id, name: course.name };
        showDeleteModal = true;
    }

    function confirmRebuildProgress(course: typeof data.courses[0]) {
        courseToRebuild = { id: course.id, name: course.name };
        rebuildMode = 'fill_missing';
        rebuildResult = null;
        showRebuildModal = true;
    }

    async function rebuildCourseProgress() {
        if (!courseToRebuild) return;

        isRebuilding = true;
        rebuildResult = null;

        try {
            const response = await fetch(`/api/admin/courses/${courseToRebuild.id}/progress/rebuild`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ mode: rebuildMode })
            });

            const payload = await response.json();

            if (!response.ok || !payload.success) {
                rebuildResult = {
                    success: false,
                    message: payload.error || 'No se pudo regenerar el progreso'
                };
                return;
            }

            const result = payload.result;
            rebuildResult = {
                success: true,
                message:
                    `Progreso regenerado. Actividades creadas: ${result.createdProgressRows}, ` +
                    `resúmenes creados: ${result.createdSummaryRows}, resúmenes actualizados: ${result.updatedSummaryRows}.`
            };

            await invalidateAll();
        } catch {
            rebuildResult = {
                success: false,
                message: 'Error de red al regenerar progreso'
            };
        } finally {
            isRebuilding = false;
        }
    }

    // Get role badge color
    function getRoleBadgeColor(role: string): 'purple' | 'red' | 'blue' | 'gray' {
        switch (role) {
            case 'owner': return 'purple';
            case 'admin': return 'red';
            case 'teacher': return 'blue';
            default: return 'gray';
        }
    }

    // Get status badge color
    function getStatusBadgeColor(status: string): 'green' | 'yellow' | 'gray' {
        switch (status) {
            case 'published': return 'green';
            case 'draft': return 'yellow';
            case 'archived': return 'gray';
            default: return 'gray';
        }
    }

    // Get status label
    function getStatusLabel(status: string): string {
        switch (status) {
            case 'published': return 'Publicado';
            case 'draft': return 'Borrador';
            case 'archived': return 'Archivado';
            default: return status;
        }
    }

    // Get gradient class for card
    function getCardGradient(index: number): string {
        const gradients = [
            'from-blue-500/10 to-purple-500/10',
            'from-emerald-500/10 to-teal-500/10',
            'from-orange-500/10 to-red-500/10',
            'from-pink-500/10 to-rose-500/10',
            'from-indigo-500/10 to-blue-500/10',
            'from-amber-500/10 to-yellow-500/10',
        ];
        return gradients[index % gradients.length];
    }

    // Get accent color for stats
    function getAccentColor(index: number): string {
        const colors = ['text-blue-500', 'text-emerald-500', 'text-orange-500', 'text-pink-500', 'text-indigo-500', 'text-amber-500'];
        return colors[index % colors.length];
    }

    // Stats
    let totalStudents = $derived(
        data.courses.reduce((acc, course) => acc + getCourseStudentsCount(course), 0)
    );
    let totalTeachers = $derived(
        new Set(data.courses.flatMap(c => getCourseTeachers(c).map(t => t.userId))).size
    );
</script>

<div class="container mx-auto p-4 lg:p-6">
    <!-- Header with Stats -->
    <div class="mb-8">
        <div class="flex flex-col lg:flex-row justify-between items-start lg:items-center gap-6 mb-6">
            <div>
                <h1 class="text-3xl font-bold text-gray-900 dark:text-white flex items-center gap-3">
                    <div class="p-2 bg-gradient-to-br from-blue-500 to-purple-600 rounded-xl">
                        <BookOpenSolid class="w-7 h-7 text-white" />
                    </div>
                    Gestión de Cursos
                </h1>
                <p class="mt-2 text-gray-500 dark:text-gray-400">
                    Administra y organiza los cursos de tu plataforma educativa
                </p>
            </div>
            <Button color="blue" class="shadow-lg shadow-blue-500/25 hover:shadow-blue-500/40 transition-shadow" href="/admin/courses/new">
                <PlusOutline class="w-5 h-5 me-2" />
                Crear Nuevo Curso
            </Button>
        </div>

        <!-- Quick Stats -->
        <div class="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-6">
            <Card class="!p-4 bg-gradient-to-br from-blue-50 to-blue-100 dark:from-blue-900/20 dark:to-blue-800/20 border-blue-200 dark:border-blue-800">
                <div class="flex items-center gap-3">
                    <div class="p-3 bg-blue-500 rounded-xl">
                        <GridSolid class="w-6 h-6 text-white" />
                    </div>
                    <div>
                        <p class="text-sm text-blue-600 dark:text-blue-400 font-medium">Total Cursos</p>
                        <p class="text-2xl font-bold text-blue-700 dark:text-blue-300">{data.courses.length}</p>
                    </div>
                </div>
            </Card>
            <Card class="!p-4 bg-gradient-to-br from-emerald-50 to-emerald-100 dark:from-emerald-900/20 dark:to-emerald-800/20 border-emerald-200 dark:border-emerald-800">
                <div class="flex items-center gap-3">
                    <div class="p-3 bg-emerald-500 rounded-xl">
                        <UsersSolid class="w-6 h-6 text-white" />
                    </div>
                    <div>
                        <p class="text-sm text-emerald-600 dark:text-emerald-400 font-medium">Total Estudiantes</p>
                        <p class="text-2xl font-bold text-emerald-700 dark:text-emerald-300">{totalStudents}</p>
                    </div>
                </div>
            </Card>
            <Card class="!p-4 bg-gradient-to-br from-purple-50 to-purple-100 dark:from-purple-900/20 dark:to-purple-800/20 border-purple-200 dark:border-purple-800">
                <div class="flex items-center gap-3">
                    <div class="p-3 bg-purple-500 rounded-xl">
                        <ClipboardListSolid class="w-6 h-6 text-white" />
                    </div>
                    <div>
                        <p class="text-sm text-purple-600 dark:text-purple-400 font-medium">Profesores Activos</p>
                        <p class="text-2xl font-bold text-purple-700 dark:text-purple-300">{totalTeachers}</p>
                    </div>
                </div>
            </Card>
        </div>

        <!-- Search Bar -->
        <div class="relative">
            <div class="absolute inset-y-0 start-0 flex items-center ps-4 pointer-events-none">
                <SearchOutline class="w-5 h-5 text-gray-400" />
            </div>
            <input
                type="text"
                bind:value={searchTerm}
                placeholder="Buscar cursos por nombre o descripción..."
                class="w-full ps-12 pe-4 py-3 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl text-gray-900 dark:text-white placeholder-gray-400 focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-all"
            />
        </div>
    </div>

    <!-- Course Cards Grid -->
    {#if filteredCourses.length > 0}
        <div class="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6">
            {#each filteredCourses as course, index (course.id)}
                {@const teachers = getCourseTeachers(course)}
                {@const studentCount = getCourseStudentsCount(course)}
                
                <Card class="!p-0 overflow-hidden group hover:shadow-xl hover:shadow-gray-200/50 dark:hover:shadow-gray-900/50 transition-all duration-300 border border-gray-200 dark:border-gray-700">
                    <!-- Card Header with Gradient -->
                    <div class="relative h-32 bg-gradient-to-br {getCardGradient(index)} p-5">
                        <div class="absolute inset-0 bg-gradient-to-t from-white/80 dark:from-gray-800/80 to-transparent"></div>
                        <div class="relative z-10">
                            <div class="flex items-start justify-between gap-2 mb-1">
                                <Badge color={getStatusBadgeColor(course.status)} class="text-xs">
                                    {getStatusLabel(course.status)}
                                </Badge>
                            </div>
                            <h3 class="text-xl font-bold text-gray-900 dark:text-white line-clamp-2 group-hover:text-blue-600 dark:group-hover:text-blue-400 transition-colors">
                                {course.name}
                            </h3>
                        </div>
                        
                        <!-- Quick Actions (Top Right) -->
                        <div class="absolute top-3 right-3 flex gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                            <Button size="xs" color="yellow" class="!p-2 shadow-lg" onclick={() => confirmRebuildProgress(course)}>
                                <ClipboardListSolid class="w-3.5 h-3.5" />
                            </Button>
                            <Tooltip>Regenerar progreso</Tooltip>
                            <Button size="xs" color="light" class="!p-2 shadow-lg" href="/admin/courses/{course.id}">
                                <PenSolid class="w-3.5 h-3.5" />
                            </Button>
                            <Tooltip>Gestionar curso</Tooltip>
                            <Button size="xs" color="red" class="!p-2 shadow-lg" onclick={() => confirmDelete(course)}>
                                <TrashBinSolid class="w-3.5 h-3.5" />
                            </Button>
                            <Tooltip>Eliminar curso</Tooltip>
                        </div>
                    </div>

                    <!-- Card Body -->
                    <div class="p-5 pt-3">
                        <!-- Description -->
                        <p class="text-sm text-gray-500 dark:text-gray-400 mb-4 line-clamp-2 min-h-[40px]">
                            {course.description ? truncateText(course.description, 120) : 'Sin descripción disponible'}
                        </p>

                        {#if course.lastProgressRebuild}
                            <div class="mb-4 rounded-lg border border-amber-200/70 bg-amber-50/70 px-3 py-2 text-xs text-amber-800 dark:border-amber-800/60 dark:bg-amber-900/20 dark:text-amber-300">
                                <p class="font-semibold">Última regeneración</p>
                                <p>{formatRebuildDate(course.lastProgressRebuild.rebuildAt)} · {getRebuildModeLabel(course.lastProgressRebuild.mode)}</p>
                            </div>
                        {/if}

                        <!-- Teachers Section -->
                        <div class="mb-4">
                            <p class="text-xs font-semibold text-gray-400 dark:text-gray-500 uppercase tracking-wider mb-2">
                                Profesores
                            </p>
                            {#if teachers.length > 0}
                                <div class="flex items-center gap-2">
                                    <div class="flex -space-x-2">
                                        {#each teachers.slice(0, 3) as teacher (teacher.userId)}
                                            <Avatar 
                                                src={teacher.image ?? undefined} 
                                                alt={teacher.username ?? 'Profesor'}
                                                size="sm"
                                                class="ring-2 ring-white dark:ring-gray-800"
                                            />
                                        {/each}
                                        {#if teachers.length > 3}
                                            <div class="w-8 h-8 rounded-full bg-gray-200 dark:bg-gray-700 ring-2 ring-white dark:ring-gray-800 flex items-center justify-center">
                                                <span class="text-xs font-medium text-gray-600 dark:text-gray-300">+{teachers.length - 3}</span>
                                            </div>
                                        {/if}
                                    </div>
                                    <div class="flex flex-wrap gap-1 ml-2">
                                        {#each teachers.slice(0, 2) as teacher (teacher.userId)}
                                            <Badge color={getRoleBadgeColor(teacher.role)} class="text-xs">
                                                {teacher.username ?? 'Sin nombre'}
                                            </Badge>
                                        {/each}
                                        {#if teachers.length > 2}
                                            <Badge color="gray" class="text-xs">+{teachers.length - 2}</Badge>
                                        {/if}
                                    </div>
                                </div>
                            {:else}
                                <p class="text-sm text-gray-400 italic">Sin profesores asignados</p>
                            {/if}
                        </div>

                        <!-- Stats Row -->
                        <div class="flex items-center justify-between pt-4 border-t border-gray-100 dark:border-gray-700">
                            <div class="flex items-center gap-4">
                                <div class="flex items-center gap-1.5">
                                    <UsersSolid class="w-4 h-4 {getAccentColor(index)}" />
                                    <span class="text-sm font-semibold text-gray-700 dark:text-gray-300">{studentCount}</span>
                                    <span class="text-xs text-gray-400">alumnos</span>
                                </div>
                                <div class="flex items-center gap-1.5">
                                    <BookOpenSolid class="w-4 h-4 text-purple-500" />
                                    <span class="text-sm font-semibold text-gray-700 dark:text-gray-300">{course.activityCount || 0}</span>
                                    <span class="text-xs text-gray-400">actividades</span>
                                </div>
                            </div>
                            <Button size="xs" color="blue" outline href="/admin/courses/{course.id}" class="group-hover:bg-blue-50 dark:group-hover:bg-blue-900/20">
                                Ver detalles
                            </Button>
                        </div>
                    </div>
                </Card>
            {/each}
        </div>

        <!-- Results summary -->
        <div class="mt-6 text-center text-sm text-gray-500 dark:text-gray-400">
            {#if searchTerm}
                Mostrando {filteredCourses.length} de {data.courses.length} cursos
            {:else}
                {data.courses.length} cursos en total
            {/if}
        </div>
    {:else}
        <!-- Empty State -->
        <Card class="!p-12">
            <div class="text-center">
                <div class="mx-auto w-20 h-20 bg-gray-100 dark:bg-gray-800 rounded-full flex items-center justify-center mb-4">
                    <BookOpenSolid class="w-10 h-10 text-gray-400 dark:text-gray-500" />
                </div>
                {#if searchTerm}
                    <h3 class="text-lg font-semibold text-gray-900 dark:text-white mb-2">
                        No se encontraron resultados
                    </h3>
                    <p class="text-gray-500 dark:text-gray-400 mb-4">
                        No hay cursos que coincidan con "<span class="font-medium">{searchTerm}</span>"
                    </p>
                    <Button color="light" onclick={() => searchTerm = ''}>
                        Limpiar búsqueda
                    </Button>
                {:else}
                    <h3 class="text-lg font-semibold text-gray-900 dark:text-white mb-2">
                        No hay cursos registrados
                    </h3>
                    <p class="text-gray-500 dark:text-gray-400 mb-4">
                        Comienza creando tu primer curso para organizar tu contenido educativo
                    </p>
                    <Button color="blue" href="/admin/courses/new">
                        <PlusOutline class="w-4 h-4 me-2" />
                        Crear Primer Curso
                    </Button>
                {/if}
            </div>
        </Card>
    {/if}
</div>

<!-- Delete Confirmation Modal -->
<Modal bind:open={showDeleteModal} size="sm" class="backdrop-blur-sm">
    <div class="text-center p-2">
        <div class="mx-auto mb-4 w-16 h-16 bg-gradient-to-br from-red-100 to-red-200 dark:from-red-900/30 dark:to-red-800/30 rounded-2xl flex items-center justify-center shadow-lg shadow-red-500/20">
            <ExclamationCircleOutline class="w-9 h-9 text-red-500" />
        </div>
        <h3 class="mb-2 text-xl font-bold text-gray-900 dark:text-white">
            ¿Eliminar curso?
        </h3>
        {#if courseToDelete}
            <p class="mb-2 text-gray-500 dark:text-gray-400">
                Estás a punto de eliminar:
            </p>
            <div class="mb-4 px-4 py-3 bg-gray-50 dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700">
                <p class="font-semibold text-gray-900 dark:text-white">
                    {courseToDelete.name}
                </p>
            </div>
        {/if}
        <p class="mb-6 text-sm text-gray-400 dark:text-gray-500">
            Esta acción no se puede deshacer. Se eliminarán todas las asignaciones de profesores y alumnos.
        </p>
        <div class="flex flex-col sm:flex-row justify-center gap-3">
            <Button color="alternative" onclick={() => { showDeleteModal = false; courseToDelete = null; }} class="!rounded-xl !px-6">
                Cancelar
            </Button>
            <Button color="red" loading={isLoading} onclick={deleteCourse} class="!rounded-xl !px-6 shadow-lg shadow-red-500/25 hover:shadow-red-500/40 transition-all">
                <TrashBinSolid class="w-4 h-4 me-2" />
                Eliminar
            </Button>
        </div>
    </div>
</Modal>

<!-- Rebuild Progress Modal -->
<Modal bind:open={showRebuildModal} size="sm" class="backdrop-blur-sm">
    <div class="p-2">
        <h3 class="mb-2 text-xl font-bold text-gray-900 dark:text-white text-center">
            Regenerar progreso
        </h3>
        {#if courseToRebuild}
            <p class="mb-4 text-sm text-gray-500 dark:text-gray-400 text-center">
                Curso: <span class="font-semibold text-gray-900 dark:text-white">{courseToRebuild.name}</span>
            </p>
        {/if}

        <div class="mb-4 space-y-2">
            <label class="flex cursor-pointer items-start gap-2 rounded-lg border border-gray-200 dark:border-gray-700 p-3">
                <input type="radio" bind:group={rebuildMode} value="fill_missing" class="mt-1" />
                <span class="text-sm text-gray-700 dark:text-gray-300">
                    <strong>Solo faltantes</strong><br />
                    Crea progreso solo donde no exista registro previo.
                </span>
            </label>
            <label class="flex cursor-pointer items-start gap-2 rounded-lg border border-gray-200 dark:border-gray-700 p-3">
                <input type="radio" bind:group={rebuildMode} value="rebuild_all" class="mt-1" />
                <span class="text-sm text-gray-700 dark:text-gray-300">
                    <strong>Reconstrucción completa</strong><br />
                    Borra progreso del curso y lo recalcula desde evidencias.
                </span>
            </label>
        </div>

        {#if rebuildResult}
            <p class="mb-4 text-sm {rebuildResult.success ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400'}">
                {rebuildResult.message}
            </p>
        {/if}

        <div class="flex flex-col sm:flex-row justify-center gap-3">
            <Button color="alternative" onclick={() => { showRebuildModal = false; courseToRebuild = null; rebuildResult = null; }} class="!rounded-xl !px-6" disabled={isRebuilding}>
                Cerrar
            </Button>
            <Button color="yellow" onclick={rebuildCourseProgress} class="!rounded-xl !px-6" disabled={isRebuilding}>
                {#if isRebuilding}
                    <Spinner size="4" class="me-2" />
                {/if}
                Ejecutar
            </Button>
        </div>
    </div>
</Modal>