<script lang="ts">
    import type { PageData } from './$types';
    import { Table, TableBody, TableBodyCell, TableBodyRow, TableHead, TableHeadCell, Badge, Avatar } from 'flowbite-svelte';
    import { Users, MessageSquare, Calendar, ArrowLeft } from 'lucide-svelte';
    import { page } from '$app/state';

    let { data }: { data: PageData } = $props();

    function formatDate(date: string | number | Date | undefined | null) {
        if (!date) return 'Nunca';
        const dateObj = date instanceof Date ? date : new Date(date);
        return dateObj.toLocaleDateString(undefined, {
            year: 'numeric',
            month: 'long',
            day: 'numeric',
            hour: '2-digit',
            minute: '2-digit'
        });
    }

    function exportToCSV() {
        const headers = ['Estudiante', 'Estado', 'Última Actividad', 'Mensajes', 'Chats', 'Total Pulsaciones', 'Total Pegados', 'Tiempo Total (segundos)'];
        const csvRows = [
            headers.join(';')
        ];

        data.students.forEach(student => {
            // Calcular métricas totales para el estudiante
            let totalKeypresses = 0;
            let totalPastes = 0;
            let totalTime = 0;
            
            // Recorrer todos los chats del estudiante para sumar métricas
            student.chats.forEach(chat => {
                if (chat.messages) {
                    chat.messages.forEach(message => {
                        // Extraer métricas del mensaje si existen
                        if (message.metadata) {
                            try {
                                const metrics = JSON.parse(message.metadata);
                                totalKeypresses += metrics.keystrokeCount || 0;
                                totalPastes += metrics.pasteCount || 0;
                                totalTime += metrics.timeSpentSeconds || 0;
                            } catch (e) {
                                // Ignorar errores de parseo
                            }
                        }
                    });
                }
            });
            
            const row = [
                student.username || student.alias || 'Sin nombre',
                student.isCompleted ? 'Completado' : student.inProgress ? 'En Progreso' : 'Pendiente',
                formatDate(student.lastActivity),
                student.totalMessages,
                student.chats.length,
                totalKeypresses,
                totalPastes,
                totalTime
            ];
            csvRows.push(row.join(';'));
        });

        const csvContent = csvRows.join('\n');
        const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.setAttribute('href', url);
        link.setAttribute('download', 'estudiantes_actividad.csv');
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
    }
</script>

