<script lang="ts">
    import type { PageData } from './$types';
    import { Button, Dropdown, DropdownItem, Modal, Checkbox, Avatar, Toast, Table, TableBody, TableBodyCell, TableBodyRow, TableHead, TableHeadCell } from 'flowbite-svelte';
    import { Users, Activity, BookOpen, Upload, Menu, Eye, Download, UserMinus, Link2 } from 'lucide-svelte';
    import { enhance } from '$app/forms';
    import { invalidateAll } from '$app/navigation';
	import { resolve } from '$app/paths';

    interface ImportResult {
        status: 'success' | 'error' | 'skipped';
        email: string;
        rowNumber?: number;
        message?: string;
    }

    interface MoodlePreviewRow {
        moodleUserId: string;
        email: string;
        firstname: string;
        lastname: string;
        fullname: string;
        action: 'create_and_enroll' | 'enroll_only' | 'link_and_enroll' | 'link_only' | 'already_enrolled' | 'conflict' | 'invalid';
        message: string;
    }

    interface MoodlePreviewSummary {
        total: number;
        createAndEnroll: number;
        enrollOnly: number;
        linkAndEnroll: number;
        linkOnly: number;
        alreadyEnrolled: number;
        conflicts: number;
        invalid: number;
    }

    interface EnhanceResult {
        type: 'success' | 'error' | string;
    }

    interface EnhanceCallbackParams {
        result: EnhanceResult;
    }

    let { data }: { data: PageData } = $props();
    let csvFile = $state<File | null>(null);
    let showImportModal = $state(false);
    let showMoodleImportModal = $state(false);
    let showMoodleResultsModal = $state(false);
    let showUnenrollModal = $state(false);
    let showBulkUnenrollModal = $state(false);
    let studentToUnenroll = $state<string | null>(null);
    
    // State for toast messages
    let showToast = $state(false);
    let toastMessage = $state('');
    let toastType = $state<'success' | 'error'>('success');
    
    // State for selected students
    let selectedStudents = $state<string[]>([]);
    let allSelected = $state(false);
    
    // State for import progress and results
    let isImporting = $state(false);
    let importProgress = $state(0);
    let importResults = $state<ImportResult[]>([]);
    let showImportResults = $state(false);
    let importSummary = $state<{ total: number; success: number; errors: number }>({ total: 0, success: 0, errors: 0 });
    let importError = $state<string | null>(null);
    let importValidationError = $state<string | null>(null);
    
    // State for Moodle import wizard
    let moodleBaseUrl = $state('');
    let moodleToken = $state('');
    let moodleCourseId = $state('');
    let moodleStep = $state<1 | 2>(1);
    let moodlePreviewRows = $state<MoodlePreviewRow[]>([]);
    let moodlePreviewSummary = $state<MoodlePreviewSummary>({
        total: 0,
        createAndEnroll: 0,
        enrollOnly: 0,
        linkAndEnroll: 0,
        linkOnly: 0,
        alreadyEnrolled: 0,
        conflicts: 0,
        invalid: 0
    });
    let moodleError = $state<string | null>(null);
    let moodleResults = $state<ImportResult[]>([]);
    let moodleResultSummary = $state<{ total: number; success: number; skipped: number; errors: number }>({
        total: 0,
        success: 0,
        skipped: 0,
        errors: 0
    });
    let isLoadingMoodlePreview = $state(false);
    let isConfirmingMoodleImport = $state(false);

    // Calculate completion rate for each student
    function getCompletionRate(studentId: string) {
        const completedActivities = data.studentProgress.filter(p => p.userId === studentId).length;
        const totalActivities = data.activities.length;
        return totalActivities > 0 ? Math.round((completedActivities / totalActivities) * 100) : 0;
    }

    async function handleCsvUpload() {
        if (!csvFile) return;

        isImporting = true;
        importValidationError = null;
        importProgress = 0;

        const formData = new FormData();
        formData.append('file', csvFile);
        formData.append('courseId', data.courseId);

        try {
            const response = await fetch(`/api/courses/${data.courseId}/students/import`, {
                method: 'POST',
                body: formData
            });

            const responseData = await response.json();

            if (!response.ok) {
                // Si es un error de validación (400), mostrar en el modal
                if (response.status === 400) {
                    importValidationError = responseData.message || responseData.error || 'Error desconocido durante la validación';
                    isImporting = false;
                    return;
                }
                
                // Si es otro tipo de error, mostrar toast
                throw new Error(responseData.message || responseData.error || 'Error desconocido');
            }

            // Procesar resultados
            importResults = responseData.results || [];
            importSummary = {
                total: responseData.totalProcessed || importResults.length,
                success: responseData.successCount || importResults.filter((r: ImportResult) => r.status === 'success').length,
                errors: importResults.filter((r: ImportResult) => r.status === 'error').length
            };

            showImportResults = true;
            closeModal();
            
            // Refresh the page después de un breve delay
            setTimeout(() => {
                invalidateAll();
            }, 1000);
        } catch (error) {
            console.error('Error importing students:', error);
            showToastMessage('Error al importar estudiantes: ' + (error instanceof Error ? error.message : 'Error desconocido'), 'error');
        } finally {
            isImporting = false;
        }
    }

    function handleFileChange(event: Event) {
        const input = event.target as HTMLInputElement;
        if (input.files && input.files.length > 0) {
            csvFile = input.files[0];
        }
    }

    function closeModal() {
        showImportModal = false;
        csvFile = null;
        importValidationError = null;
    }

    function openMoodleImportModal() {
        resetMoodleWizard();
        showMoodleImportModal = true;
    }

    function closeMoodleImportModal() {
        showMoodleImportModal = false;
        resetMoodleWizard();
    }

    function resetMoodleWizard() {
        moodleStep = 1;
        moodleBaseUrl = '';
        moodleToken = '';
        moodleCourseId = '';
        moodlePreviewRows = [];
        moodlePreviewSummary = {
            total: 0,
            createAndEnroll: 0,
            enrollOnly: 0,
            linkAndEnroll: 0,
            linkOnly: 0,
            alreadyEnrolled: 0,
            conflicts: 0,
            invalid: 0
        };
        moodleError = null;
        isLoadingMoodlePreview = false;
        isConfirmingMoodleImport = false;
    }

    function closeMoodleResultsModal() {
        showMoodleResultsModal = false;
        moodleResults = [];
        moodleResultSummary = { total: 0, success: 0, skipped: 0, errors: 0 };
    }

    async function loadMoodlePreview() {
        if (!moodleBaseUrl || !moodleToken || !moodleCourseId) {
            moodleError = 'Debes indicar URL del endpoint REST, token e ID de curso de Moodle';
            return;
        }

        isLoadingMoodlePreview = true;
        moodleError = null;

        try {
            const response = await fetch(`/api/courses/${data.courseId}/students/import/moodle/preview`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    baseUrl: moodleBaseUrl,
                    token: moodleToken,
                    moodleCourseId
                })
            });

            const responseData = await response.json();
            if (!response.ok) {
                throw new Error(responseData.message || responseData.error || 'No se pudo generar la previsualización');
            }

            moodlePreviewRows = responseData.rows || [];
            moodlePreviewSummary = responseData.summary || moodlePreviewSummary;
            moodleStep = 2;
            moodleToken = '';
        } catch (error) {
            moodleError = error instanceof Error ? error.message : 'Error desconocido';
        } finally {
            isLoadingMoodlePreview = false;
        }
    }

    async function confirmMoodleImport() {
        if (!moodleBaseUrl || !moodleToken || !moodleCourseId) {
            moodleError = 'Para confirmar debes volver a ingresar el token de Moodle';
            return;
        }

        isConfirmingMoodleImport = true;
        moodleError = null;

        try {
            const response = await fetch(`/api/courses/${data.courseId}/students/import/moodle/confirm`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    baseUrl: moodleBaseUrl,
                    token: moodleToken,
                    moodleCourseId
                })
            });

            const responseData = await response.json();
            if (!response.ok) {
                throw new Error(responseData.message || responseData.error || 'No se pudo completar la importación');
            }

            moodleResults = (responseData.results || []).map((result: { email: string; message?: string; status: 'success' | 'error' | 'skipped' }) => ({
                email: result.email,
                status: result.status,
                message: result.message
            }));
            moodleResultSummary = responseData.summary || { total: 0, success: 0, skipped: 0, errors: 0 };

            showMoodleImportModal = false;
            showMoodleResultsModal = true;
            moodleToken = '';
            invalidateAll();
        } catch (error) {
            moodleError = error instanceof Error ? error.message : 'Error desconocido';
        } finally {
            isConfirmingMoodleImport = false;
        }
    }
    
    function closeResultsModal() {
        showImportResults = false;
        importResults = [];
        importSummary = { total: 0, success: 0, errors: 0 };
        importError = null;
    }
    
    // Display toast message
    function showToastMessage(message: string, type: 'success' | 'error') {
        toastMessage = message;
        toastType = type;
        showToast = true;
        
        // Auto-hide toast after 3 seconds
        setTimeout(() => {
            showToast = false;
        }, 3000);
    }
    
    // Handle toggle of a single student selection
    function toggleSelection(studentId: string) {
        if (selectedStudents.includes(studentId)) {
            selectedStudents = selectedStudents.filter(id => id !== studentId);
            allSelected = false;
        } else {
            selectedStudents = [...selectedStudents, studentId];
            allSelected = selectedStudents.length === data.students.length;
        }
    }
    
    // Handle toggle of all students selection
    function toggleSelectAll() {
        if (allSelected) {
            selectedStudents = [];
            allSelected = false;
        } else {
            selectedStudents = data.students.map(student => student.id);
            allSelected = true;
        }
    }
    
    // Show unenroll confirmation modal for a single student
    function confirmUnenrollStudent(studentId: string) {
        studentToUnenroll = studentId;
        showUnenrollModal = true;
    }
    
    // Show unenroll confirmation modal for multiple students
    function confirmBulkUnenroll() {
        if (selectedStudents.length > 0) {
            showBulkUnenrollModal = true;
        }
    }
    
    // Handle bulk unenroll result
    function handleBulkUnenrollResult() {
        return async ({ result }: EnhanceCallbackParams) => {
            if (result.type === 'success') {
                showToastMessage(`${selectedStudents.length} estudiantes dados de baja exitosamente`, 'success');
                selectedStudents = [];
                allSelected = false;
                showBulkUnenrollModal = false;
                invalidateAll();
            } else {
                showToastMessage('Error al dar de baja a los estudiantes', 'error');
            }
        };
    }
    
    // Handle single student unenroll result
    function handleUnenrollResult() {
        return async ({ result }: EnhanceCallbackParams) => {
            if (result.type === 'success') {
                showToastMessage('Estudiante dado de baja exitosamente', 'success');
                showUnenrollModal = false;
                studentToUnenroll = null;
                invalidateAll();
            } else {
                showToastMessage('Error al dar de baja al estudiante', 'error');
            }
        };
    }
    
    // Export students as CSV
    function exportStudents() {
        const studentsToExport = data.students.filter(student => 
            selectedStudents.length === 0 || selectedStudents.includes(student.id)
        );
        
        // Create CSV content
        const headers = ['ID', 'Nombre de usuario', 'Email', 'ID Externo'];
        const csvContent = [
            headers.join(','),
            ...studentsToExport.map(student => [
                student.id,
                student.username || '',
                student.email,
                // student.externalId || ''
            ].join(','))
        ].join('\n');
        
        // Create download link and trigger download
        const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.setAttribute('href', url);
        link.setAttribute('download', `curso-${data.courseId}-estudiantes.csv`);
        link.style.visibility = 'hidden';
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        
        if (selectedStudents.length > 0) {
            showToastMessage(`Exportados ${selectedStudents.length} estudiantes`, 'success');
        } else {
            showToastMessage(`Exportados todos los ${studentsToExport.length} estudiantes`, 'success');
        }
    }
