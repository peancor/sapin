<script lang="ts">
    import type { PageData } from './$types';
    import { enhance } from '$app/forms';
    import { goto, invalidateAll } from '$app/navigation';
    import { breadcrumb } from '$lib/stores/breadcrumb';
    import ImageUpload from '$lib/components/ImageUpload.svelte';
    import { Button, Label, Input, Helper, Checkbox, Badge, Card } from 'flowbite-svelte';
    import { UserCog, Mail, User, Lock, Shield, ArrowLeft, Save, Users, Crown } from 'lucide-svelte';

    let { data }: { data: PageData } = $props();

    let selectedFile = $state<File | null>(null);
	let removeImage = $state(false);
    let loading = $state(false);
    let error = $state('');
    
    // Estado para roles del nuevo sistema
    let selectedRoleIds = $state<string[]>([...data.assignedRoleIds]);
    let rolesLoading = $state(false);
    let rolesError = $state('');
    let rolesSuccess = $state(false);

    function getRoleBadgeColor(level: number): 'red' | 'yellow' | 'green' | 'blue' | 'purple' {
        if (level >= 90) return 'red';
        if (level >= 50) return 'yellow';
        if (level >= 40) return 'green';
        return 'blue';
    }

    function toggleRole(roleId: string) {
        if (selectedRoleIds.includes(roleId)) {
            selectedRoleIds = selectedRoleIds.filter(id => id !== roleId);
        } else {
            selectedRoleIds = [...selectedRoleIds, roleId];
        }
        rolesSuccess = false;
    }

    function handleImageChange(file: File | null) {
        selectedFile = file;
        removeImage = false; // Si se selecciona nueva imagen, no eliminar
    }

    function handleImageRemove() {
        selectedFile = null;
        removeImage = true;
    }

    $effect(() => {
        breadcrumb.set([
            { label: 'Home', href: '/' },
            { label: 'Administration', href: '/admin' },
            { label: 'Users', href: '/admin/users' },
            { label: 'Editar Usuario', href: `/admin/users/${data.user.id}/edit` }
        ]);
    });
</script>

