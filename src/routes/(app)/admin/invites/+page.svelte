<script lang="ts">
    import type { PageData, ActionData } from './$types';
    import { enhance } from '$app/forms';
    import {
        Button,
        Badge,
        Table,
        TableHead,
        TableHeadCell,
        TableBody,
        TableBodyRow,
        TableBodyCell,
        Select,
        Label,
        Input,
        Textarea,
        Alert,
        Modal
    } from 'flowbite-svelte';
    import {
        TicketPlus,
        Copy,
        Link,
        Ban,
        Download,
        Filter,
        ChevronDown,
        ChevronUp
    } from 'lucide-svelte';

    let { data, form }: { data: PageData; form: ActionData } = $props();

    let inviteType = $state('course_student');
    let quantity = $state(1);
    let campaign = $state('');
    let email = $state('');
    let courseId = $state('');
    let courseRole = $state('student');
    let systemRoleId = $state('');
    let expiresInDays = $state(30);
    let maxUses = $state(1);
    let welcomeMessage = $state('');
    let showGenerateForm = $state(false);
    let showCodesModal = $state(false);
    let filterType = $state('all');
    let copiedCode = $state('');

    // New codes from generation
    let generatedCodes = $derived((form as any)?.codes as string[] | undefined);

    $effect(() => {
        if (generatedCodes && generatedCodes.length > 0) {
            showCodesModal = true;
        }
    });

    function copyCode(code: string) {
        navigator.clipboard.writeText(code);
        copiedCode = code;
        setTimeout(() => (copiedCode = ''), 2000);
    }

    function copyInviteUrl(code: string) {
        const url = `${window.location.origin}/register?invite=${encodeURIComponent(code)}`;
        navigator.clipboard.writeText(url);
        copiedCode = code;
        setTimeout(() => (copiedCode = ''), 2000);
    }

    function copyAllCodes(codes: string[]) {
        navigator.clipboard.writeText(codes.join('\n'));
        copiedCode = 'all';
        setTimeout(() => (copiedCode = ''), 2000);
    }

    function downloadCsv() {
        const headers = [
            'Código',
            'Tipo',
            'Campaña',
            'Curso',
            'Email',
            'Max Usos',
            'Usos',
            'Creado',
            'Expira',
            'Estado',
            'Usado por'
        ];
        const csvContent = [
            headers.join(','),
            ...data.invites.map((inv) =>
                [
                    inv.code,
                    inv.config?.type || '',
                    inv.campaign || '',
                    inv.config?.courseName || '',
                    inv.email || '',
                    inv.maxUses,
                    inv.useCount,
                    new Date(inv.createdAt).toLocaleString(),
                    new Date(inv.expiresAt).toLocaleString(),
                    getStatusLabel(inv),
                    inv.usedByEmail || ''
                ].join(',')
            )
        ].join('\n');

        const blob = new Blob([csvContent], { type: 'text/csv' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `invitaciones-sistema-${new Date().toISOString().slice(0, 10)}.csv`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
    }

    function getStatusLabel(inv: any): string {
        if (!inv.isActive) return 'Desactivada';
        if (inv.isExpired) return 'Expirada';
        if (inv.isFullyUsed) return 'Agotada';
        return 'Disponible';
    }

    function getStatusColor(inv: any): 'green' | 'red' | 'yellow' | 'gray' {
        if (!inv.isActive) return 'gray';
        if (inv.isExpired) return 'red';
        if (inv.isFullyUsed) return 'yellow';
        return 'green';
    }

    function getTypeLabel(type: string): string {
        switch (type) {
            case 'course_student':
                return 'Alumno en curso';
            case 'course_role':
                return 'Rol en curso';
            case 'system_role':
                return 'Rol de sistema';
            case 'open_registration':
                return 'Registro abierto';
            default:
                return type;
        }
    }

    function getTypeColor(type: string): 'blue' | 'purple' | 'indigo' | 'green' {
        switch (type) {
            case 'course_student':
                return 'blue';
            case 'course_role':
                return 'purple';
            case 'system_role':
                return 'indigo';
            case 'open_registration':
                return 'green';
            default:
                return 'blue';
        }
    }

    let filteredInvites = $derived(
        filterType === 'all'
            ? data.invites
            : data.invites.filter((inv) => inv.config?.type === filterType)
    );

    const courseRoleOptions = [
        { value: 'student', name: 'Estudiante' },
        { value: 'assistant', name: 'Asistente' },
        { value: 'grader', name: 'Calificador' },
        { value: 'teacher', name: 'Profesor' },
        { value: 'admin', name: 'Admin de curso' },
        { value: 'owner', name: 'Propietario' }
    ];
</script>

<div class="space-y-6">
    <!-- Header -->
    <div class="flex flex-wrap items-center justify-between gap-4">
        <div>
            <h1 class="text-2xl font-bold text-gray-900 dark:text-white">Invitaciones del sistema</h1>
            <p class="mt-1 text-sm text-gray-500 dark:text-gray-400">
                Genera y gestiona invitaciones para registro de usuarios
            </p>
        </div>
        <div class="flex gap-2">
            <Button color="alternative" size="sm" onclick={downloadCsv}>
                <Download class="mr-2 h-4 w-4" />
                Exportar CSV
            </Button>
            <Button
                color="primary"
                size="sm"
                onclick={() => (showGenerateForm = !showGenerateForm)}
            >
                <TicketPlus class="mr-2 h-4 w-4" />
                Generar invitaciones
                {#if showGenerateForm}
                    <ChevronUp class="ml-2 h-4 w-4" />
                {:else}
                    <ChevronDown class="ml-2 h-4 w-4" />
                {/if}
            </Button>
        </div>
    </div>

    <!-- Stats -->
    <div class="grid grid-cols-2 gap-4 md:grid-cols-5">
        <div class="rounded-lg border border-gray-200 bg-white p-4 text-center shadow-sm dark:border-gray-700 dark:bg-gray-800">
            <p class="text-2xl font-bold text-gray-900 dark:text-white">{data.stats.total}</p>
            <p class="text-sm text-gray-500">Total</p>
        </div>
        <div class="rounded-lg border border-gray-200 bg-white p-4 text-center shadow-sm dark:border-gray-700 dark:bg-gray-800">
            <p class="text-2xl font-bold text-green-600">{data.stats.active}</p>
            <p class="text-sm text-gray-500">Activas</p>
        </div>
        <div class="rounded-lg border border-gray-200 bg-white p-4 text-center shadow-sm dark:border-gray-700 dark:bg-gray-800">
            <p class="text-2xl font-bold text-blue-600">{data.stats.used}</p>
            <p class="text-sm text-gray-500">Usadas</p>
        </div>
        <div class="rounded-lg border border-gray-200 bg-white p-4 text-center shadow-sm dark:border-gray-700 dark:bg-gray-800">
            <p class="text-2xl font-bold text-red-600">{data.stats.expired}</p>
            <p class="text-sm text-gray-500">Expiradas</p>
        </div>
        <div class="rounded-lg border border-gray-200 bg-white p-4 text-center shadow-sm dark:border-gray-700 dark:bg-gray-800">
            <p class="text-2xl font-bold text-purple-600">{data.stats.totalUses}</p>
            <p class="text-sm text-gray-500">Total usos</p>
        </div>
    </div>

    <!-- Generate Form -->
    {#if showGenerateForm}
        <div class="rounded-lg border border-gray-200 bg-white p-6 shadow-sm dark:border-gray-700 dark:bg-gray-800">
            <h2 class="mb-4 text-lg font-semibold text-gray-900 dark:text-white">
                Nueva invitación
            </h2>
            {#if form?.message && !form?.success}
                <Alert color="red" class="mb-4">{form.message}</Alert>
            {/if}
            <form method="POST" action="?/generate" use:enhance class="space-y-4">
                <div class="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
                    <!-- Invite Type -->
                    <div>
                        <Label for="inviteType" class="mb-2">Tipo de invitación</Label>
                        <Select
                            id="inviteType"
                            name="inviteType"
                            bind:value={inviteType}
                            items={[
                                { value: 'course_student', name: 'Alumno en curso' },
                                { value: 'course_role', name: 'Rol específico en curso' },
                                { value: 'system_role', name: 'Rol de sistema' },
                                { value: 'open_registration', name: 'Registro abierto' }
                            ]}
                        />
                    </div>

                    <!-- Course selector (for course types) -->
                    {#if inviteType === 'course_student' || inviteType === 'course_role'}
                        <div>
                            <Label for="courseId" class="mb-2">Curso</Label>
                            <Select
                                id="courseId"
                                name="courseId"
                                bind:value={courseId}
                                items={data.courses.map((c) => ({ value: c.id, name: c.name }))}
                                placeholder="Seleccione un curso"
                            />
                        </div>
                    {/if}

                    <!-- Course role (for course_role type) -->
                    {#if inviteType === 'course_role'}
                        <div>
                            <Label for="courseRole" class="mb-2">Rol en el curso</Label>
                            <Select
                                id="courseRole"
                                name="courseRole"
                                bind:value={courseRole}
                                items={courseRoleOptions}
                            />
                        </div>
                    {/if}

                    <!-- System role (for system_role type) -->
                    {#if inviteType === 'system_role'}
                        <div>
                            <Label for="systemRoleId" class="mb-2">Rol de sistema</Label>
                            <Select
                                id="systemRoleId"
                                name="systemRoleId"
                                bind:value={systemRoleId}
                                items={data.roles.map((r) => ({
                                    value: r.id,
                                    name: `${r.displayName} (nivel ${r.level})`
                                }))}
                                placeholder="Seleccione un rol"
                            />
                        </div>
                    {/if}

                    <!-- Quantity -->
                    <div>
                        <Label for="quantity" class="mb-2">Cantidad</Label>
                        <Input
                            type="number"
                            id="quantity"
                            name="quantity"
                            bind:value={quantity}
                            min={1}
                            max={100}
                        />
                    </div>

                    <!-- Max Uses -->
                    <div>
                        <Label for="maxUses" class="mb-2">Usos máximos por código</Label>
                        <Input
                            type="number"
                            id="maxUses"
                            name="maxUses"
                            bind:value={maxUses}
                            min={1}
                            max={1000}
                        />
                    </div>

                    <!-- Expires -->
                    <div>
                        <Label for="expiresInDays" class="mb-2">Expira en (días)</Label>
                        <Input
                            type="number"
                            id="expiresInDays"
                            name="expiresInDays"
                            bind:value={expiresInDays}
                            min={1}
                            max={365}
                        />
                    </div>

                    <!-- Campaign -->
                    <div>
                        <Label for="campaign" class="mb-2">Campaña (opcional)</Label>
                        <Input
                            type="text"
                            id="campaign"
                            name="campaign"
                            bind:value={campaign}
                            placeholder="Nombre de campaña"
                        />
                    </div>

                    <!-- Email restriction -->
                    <div>
                        <Label for="email" class="mb-2">Restringir a email (opcional)</Label>
                        <Input
                            type="email"
                            id="email"
                            name="email"
                            bind:value={email}
                            placeholder="usuario@ejemplo.com"
                        />
                    </div>
                </div>

                <!-- Welcome message -->
                <div>
                    <Label for="welcomeMessage" class="mb-2">Mensaje de bienvenida (opcional)</Label>
                    <Textarea
                        id="welcomeMessage"
                        name="welcomeMessage"
                        bind:value={welcomeMessage}
                        rows={2}
                        placeholder="Mensaje que se mostrará al usuario al registrarse con esta invitación"
                    />
                </div>

                <div class="flex justify-end">
                    <Button type="submit" color="primary">
                        <TicketPlus class="mr-2 h-4 w-4" />
                        Generar {quantity > 1 ? `${quantity} invitaciones` : 'invitación'}
                    </Button>
                </div>
            </form>
        </div>
    {/if}

    <!-- Generated Codes Modal -->
    <Modal title="Invitaciones generadas" bind:open={showCodesModal} size="md">
        {#if generatedCodes}
            <div class="space-y-3">
                <p class="text-sm text-gray-600 dark:text-gray-400">
                    Se generaron <strong>{generatedCodes.length}</strong> código(s). Cópielos antes de
                    cerrar.
                </p>
                <div
                    class="max-h-64 space-y-2 overflow-y-auto rounded-lg border border-gray-200 p-3 dark:border-gray-600"
                >
                    {#each generatedCodes as code}
                        <div
                            class="flex items-center justify-between rounded bg-gray-50 px-3 py-2 dark:bg-gray-700"
                        >
                            <code class="font-mono text-sm">{code}</code>
                            <div class="flex gap-1">
                                <Button
                                    size="xs"
                                    color={copiedCode === code ? 'green' : 'alternative'}
                                    onclick={() => copyCode(code)}
                                >
                                    <Copy class="h-3 w-3" />
                                </Button>
                                <Button
                                    size="xs"
                                    color="alternative"
                                    onclick={() => copyInviteUrl(code)}
                                    title="Copiar enlace de registro"
                                >
                                    <Link class="h-3 w-3" />
                                </Button>
                            </div>
                        </div>
                    {/each}
                </div>
                {#if generatedCodes.length > 1}
                    <Button
                        size="sm"
                        color="alternative"
                        onclick={() => copyAllCodes(generatedCodes || [])}
                        class="w-full"
                    >
                        <Copy class="mr-2 h-4 w-4" />
                        {copiedCode === 'all' ? '¡Copiados!' : 'Copiar todos los códigos'}
                    </Button>
                {/if}
            </div>
        {/if}
    </Modal>

    <!-- Filters -->
    <div class="flex items-center gap-3">
        <Filter class="h-4 w-4 text-gray-500" />
        <Select
            bind:value={filterType}
            items={[
                { value: 'all', name: 'Todos los tipos' },
                { value: 'course_student', name: 'Alumno en curso' },
                { value: 'course_role', name: 'Rol en curso' },
                { value: 'system_role', name: 'Rol de sistema' },
                { value: 'open_registration', name: 'Registro abierto' }
            ]}
            class="w-48"
        />
        <span class="text-sm text-gray-500">{filteredInvites.length} invitaciones</span>
    </div>

    <!-- Invites Table -->
    <Table striped={true}>
        <TableHead>
            <TableHeadCell>Código</TableHeadCell>
            <TableHeadCell>Tipo</TableHeadCell>
            <TableHeadCell>Destino</TableHeadCell>
            <TableHeadCell>Campaña</TableHeadCell>
            <TableHeadCell>Usos</TableHeadCell>
            <TableHeadCell>Creado</TableHeadCell>
            <TableHeadCell>Expira</TableHeadCell>
            <TableHeadCell>Estado</TableHeadCell>
            <TableHeadCell>Acciones</TableHeadCell>
        </TableHead>
        <TableBody>
            {#each filteredInvites as inv}
                <TableBodyRow>
                    <TableBodyCell>
                        <div class="flex items-center gap-2">
                            <code class="text-xs font-mono">{inv.code}</code>
                            <button
                                onclick={() => copyCode(inv.code)}
                                class="text-gray-400 hover:text-gray-600"
                                title="Copiar código"
                            >
                                <Copy class="h-3 w-3" />
                            </button>
                            <button
                                onclick={() => copyInviteUrl(inv.code)}
                                class="text-gray-400 hover:text-blue-600"
                                title="Copiar enlace de registro"
                            >
                                <Link class="h-3 w-3" />
                            </button>
                        </div>
                    </TableBodyCell>
                    <TableBodyCell>
                        <Badge color={getTypeColor(inv.config?.type || '')}>
                            {getTypeLabel(inv.config?.type || '')}
                        </Badge>
                    </TableBodyCell>
                    <TableBodyCell>
                        <span class="text-sm">
                            {#if inv.config?.type === 'course_student' || inv.config?.type === 'course_role'}
                                {inv.config.courseName || inv.courseId || '-'}
                                {#if inv.config?.type === 'course_role'}
                                    <Badge color="purple" class="ml-1">{inv.config.courseRole}</Badge>
                                {/if}
                            {:else if inv.config?.type === 'system_role'}
                                Rol: {inv.config.systemRoleId}
                            {:else}
                                -
                            {/if}
                        </span>
                    </TableBodyCell>
                    <TableBodyCell>
                        <span class="text-sm text-gray-500">{inv.campaign || '-'}</span>
                    </TableBodyCell>
                    <TableBodyCell>
                        <span class="text-sm">{inv.useCount}/{inv.maxUses}</span>
                    </TableBodyCell>
                    <TableBodyCell>
                        <span class="text-xs text-gray-500">
                            {new Date(inv.createdAt).toLocaleDateString()}
                        </span>
                    </TableBodyCell>
                    <TableBodyCell>
                        <span class="text-xs text-gray-500">
                            {new Date(inv.expiresAt).toLocaleDateString()}
                        </span>
                    </TableBodyCell>
                    <TableBodyCell>
                        <Badge color={getStatusColor(inv)}>{getStatusLabel(inv)}</Badge>
                    </TableBodyCell>
                    <TableBodyCell>
                        {#if inv.isActive && !inv.isExpired && !inv.isFullyUsed}
                            <form method="POST" action="?/deactivate" use:enhance>
                                <input type="hidden" name="inviteId" value={inv.id} />
                                <Button type="submit" size="xs" color="red" outline>
                                    <Ban class="h-3 w-3" />
                                </Button>
                            </form>
                        {/if}
                    </TableBodyCell>
                </TableBodyRow>
            {/each}
            {#if filteredInvites.length === 0}
                <TableBodyRow>
                    <TableBodyCell colspan={9} class="text-center text-gray-500">
                        No hay invitaciones
                    </TableBodyCell>
                </TableBodyRow>
            {/if}
        </TableBody>
    </Table>
</div>