</script>

<div class="container mx-auto p-4">
    <div class="mb-6 flex justify-between items-center">
        <div>
            <h1 class="text-2xl font-bold mb-2 dark:text-white">Estudiantes</h1>
            <p class="text-gray-600 dark:text-gray-400">Gestionar y realizar seguimiento de estudiantes</p>
        </div>
        <div class="flex gap-2">
            <Button color="light">
                <Menu class="w-4 h-4 mr-2" />
                Acciones
            </Button>
            <Dropdown>
                <DropdownItem onclick={() => showImportModal = true}>
                    <Upload class="w-4 h-4 mr-2" />
                    Importar desde CSV
                </DropdownItem>
                <DropdownItem onclick={openMoodleImportModal}>
                    <Link2 class="w-4 h-4 mr-2" />
                    Importar desde Moodle
                </DropdownItem>
                <DropdownItem onclick={exportStudents}>
                    <Download class="w-4 h-4 mr-2" />
                    Exportar como CSV
                </DropdownItem>
            </Dropdown>
        </div>
    </div>

    <!-- Stats Overview -->
    <div class="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
        <div class="bg-white dark:bg-gray-800 p-4 rounded-lg shadow">
            <div class="flex items-center gap-3">
                <div class="p-2 bg-blue-100 dark:bg-blue-900 rounded">
                    <Users class="w-5 h-5 text-blue-600 dark:text-blue-400" />
                </div>
                <div>
                    <p class="text-sm text-gray-600 dark:text-gray-400">Total Estudiantes</p>
                    <p class="text-xl font-bold dark:text-white">{data.students.length}</p>
                </div>
            </div>
        </div>
        
        <div class="bg-white dark:bg-gray-800 p-4 rounded-lg shadow">
            <div class="flex items-center gap-3">
                <div class="p-2 bg-green-100 dark:bg-green-900 rounded">
                    <Activity class="w-5 h-5 text-green-600 dark:text-green-400" />
                </div>
                <div>
                    <p class="text-sm text-gray-600 dark:text-gray-400">Total Actividades</p>
                    <p class="text-xl font-bold dark:text-white">{data.activities.length}</p>
                </div>
            </div>
        </div>

        <div class="bg-white dark:bg-gray-800 p-4 rounded-lg shadow">
            <div class="flex items-center gap-3">
                <div class="p-2 bg-purple-100 dark:bg-purple-900 rounded">
                    <BookOpen class="w-5 h-5 text-purple-600 dark:text-purple-400" />
                </div>
                <div>
                    <p class="text-sm text-gray-600 dark:text-gray-400">Promedio Completado</p>
                    <p class="text-xl font-bold dark:text-white">
                        {Math.round(data.students.reduce((acc, s) => acc + getCompletionRate(s.id), 0) / data.students.length || 0)}%
                    </p>
                </div>
            </div>
        </div>
    </div>

    <!-- Fixed height container for bulk actions -->
    <div class="h-13">
        {#if selectedStudents.length > 0}
            <div class="flex items-center gap-2 p-2 bg-gray-50 dark:bg-gray-800 rounded absolute left-0 right-0 z-10">
                <span class="text-sm dark:text-white">{selectedStudents.length} estudiantes seleccionados</span>
                <div class="ml-auto flex gap-2">
                    <Button color="red" size="xs" onclick={confirmBulkUnenroll}>
                        <UserMinus size={14} class="mr-1" />
                        Dar de baja
                    </Button>
                    <Button color="alternative" size="xs" onclick={exportStudents}>
                        <Download size={14} class="mr-1" />
                        Exportar
                    </Button>
                    <Button color="alternative" size="xs" onclick={() => { selectedStudents = []; allSelected = false; }}>
                        Cancelar
                    </Button>
                </div>
            </div>
        {/if}
    </div>

    <!-- Student List -->
    <div class="bg-white dark:bg-gray-800 rounded-lg shadow overflow-hidden">
        <div class="overflow-x-auto">
            <Table striped={true} class="w-full min-w-full">
                <TableHead>
                    <TableHeadCell class="p-4 w-10">
                        <Checkbox checked={allSelected} onchange={toggleSelectAll} />
                    </TableHeadCell>
                    <TableHeadCell>Estudiante</TableHeadCell>
                    <TableHeadCell>Acciones</TableHeadCell>
                </TableHead>
                <TableBody class="divide-y">
                    {#each data.students as student (student.id)}
                        <TableBodyRow>
                            <TableBodyCell class="p-4 w-10">
                                <Checkbox 
                                    checked={selectedStudents.includes(student.id)} 
                                    onchange={() => toggleSelection(student.id)}
                                />
                            </TableBodyCell>
                            <TableBodyCell>
                                <div class="flex items-center gap-3">
                                    <Avatar 
                                        src={student.image || "/images/default_avatar.png"} 
                                        alt={student.username ?? "Avatar"}
                                        class="w-8 h-8"
                                        cornerStyle="rounded"
                                    />
                                    <div>
                                        <a 
                                            href={resolve(`/course/${data.courseId}/admin/students/${student.id}`)} 
                                            class="font-medium dark:text-white hover:text-purple-600 dark:hover:text-purple-400"
                                        >
                                            {student.username}
                                        </a>
                                        <!-- <p class="text-sm text-gray-500 dark:text-gray-400">
                                            {student.email}{student.externalId ? ` (${student.externalId})` : ''}
                                        </p> -->
                                    </div>
                                </div>
                            </TableBodyCell>
                            <TableBodyCell>
                                <div class="flex space-x-2">
                                    <a 
                                        href={resolve(`/course/${data.courseId}/admin/students/${student.id}`)}
                                        class="p-1 hover:bg-gray-100 dark:hover:bg-gray-700 rounded"
                                    >
                                        <Eye size={16} class="dark:text-white" />
                                    </a>
                                    <button 
                                        type="button"
                                        class="p-1 hover:bg-gray-100 dark:hover:bg-gray-700 rounded text-red-600"
                                        onclick={() => confirmUnenrollStudent(student.id)}
                                    >
                                        <UserMinus size={16} />
                                    </button>
                                </div>
                            </TableBodyCell>
                        </TableBodyRow>
                    {/each}
                </TableBody>
            </Table>
        </div>
    </div>
</div>

<!-- Import Modal -->
<Modal bind:open={showImportModal} size="md">
    <div class="p-4">
        <h3 class="text-xl font-semibold mb-4 dark:text-white">Importar Estudiantes desde CSV</h3>
        
        {#if importValidationError}
            <div class="mb-4 p-4 bg-red-100 dark:bg-red-900/20 border border-red-300 dark:border-red-700 rounded-lg">
                <p class="text-red-800 dark:text-red-200 font-semibold">Error en la validación:</p>
                <p class="text-red-700 dark:text-red-300 text-sm mt-1">{importValidationError}</p>
            </div>
        {/if}
        
        <p class="text-sm text-gray-600 dark:text-gray-400 mb-4">
            Sube un archivo CSV con las siguientes columnas: <strong>id, email, firstname, lastname, fullname</strong>
        </p>
        
        <div class="space-y-4">
            {#if isImporting}
                <div class="flex flex-col items-center justify-center py-8">
                    <div class="animate-spin rounded-full h-12 w-12 border-b-2 border-purple-600 mb-4"></div>
                    <p class="text-gray-600 dark:text-gray-400">Importando estudiantes...</p>
                    <div class="w-full mt-4 bg-gray-200 dark:bg-gray-700 rounded-full h-2">
                        <div class="bg-purple-600 h-2 rounded-full transition-all" style="width: {importProgress}%"></div>
                    </div>
                </div>
            {:else}
                <input
                    type="file"
                    accept=".csv"
                    onchange={handleFileChange}
                    disabled={isImporting}
                    class="block w-full text-sm text-gray-900 border border-gray-300 rounded-lg cursor-pointer bg-gray-50 dark:text-gray-400 focus:outline-none dark:bg-gray-700 dark:border-gray-600 dark:placeholder-gray-400 disabled:opacity-50 disabled:cursor-not-allowed"
                />
                
                <div class="text-xs text-gray-500 dark:text-gray-400 bg-blue-50 dark:bg-blue-900/20 p-3 rounded">
                    <p class="font-semibold mb-2">Requisitos del CSV:</p>
                    <ul class="list-disc list-inside space-y-1">
                        <li>Codificación: UTF-8 (recomendado) o Windows-1252</li>
                        <li>Separador: coma (,)</li>
                        <li>Columnas requeridas: id, email, firstname, lastname, fullname</li>
                        <li>Email debe ser válido (ejemplo@dominio.com)</li>
                    </ul>
                </div>
                
                <div class="flex justify-end gap-2">
                    <Button color="alternative" onclick={closeModal} disabled={isImporting}>Cancelar</Button>
                    <Button color="purple" onclick={handleCsvUpload} disabled={!csvFile || isImporting}>
                        <Upload class="w-4 h-4 mr-2" />
                        Importar
                    </Button>
                </div>
            {/if}
        </div>
    </div>
</Modal>

<!-- Moodle Import Modal -->
<Modal bind:open={showMoodleImportModal} size="xl">
    <div class="p-4">
        <h3 class="text-xl font-semibold mb-4 dark:text-white">Asistente de Importación desde Moodle</h3>

        {#if moodleError}
            <div class="mb-4 p-4 bg-red-100 dark:bg-red-900/20 border border-red-300 dark:border-red-700 rounded-lg">
                <p class="text-red-800 dark:text-red-200 font-semibold">Error:</p>
                <p class="text-red-700 dark:text-red-300 text-sm mt-1">{moodleError}</p>
            </div>
        {/if}

        {#if moodleStep === 1}
            <div class="space-y-4">
                <p class="text-sm text-gray-600 dark:text-gray-400">
                    Introduce los datos del servicio web de Moodle para obtener la lista de estudiantes.
                </p>

                <div>
                    <label for="moodleRestEndpointInput" class="block text-sm font-medium mb-1 dark:text-white">URL del endpoint REST de Moodle</label>
                    <input
                        id="moodleRestEndpointInput"
                        type="url"
                        bind:value={moodleBaseUrl}
                        placeholder="https://moodle.unican.es/webservice/rest/server.php"
                        autocomplete="off"
                        autocapitalize="off"
                        spellcheck="false"
                        data-1p-ignore="true"
                        data-lpignore="true"
                        data-bwignore="true"
                        class="block w-full text-sm text-gray-900 border border-gray-300 rounded-lg bg-gray-50 dark:text-gray-300 focus:outline-none dark:bg-gray-700 dark:border-gray-600"
                    />
                </div>

                <div>
                    <label for="externalServiceSecretInput" class="block text-sm font-medium mb-1 dark:text-white">Token del servicio web de Moodle</label>
                    <input
                        id="externalServiceSecretInput"
                        type="password"
                        bind:value={moodleToken}
                        placeholder="Token del servicio web"
                        autocomplete="new-password"
                        autocapitalize="off"
                        spellcheck="false"
                        data-form-type="other"
                        data-1p-ignore="true"
                        data-lpignore="true"
                        data-bwignore="true"
                        class="block w-full text-sm text-gray-900 border border-gray-300 rounded-lg bg-gray-50 dark:text-gray-300 focus:outline-none dark:bg-gray-700 dark:border-gray-600"
                    />
                    <p class="mt-2 text-xs text-amber-800 dark:text-amber-300 bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded p-2">
                        Tu token de Moodle se usa exclusivamente para consultar los estudiantes del curso durante esta importación.
                        No se guarda en nuestra base de datos ni se persiste después de completar el proceso.
                    </p>
                </div>

                <div>
                    <label for="moodleCourseId" class="block text-sm font-medium mb-1 dark:text-white">ID del curso en Moodle</label>
                    <input
                        id="moodleCourseId"
                        type="text"
                        bind:value={moodleCourseId}
                        placeholder="Ej: 42"
                        autocomplete="off"
                        autocapitalize="off"
                        spellcheck="false"
                        data-1p-ignore="true"
                        data-lpignore="true"
                        data-bwignore="true"
                        class="block w-full text-sm text-gray-900 border border-gray-300 rounded-lg bg-gray-50 dark:text-gray-300 focus:outline-none dark:bg-gray-700 dark:border-gray-600"
                    />
                </div>

                <div class="flex justify-end gap-2">
                    <Button color="alternative" onclick={closeMoodleImportModal} disabled={isLoadingMoodlePreview}>
                        Cancelar
                    </Button>
                    <Button color="purple" onclick={loadMoodlePreview} disabled={isLoadingMoodlePreview}>
                        {#if isLoadingMoodlePreview}Consultando Moodle...{:else}Continuar{/if}
                    </Button>
                </div>
            </div>
        {:else}
            <div class="space-y-4">
                <div class="grid grid-cols-2 md:grid-cols-4 gap-3">
                    <div class="bg-blue-50 dark:bg-blue-900/20 p-3 rounded-lg">
                        <p class="text-xs text-gray-600 dark:text-gray-400">Crear e inscribir</p>
                        <p class="text-xl font-bold text-blue-600 dark:text-blue-400">{moodlePreviewSummary.createAndEnroll}</p>
                    </div>
                    <div class="bg-green-50 dark:bg-green-900/20 p-3 rounded-lg">
                        <p class="text-xs text-gray-600 dark:text-gray-400">Inscribir existentes</p>
                        <p class="text-xl font-bold text-green-600 dark:text-green-400">{moodlePreviewSummary.enrollOnly + moodlePreviewSummary.linkAndEnroll}</p>
                    </div>
                    <div class="bg-yellow-50 dark:bg-yellow-900/20 p-3 rounded-lg">
                        <p class="text-xs text-gray-600 dark:text-gray-400">Ya inscritos/vincular</p>
                        <p class="text-xl font-bold text-yellow-600 dark:text-yellow-400">{moodlePreviewSummary.alreadyEnrolled + moodlePreviewSummary.linkOnly}</p>
                    </div>
                    <div class="bg-red-50 dark:bg-red-900/20 p-3 rounded-lg">
                        <p class="text-xs text-gray-600 dark:text-gray-400">Conflictos + inválidos</p>
                        <p class="text-xl font-bold text-red-600 dark:text-red-400">{moodlePreviewSummary.conflicts + moodlePreviewSummary.invalid}</p>
                    </div>
                </div>

                <div class="max-h-72 overflow-y-auto border border-gray-200 dark:border-gray-700 rounded-lg">
                    <table class="w-full text-sm">
                        <thead class="bg-gray-100 dark:bg-gray-800 sticky top-0">
                            <tr>
                                <th class="text-left p-2 dark:text-gray-200">Nombre</th>
                                <th class="text-left p-2 dark:text-gray-200">Email</th>
                                <th class="text-left p-2 dark:text-gray-200">Moodle ID</th>
                                <th class="text-left p-2 dark:text-gray-200">Estado</th>
                            </tr>
                        </thead>
                        <tbody>
                            {#each moodlePreviewRows as row (`${row.moodleUserId}-${row.email}`)}
                                <tr class="border-t border-gray-100 dark:border-gray-700">
                                    <td class="p-2 dark:text-gray-300">{row.fullname}</td>
                                    <td class="p-2 dark:text-gray-300">{row.email || '-'}</td>
                                    <td class="p-2 dark:text-gray-300">{row.moodleUserId || '-'}</td>
                                    <td class="p-2">
                                        <span class="text-xs font-medium px-2 py-1 rounded bg-gray-200 dark:bg-gray-700 dark:text-gray-200">
                                            {row.action}
                                        </span>
                                        <p class="text-xs text-gray-500 dark:text-gray-400 mt-1">{row.message}</p>
                                    </td>
                                </tr>
                            {/each}
                        </tbody>
                    </table>
                </div>

                <div>
                    <label for="externalServiceSecretConfirmInput" class="block text-sm font-medium mb-1 dark:text-white">
                        Token del servicio web de Moodle para confirmar la importación
                    </label>
                    <input
                        id="externalServiceSecretConfirmInput"
                        type="password"
                        bind:value={moodleToken}
                        placeholder="Vuelve a introducir el token"
                        autocomplete="new-password"
                        autocapitalize="off"
                        spellcheck="false"
                        data-form-type="other"
                        data-1p-ignore="true"
                        data-lpignore="true"
                        data-bwignore="true"
                        class="block w-full text-sm text-gray-900 border border-gray-300 rounded-lg bg-gray-50 dark:text-gray-300 focus:outline-none dark:bg-gray-700 dark:border-gray-600"
                    />
                    <p class="mt-2 text-xs text-amber-800 dark:text-amber-300 bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded p-2">
                        Este token se usa solo para ejecutar esta importación y no se almacena en ningún momento.
                    </p>
                </div>

                <div class="flex justify-end gap-2">
                    <Button color="alternative" onclick={() => moodleStep = 1} disabled={isConfirmingMoodleImport}>
                        Volver
                    </Button>
                    <Button color="alternative" onclick={closeMoodleImportModal} disabled={isConfirmingMoodleImport}>
                        Cancelar
                    </Button>
                    <Button color="purple" onclick={confirmMoodleImport} disabled={isConfirmingMoodleImport || !moodleToken}>
                        {#if isConfirmingMoodleImport}Importando...{:else}Confirmar importación{/if}
                    </Button>
                </div>
            </div>
        {/if}
    </div>
</Modal>

<!-- Unenroll confirmation modal -->
<Modal bind:open={showUnenrollModal} size="xs">
    <div class="text-center">
        <h3 class="mb-5 text-lg font-normal text-gray-500 dark:text-gray-400">
            ¿Estás seguro de que quieres dar de baja a este estudiante del curso?
        </h3>
        <div class="flex justify-center gap-4">
            <form action="?/unenrollStudent" method="POST" use:enhance={handleUnenrollResult}>
                <input type="hidden" name="studentId" value={studentToUnenroll} />
                <input type="hidden" name="courseId" value={data.courseId} />
                <Button color="red" type="submit">
                    Sí, estoy seguro
                </Button>
            </form>
            <Button color="alternative" onclick={() => showUnenrollModal = false}>
                No, cancelar
            </Button>
        </div>
    </div>
</Modal>

<!-- Bulk Unenroll confirmation modal -->
<Modal bind:open={showBulkUnenrollModal} size="sm">
    <div class="text-center">
        <h3 class="mb-5 text-lg font-normal text-gray-500 dark:text-gray-400">
            ¿Estás seguro de que quieres dar de baja a {selectedStudents.length} estudiantes del curso?
        </h3>
        <div class="flex justify-center gap-4">
            <form action="?/unenrollBulk" method="POST" use:enhance={handleBulkUnenrollResult}>
                <input type="hidden" name="studentIds" value={JSON.stringify(selectedStudents)} />
                <input type="hidden" name="courseId" value={data.courseId} />
                <Button color="red" type="submit">
                    Sí, estoy seguro
                </Button>
            </form>
            <Button color="alternative" onclick={() => showBulkUnenrollModal = false}>
                No, cancelar
            </Button>
        </div>
    </div>
</Modal>

<!-- Import Results Modal -->
<Modal bind:open={showImportResults} size="lg">
    <div class="p-4">
        <h3 class="text-xl font-semibold mb-4 dark:text-white">Resultados de la Importación</h3>
        
        {#if importError}
            <div class="mb-4 p-4 bg-red-100 dark:bg-red-900/20 border border-red-300 dark:border-red-700 rounded-lg">
                <p class="text-red-800 dark:text-red-200 font-semibold">Error en la importación:</p>
                <p class="text-red-700 dark:text-red-300 text-sm mt-1">{importError}</p>
            </div>
        {:else}
            <!-- Resumen -->
            <div class="grid grid-cols-3 gap-4 mb-6">
                <div class="bg-blue-50 dark:bg-blue-900/20 p-3 rounded-lg">
                    <p class="text-xs text-gray-600 dark:text-gray-400">Total</p>
                    <p class="text-2xl font-bold text-blue-600 dark:text-blue-400">{importSummary.total}</p>
                </div>
                <div class="bg-green-50 dark:bg-green-900/20 p-3 rounded-lg">
                    <p class="text-xs text-gray-600 dark:text-gray-400">Exitosos</p>
                    <p class="text-2xl font-bold text-green-600 dark:text-green-400">{importSummary.success}</p>
                </div>
                <div class="bg-red-50 dark:bg-red-900/20 p-3 rounded-lg">
                    <p class="text-xs text-gray-600 dark:text-gray-400">Errores</p>
                    <p class="text-2xl font-bold text-red-600 dark:text-red-400">{importSummary.errors}</p>
                </div>
            </div>

            <!-- Resultados detallados -->
            {#if importResults.length > 0}
                <div class="mb-4">
                    <h4 class="font-semibold mb-3 dark:text-white">Detalles:</h4>
                    <div class="max-h-96 overflow-y-auto space-y-2">
                        {#each importResults as result (result.rowNumber || result.email)}
                            <div class="flex items-start gap-3 p-3 rounded {result.status === 'success' ? 'bg-green-50 dark:bg-green-900/20' : 'bg-red-50 dark:bg-red-900/20'}">
                                <div class="flex-shrink-0 mt-0.5">
                                    {#if result.status === 'success'}
                                        <svg class="w-5 h-5 text-green-600 dark:text-green-400" fill="currentColor" viewBox="0 0 20 20">
                                            <path fill-rule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clip-rule="evenodd"></path>
                                        </svg>
                                    {:else}
                                        <svg class="w-5 h-5 text-red-600 dark:text-red-400" fill="currentColor" viewBox="0 0 20 20">
                                            <path fill-rule="evenodd" d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" clip-rule="evenodd"></path>
                                        </svg>
                                    {/if}
                                </div>
                                <div class="flex-1 min-w-0">
                                    <div class="flex items-center gap-2">
                                        <p class="text-sm font-medium {result.status === 'success' ? 'text-green-800 dark:text-green-200' : 'text-red-800 dark:text-red-200'}">
                                            {result.email}
                                        </p>
                                        {#if result.rowNumber}
                                            <span class="text-xs bg-gray-300 dark:bg-gray-600 text-gray-700 dark:text-gray-300 px-2 py-0.5 rounded">
                                                Fila {result.rowNumber}
                                            </span>
                                        {/if}
                                    </div>
                                    {#if result.message}
                                        <p class="text-xs mt-1 {result.status === 'success' ? 'text-green-700 dark:text-green-300' : 'text-red-700 dark:text-red-300'}">
                                            {result.message}
                                        </p>
                                    {/if}
                                </div>
                            </div>
                        {/each}
                    </div>
                </div>
            {/if}
        {/if}

        <div class="flex justify-end gap-2 border-t pt-4">
            <Button color="purple" onclick={closeResultsModal}>Cerrar</Button>
        </div>
    </div>
</Modal>

<!-- Moodle Import Results Modal -->
<Modal bind:open={showMoodleResultsModal} size="lg">
    <div class="p-4">
        <h3 class="text-xl font-semibold mb-4 dark:text-white">Resultados de Importación desde Moodle</h3>

        <div class="grid grid-cols-4 gap-4 mb-6">
            <div class="bg-blue-50 dark:bg-blue-900/20 p-3 rounded-lg">
                <p class="text-xs text-gray-600 dark:text-gray-400">Total</p>
                <p class="text-2xl font-bold text-blue-600 dark:text-blue-400">{moodleResultSummary.total}</p>
            </div>
            <div class="bg-green-50 dark:bg-green-900/20 p-3 rounded-lg">
                <p class="text-xs text-gray-600 dark:text-gray-400">Exitosos</p>
                <p class="text-2xl font-bold text-green-600 dark:text-green-400">{moodleResultSummary.success}</p>
            </div>
            <div class="bg-yellow-50 dark:bg-yellow-900/20 p-3 rounded-lg">
                <p class="text-xs text-gray-600 dark:text-gray-400">Omitidos</p>
                <p class="text-2xl font-bold text-yellow-600 dark:text-yellow-400">{moodleResultSummary.skipped}</p>
            </div>
            <div class="bg-red-50 dark:bg-red-900/20 p-3 rounded-lg">
                <p class="text-xs text-gray-600 dark:text-gray-400">Errores</p>
                <p class="text-2xl font-bold text-red-600 dark:text-red-400">{moodleResultSummary.errors}</p>
            </div>
        </div>

        {#if moodleResults.length > 0}
            <div class="mb-4">
                <h4 class="font-semibold mb-3 dark:text-white">Detalles:</h4>
                <div class="max-h-96 overflow-y-auto space-y-2">
                    {#each moodleResults as result (`${result.email}-${result.message}`)}
                        <div class="flex items-start gap-3 p-3 rounded {result.status === 'success' ? 'bg-green-50 dark:bg-green-900/20' : result.status === 'skipped' ? 'bg-yellow-50 dark:bg-yellow-900/20' : 'bg-red-50 dark:bg-red-900/20'}">
                            <div class="flex-1 min-w-0">
                                <p class="text-sm font-medium {result.status === 'success' ? 'text-green-800 dark:text-green-200' : result.status === 'skipped' ? 'text-yellow-800 dark:text-yellow-200' : 'text-red-800 dark:text-red-200'}">
                                    {result.email}
                                </p>
                                {#if result.message}
                                    <p class="text-xs mt-1 {result.status === 'success' ? 'text-green-700 dark:text-green-300' : result.status === 'skipped' ? 'text-yellow-700 dark:text-yellow-300' : 'text-red-700 dark:text-red-300'}">
                                        {result.message}
                                    </p>
                                {/if}
                            </div>
                        </div>
                    {/each}
                </div>
            </div>
        {/if}

        <div class="flex justify-end gap-2 border-t pt-4">
            <Button color="purple" onclick={closeMoodleResultsModal}>Cerrar</Button>
        </div>
    </div>
</Modal>

<!-- Toast notification -->
{#if showToast}
    <div class="toast-container">
        <Toast 
            class="fixed bottom-4 right-4 z-50" 
            color={toastType === 'success' ? 'green' : 'red'}
        >
            {#snippet icon()}
                {#if toastType === 'success'}
                    <svg class="h-5 w-5" fill="currentColor" viewBox="0 0 20 20">
                        <path fill-rule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clip-rule="evenodd"></path>
                    </svg>
                {:else}
                    <svg class="h-5 w-5" fill="currentColor" viewBox="0 0 20 20">
                        <path fill-rule="evenodd" d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" clip-rule="evenodd"></path>
                    </svg>
                {/if}
            {/snippet}
            
            {toastMessage}
        </Toast>
    </div>
{/if}


<style>
    .toast-container {
        position: fixed;
        bottom: 1rem;
        right: 1rem;
        z-index: 50;
    }
</style>