<div class="mx-auto max-w-2xl">
    <!-- Header -->
    <div class="mb-6 flex items-center justify-between">
        <div class="flex items-center gap-3">
            <div class="flex h-12 w-12 items-center justify-center rounded-xl bg-primary-100 dark:bg-primary-900">
                <UserCog class="h-6 w-6 text-primary-600 dark:text-primary-400" />
            </div>
            <div>
                <h1 class="text-2xl font-bold text-gray-900 dark:text-white">Editar Usuario</h1>
                <p class="text-sm text-gray-500 dark:text-gray-400">Modifica los datos del usuario</p>
            </div>
        </div>
        <a
            href="/admin/users"
            class="flex items-center gap-2 rounded-lg border border-gray-200 bg-white px-4 py-2 text-sm font-medium text-gray-700 transition-colors hover:bg-gray-50 dark:border-gray-600 dark:bg-gray-700 dark:text-gray-200 dark:hover:bg-gray-600"
        >
            <ArrowLeft class="h-4 w-4" />
            Volver
        </a>
    </div>

    <!-- Form Card -->
    <div class="rounded-2xl border border-gray-200 bg-white shadow-sm dark:border-gray-700 dark:bg-gray-800">
        <form
            method="POST"
            action="?/updateUser"
            enctype="multipart/form-data"
            use:enhance={({ formData }) => {
                loading = true;
                error = '';
                if (selectedFile) {
                    formData.set('avatar', selectedFile);
                }

                return async ({ result }) => {
                    loading = false;
                    if (result.type === 'success') {
                        await invalidateAll();
                        goto('/admin/users');
                    } else if (result.type === 'failure') {
                        error = (result.data as { message?: string })?.message || 'Error al actualizar usuario';
                    }
                };
            }}
            class="p-6"
        >
            {#if error}
                <div class="mb-6 rounded-lg bg-red-50 p-4 text-sm text-red-800 dark:bg-red-900/50 dark:text-red-400">
                    {error}
                </div>
            {/if}

            <!-- Avatar Section -->
			<div class="mb-8">
				<input type="hidden" name="removeImage" value={removeImage ? 'true' : 'false'} />
				<ImageUpload
					currentImage={data.user.image}
					onchange={handleImageChange}
					onremove={handleImageRemove}
					size="lg"
				/>
			</div>

            <!-- Form Fields -->
            <div class="space-y-5">
                <Label class="space-y-2">
                    <span class="flex items-center gap-2 text-gray-700 dark:text-gray-300">
                        <Mail class="h-4 w-4" />
                        Correo electrónico
                    </span>
                    <Input
                        type="email"
                        name="email"
                        value={data.user.email}
                        placeholder="usuario@ejemplo.com"
                        required
                        class="ps-10"
                    >
                        {#snippet left()}
                            <Mail class="h-5 w-5 text-gray-400" />
                        {/snippet}
                    </Input>
                </Label>

                <Label class="space-y-2">
                    <span class="flex items-center gap-2 text-gray-700 dark:text-gray-300">
                        <User class="h-4 w-4" />
                        Nombre de usuario
                    </span>
                    <Input
                        type="text"
                        name="username"
                        value={data.user.username || ''}
                        placeholder="Nombre de usuario"
                        class="ps-10"
                    >
                        {#snippet left()}
                            <User class="h-5 w-5 text-gray-400" />
                        {/snippet}
                    </Input>
                </Label>

                <Label class="space-y-2">
                    <span class="flex items-center gap-2 text-gray-700 dark:text-gray-300">
                        <Lock class="h-4 w-4" />
                        Nueva contraseña
                    </span>
                    <Input
                        type="password"
                        name="password"
                        placeholder="••••••••"
                        class="ps-10"
                    >
                        {#snippet left()}
                            <Lock class="h-5 w-5 text-gray-400" />
                        {/snippet}
                    </Input>
                    <Helper class="text-xs">Dejar en blanco para mantener la contraseña actual</Helper>
                </Label>
            </div>

            <!-- Actions -->
            <div class="mt-8 flex items-center justify-end gap-3 border-t border-gray-200 pt-6 dark:border-gray-700">
                <Button color="alternative" href="/admin/users" disabled={loading}>
                    Cancelar
                </Button>
                <Button type="submit" color="primary" disabled={loading} class="flex items-center gap-2">
                    {#if loading}
                        <svg class="h-4 w-4 animate-spin" viewBox="0 0 24 24">
                            <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4" fill="none"></circle>
                            <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                        </svg>
                        Guardando...
                    {:else}
                        <Save class="h-4 w-4" />
                        Guardar cambios
                    {/if}
                </Button>
            </div>
        </form>
    </div>

    <!-- User Info Card -->
    <div class="mt-6 rounded-xl border border-gray-200 bg-gray-50 p-4 dark:border-gray-700 dark:bg-gray-800/50">
        <div class="flex items-center gap-3">
            <div class="flex h-10 w-10 items-center justify-center rounded-lg bg-gray-200 dark:bg-gray-700">
                <User class="h-5 w-5 text-gray-500 dark:text-gray-400" />
            </div>
            <div class="flex-1">
                <p class="text-sm font-medium text-gray-900 dark:text-white">ID del usuario</p>
                <p class="font-mono text-xs text-gray-500 dark:text-gray-400">{data.user.id}</p>
            </div>
        </div>
    </div>

    <!-- Roles Management Card -->
    {#if data.canManageRoles}
        <div class="mt-6 rounded-2xl border border-gray-200 bg-white shadow-sm dark:border-gray-700 dark:bg-gray-800">
            <div class="border-b border-gray-200 p-6 dark:border-gray-700">
                <div class="flex items-center gap-3">
                    <div class="flex h-10 w-10 items-center justify-center rounded-lg bg-purple-100 dark:bg-purple-900">
                        <Crown class="h-5 w-5 text-purple-600 dark:text-purple-400" />
                    </div>
                    <div>
                        <h2 class="text-lg font-semibold text-gray-900 dark:text-white">Gestión de Roles</h2>
                        <p class="text-sm text-gray-500 dark:text-gray-400">Asigna o revoca roles del usuario</p>
                    </div>
                </div>
            </div>
            
            <form
                method="POST"
                action="?/updateRoles"
                use:enhance={() => {
                    rolesLoading = true;
                    rolesError = '';
                    rolesSuccess = false;
                    
                    return async ({ result }) => {
                        rolesLoading = false;
                        if (result.type === 'success') {
                            rolesSuccess = true;
                            await invalidateAll();
                        } else if (result.type === 'failure') {
                            rolesError = (result.data as { message?: string })?.message || 'Error al actualizar roles';
                        }
                    };
                }}
                class="p-6"
            >
                <input type="hidden" name="selectedRoles" value={JSON.stringify(selectedRoleIds)} />
                
                {#if rolesError}
                    <div class="mb-4 rounded-lg bg-red-50 p-4 text-sm text-red-800 dark:bg-red-900/50 dark:text-red-400">
                        {rolesError}
                    </div>
                {/if}
                
                {#if rolesSuccess}
                    <div class="mb-4 rounded-lg bg-green-50 p-4 text-sm text-green-800 dark:bg-green-900/50 dark:text-green-400">
                        Roles actualizados correctamente
                    </div>
                {/if}

                <div class="space-y-3">
                    {#each data.availableRoles.sort((a, b) => b.level - a.level) as role (role.id)}
                        <div 
                            class="flex items-center justify-between rounded-lg border p-4 transition-colors {selectedRoleIds.includes(role.id) ? 'border-primary-500 bg-primary-50 dark:border-primary-600 dark:bg-primary-900/20' : 'border-gray-200 bg-white hover:bg-gray-50 dark:border-gray-700 dark:bg-gray-800 dark:hover:bg-gray-700'}"
                        >
                            <div class="flex items-center gap-3">
                                <Checkbox 
                                    checked={selectedRoleIds.includes(role.id)}
                                    onchange={() => toggleRole(role.id)}
                                    disabled={role.isSystem && role.level >= 100}
                                />
                                <div>
                                    <div class="flex items-center gap-2">
                                        <span class="font-medium text-gray-900 dark:text-white">{role.displayName}</span>
                                        <Badge color={getRoleBadgeColor(role.level)} class="text-xs">
                                            Nivel {role.level}
                                        </Badge>
                                        {#if role.isSystem}
                                            <Badge color="gray" class="text-xs">Sistema</Badge>
                                        {/if}
                                    </div>
                                    {#if role.description}
                                        <p class="text-sm text-gray-500 dark:text-gray-400">{role.description}</p>
                                    {/if}
                                </div>
                            </div>
                        </div>
                    {/each}
                </div>

                <div class="mt-6 flex items-center justify-end gap-3 border-t border-gray-200 pt-6 dark:border-gray-700">
                    <Button 
                        type="submit" 
                        color="purple" 
                        disabled={rolesLoading}
                        class="flex items-center gap-2"
                    >
                        {#if rolesLoading}
                            <svg class="h-4 w-4 animate-spin" viewBox="0 0 24 24">
                                <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4" fill="none"></circle>
                                <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                            </svg>
                            Guardando...
                        {:else}
                            <Users class="h-4 w-4" />
                            Guardar Roles
                        {/if}
                    </Button>
                </div>
            </form>
        </div>
    {:else}
        <div class="mt-6 rounded-xl border border-yellow-200 bg-yellow-50 p-4 dark:border-yellow-700 dark:bg-yellow-900/20">
            <div class="flex items-center gap-3">
                <Shield class="h-5 w-5 text-yellow-600 dark:text-yellow-400" />
                <p class="text-sm text-yellow-800 dark:text-yellow-300">
                    No tienes permisos para gestionar los roles de este usuario.
                </p>
            </div>
        </div>
    {/if}
</div>