<div class="min-h-screen bg-gray-50 dark:bg-gray-900">
    <!-- Header with back arrow -->
    <div class="sticky top-0 z-10 bg-white dark:bg-gray-800 shadow-sm">
        <div class="container mx-auto px-4 max-w-screen-xl">
            <div class="flex items-center gap-4 py-4">
                <a
                    href="/course/{page.params.cid}/admin/interactives/{page.params.ilid}"
                    class="p-2 -ml-2 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
                    title="Volver a la actividad"
                >
                    <ArrowLeft size={20} class="text-gray-500 dark:text-gray-400" />
                </a>
                <div class="min-w-0 flex-1">
                    <h1 class="text-lg font-semibold text-gray-900 dark:text-white truncate">
                        Estudiantes: {data.interactive.name}
                    </h1>
                </div>
            </div>
        </div>
    </div>

    <!-- Content Area -->
    <div class="container mx-auto px-4 py-6 max-w-screen-xl">
        <div class="bg-white dark:bg-gray-800 rounded-lg shadow mb-6 p-4">
            <div class="flex justify-between items-center mb-4">
                <h2 class="text-xl font-semibold text-gray-900 dark:text-white flex items-center">
                    <Users class="mr-2 h-5 w-5 text-blue-500" />
                    Actividad de Estudiantes
                </h2>
                <button class="bg-blue-500 hover:bg-blue-700 text-white font-bold py-2 px-4 rounded" onclick={exportToCSV}>
                    Exportar a CSV
                </button>
            </div>
            
            <!-- Información sobre los criterios de estado -->
            <div class="bg-blue-50 dark:bg-blue-900 p-3 rounded-lg mb-4">
                <div class="flex items-start">
                    <div>
                        <p class="font-medium text-blue-800 dark:text-blue-200">Criterios de estado de actividad</p>
                        <ul class="list-disc ml-5 mt-2 text-sm text-blue-700 dark:text-blue-300">
                            <li>Un estudiante ha <strong>accedido</strong> a la actividad cuando tiene al menos un chat.</li>
							{#if data.interactive.type === 'agent'}
								<li>Un estudiante ha <strong>completado</strong> la actividad cuando el agente ejecuta la tool de finalizacion configurada y se registra progreso completado.</li>
							{:else}
                            	<li>Un estudiante ha <strong>completado</strong> la actividad cuando tiene al menos {data.requiresMinMessages} mensajes y uno de ellos contiene el texto <code>[[DONE]]</code>.</li>
							{/if}
                            <li>Un estudiante está <strong>en progreso</strong> cuando ha accedido pero aún no ha completado la actividad.</li>
                        </ul>
                    </div>
                </div>
            </div>
            
            <!-- Stats Cards -->
            <div class="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
                <div class="bg-blue-50 dark:bg-blue-900 p-4 rounded-lg">
                    <div class="flex items-center">
                        <div class="p-2 bg-blue-100 dark:bg-blue-800 rounded">
                            <Users class="h-6 w-6 text-blue-600 dark:text-blue-400" />
                        </div>
                        <div class="ml-3">
                            <p class="text-sm text-gray-600 dark:text-gray-400">Total Estudiantes Activos</p>
                            <p class="text-xl font-bold dark:text-white">
                                {data.students.filter(s => s.hasActivity).length} / {data.students.length}
                            </p>
                        </div>
                    </div>
                </div>
                
                <div class="bg-green-50 dark:bg-green-900 p-4 rounded-lg">
                    <div class="flex items-center">
                        <div class="p-2 bg-green-100 dark:bg-green-800 rounded">
                            <MessageSquare class="h-6 w-6 text-green-600 dark:text-green-400" />
                        </div>
                        <div class="ml-3">
                            <p class="text-sm text-gray-600 dark:text-gray-400">Actividades Completadas</p>
                            <p class="text-xl font-bold dark:text-white">
                                {data.students.filter(s => s.isCompleted).length} / {data.students.length}
                            </p>
                        </div>
                    </div>
                </div>
                
                <div class="bg-purple-50 dark:bg-purple-900 p-4 rounded-lg">
                    <div class="flex items-center">
                        <div class="p-2 bg-purple-100 dark:bg-purple-800 rounded">
                            <Calendar class="h-6 w-6 text-purple-600 dark:text-purple-400" />
                        </div>
                        <div class="ml-3">
                            <p class="text-sm text-gray-600 dark:text-gray-400">Promedio de Mensajes</p>
                            <p class="text-xl font-bold dark:text-white">
                                {data.students.filter(s => s.hasActivity).length > 0 
                                    ? Math.round(data.students.reduce((sum, student) => sum + student.totalMessages, 0) / 
                                      data.students.filter(s => s.hasActivity).length) 
                                    : 0}
                            </p>
                        </div>
                    </div>
                </div>
            </div>
            
            <!-- Students Table -->
            <div class="overflow-x-auto">
                <Table striped={true}>
                    <TableHead>
                        <TableHeadCell class="w-14"></TableHeadCell>
                        <TableHeadCell>Estudiante</TableHeadCell>
                        <TableHeadCell>Estado</TableHeadCell>
                        <TableHeadCell>Última Actividad</TableHeadCell>
                        <TableHeadCell>Mensajes</TableHeadCell>
                        <TableHeadCell>Chats</TableHeadCell>
                    </TableHead>
                    <TableBody class="divide-y">
                        {#each data.students as student}
                            <TableBodyRow>
                                <TableBodyCell class="p-4! w-14 h-14 flex items-center justify-center">
                                    <Avatar 
                                        src={student.image || '/images/default_avatar.png'} 
                                        class="w-8 h-8"
                                        alt={student.username || student.alias || 'Sin nombre'}
                                        cornerStyle="rounded"
                                    />
                                </TableBodyCell>
                                <TableBodyCell>
                                    <div class="font-medium text-gray-900 dark:text-white">
                                        {student.username || student.alias || 'Sin nombre'}
                                    </div>
                                </TableBodyCell>
                                <TableBodyCell>
                                    {#if student.isCompleted}
                                        <Badge color="green">Completado</Badge>
                                    {:else if student.inProgress}
                                        <Badge color="yellow">En Progreso</Badge>
                                    {:else}
                                        <Badge color="gray">Pendiente</Badge>
                                    {/if}
                                </TableBodyCell>
                                <TableBodyCell>
                                    {formatDate(student.lastActivity)}
                                </TableBodyCell>
                                <TableBodyCell>
                                    <div class="flex items-center">
                                        <span class="font-medium">{student.totalMessages}</span>
                                        {#if student.inProgress}
                                            <span class="ml-2 text-xs text-blue-500">
                                                {student.hasCompletionMarker ? 'Falta llegar a ' + data.requiresMinMessages + ' mensajes' : '(Falta marca finalización)'}
                                            </span>
                                        {/if}
                                    </div>
                                </TableBodyCell>
                                <TableBodyCell>
                                    <div class="font-medium">{student.chats.length}</div>
                                </TableBodyCell>
                            </TableBodyRow>
                        {/each}

                        {#if data.students.length === 0}
                            <TableBodyRow>
                                <TableBodyCell colspan={6} class="text-center py-4">
                                    No hay estudiantes inscritos en este curso
                                </TableBodyCell>
                            </TableBodyRow>
                        {/if}
                    </TableBody>
                </Table>
            </div>
        </div>
    </div>
</div>
