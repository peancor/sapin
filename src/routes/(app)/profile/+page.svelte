<script lang="ts">
    import type { ActionData, PageData } from './$types';
    import { enhance } from '$app/forms';
    import { Card, Button, Label, Input, Alert, Avatar, Badge, Helper, Heading, P, Tooltip } from 'flowbite-svelte';
    import { Camera, Trash2, User, Lock, Mail, UserCircle, GraduationCap, Sparkles, Shield } from 'lucide-svelte';
    import { invalidateAll } from '$app/navigation';

    function getRoleDisplayName(role: string): string {
        switch (role) {
            case 'super_admin': return 'Super Administrador';
            case 'admin': return 'Administrador';
            case 'teacher': return 'Profesor';
            case 'assistant': return 'Asistente';
            case 'student': return 'Estudiante';
            default: return 'Usuario';
        }
    }

    function getRoleBadgeColor(role: string): 'red' | 'purple' | 'blue' | 'yellow' | 'green' {
        switch (role) {
            case 'super_admin': return 'red';
            case 'admin': return 'purple';
            case 'teacher': return 'blue';
            case 'assistant': return 'yellow';
            default: return 'green';
        }
    }

    function getRoleBadgeColorByLevel(level: number): 'red' | 'purple' | 'blue' | 'yellow' | 'green' {
        if (level >= 100) return 'red';
        if (level >= 90) return 'purple';
        if (level >= 50) return 'blue';
        if (level >= 40) return 'yellow';
        return 'green';
    }

    let { data, form }: { data: PageData; form: ActionData } = $props();
    
    // Estado local para campos de perfil
    let username = $derived(data.user.username || '');
    let alias = $derived(data.user.alias || '');
    let age = $derived(data.user.age?.toString() || '');
    
    // Estado para cambio de contraseña
    let currentPassword = $state('');
    let password = $state('');
    let confirmPassword = $state('');
    
    // Estado de UI
    let success = $state(false);
    let successMessage = $state('');
    let passwordError = $state('');

    const passwordMatch = $derived(password === confirmPassword || confirmPassword === '');
    const canSubmitPassword = $derived(
        currentPassword.length > 0 && 
        password.length >= 6 && 
        passwordMatch && 
        confirmPassword !== ''
    );

    // Sincronizar estado local cuando cambian los datos del servidor
    $effect(() => {
        username = data.user.username || '';
        alias = data.user.alias || '';
        age = data.user.age?.toString() || '';
    });

    function handleProfileSuccess() {
        return () => {
            return async () => {
                successMessage = 'Perfil actualizado correctamente';
                success = true;
                setTimeout(() => success = false, 3000);
                await invalidateAll();
            };
        };
    }

    function handlePasswordSuccess() {
        return () => {
            return async ({ result }: { result: { type: string; data?: { success?: boolean; error?: string } } }) => {
                if (result.type === 'success' && result.data?.success) {
                    successMessage = 'Contraseña actualizada correctamente';
                    success = true;
                    setTimeout(() => success = false, 3000);
                    currentPassword = '';
                    password = '';
                    confirmPassword = '';
                    passwordError = '';
                } else if (result.type === 'success' && result.data?.error) {
                    passwordError = result.data.error;
                }
                await invalidateAll();
            };
        };
    }

    function handleAvatarSuccess(message: string) {
        return () => {
            return async () => {
                successMessage = message;
                success = true;
                setTimeout(() => success = false, 3000);
                await invalidateAll();
            };
        };
    }
</script>

<div class="max-w-4xl mx-auto p-6">
    <Heading tag="h1" class="mb-2">Configuración de Perfil</Heading>
    <P class="mb-8 text-gray-500 dark:text-gray-400">Gestiona tu información personal y preferencias de cuenta</P>

    {#if success}
        <Alert color="green" class="mb-6" dismissable>
            <span class="font-medium">¡Éxito!</span> {successMessage}
        </Alert>
    {/if}

    <div class="space-y-6">
        <!-- Avatar Section -->
        <Card size="xl" class="relative">
            <div class="flex flex-col sm:flex-row items-center gap-6">
                <div class="relative group">
                    <Avatar 
                        src={data.user.image || undefined} 
                        size="xl" 
                        class="ring-4 ring-gray-100 dark:ring-gray-700"
                    >
                        {#if !data.user.image}
                            <UserCircle class="w-full h-full text-gray-400" />
                        {/if}
                    </Avatar>
                    
                    <div class="absolute -bottom-2 left-1/2 -translate-x-1/2 flex gap-1">
                        <form action="?/updateAvatar" method="POST" enctype="multipart/form-data" use:enhance={handleAvatarSuccess('Avatar actualizado correctamente')}>
                            <label 
                                for="avatar" 
                                class="flex items-center justify-center w-8 h-8 bg-primary-600 hover:bg-primary-700 rounded-full cursor-pointer transition-colors shadow-lg"
                            >
                                <Camera class="w-4 h-4 text-white" />
                                <input
                                    type="file"
                                    id="avatar"
                                    name="avatar"
                                    class="hidden"
                                    accept="image/*"
                                    onchange={(e) => e.currentTarget.form?.requestSubmit()}
                                />
                            </label>
                            <Tooltip>Cambiar avatar</Tooltip>
                        </form>
                        
                        {#if data.user.image}
                            <form action="?/deleteAvatar" method="POST" use:enhance={handleAvatarSuccess('Avatar eliminado correctamente')}>
                                <button 
                                    type="submit"
                                    class="flex items-center justify-center w-8 h-8 bg-red-600 hover:bg-red-700 rounded-full cursor-pointer transition-colors shadow-lg"
                                >
                                    <Trash2 class="w-4 h-4 text-white" />
                                </button>
                                <Tooltip>Eliminar avatar</Tooltip>
                            </form>
                        {/if}
                    </div>
                </div>
                
                <div class="text-center sm:text-left flex-1">
                    <Heading tag="h3" class="mb-1">{data.user.username || 'Sin nombre de usuario'}</Heading>
                    <P class="text-gray-500 dark:text-gray-400 flex items-center justify-center sm:justify-start gap-2 mb-3">
                        <Mail class="w-4 h-4" />
                        {data.user.email}
                    </P>
                    <div class="flex flex-wrap gap-2 justify-center sm:justify-start">
                        {#if data.roles && data.roles.length > 0}
                            {#each data.roles.sort((a, b) => b.level - a.level) as r (r.id)}
                                <Badge color={getRoleBadgeColorByLevel(r.level)} class="text-sm">
                                    <GraduationCap class="w-3 h-3 me-1" />
                                    {r.displayName}
                                </Badge>
                            {/each}
                        {:else}
                            <Badge color="green" class="text-sm">
                                <GraduationCap class="w-3 h-3 me-1" />
                                Usuario
                            </Badge>
                        {/if}
                    </div>
                </div>
            </div>
        </Card>

        <div class="grid gap-6 lg:grid-cols-2">
            <!-- Personal Information -->
            <Card class="p-4">
                <div class="flex items-center gap-2 mb-6">
                    <User class="w-5 h-5 text-primary-600" />
                    <Heading tag="h4">Información Personal</Heading>
                </div>
                
                <form action="?/updateProfile" method="POST" use:enhance={handleProfileSuccess()} class="space-y-4">
                    <div>
                        <Label for="username" class="mb-2">Nombre de usuario</Label>
                        <Input 
                            id="username" 
                            name="username" 
                            bind:value={username}
                            placeholder="Tu nombre de usuario"
                            required 
                        />
                    </div>
                    
                    <div>
                        <Label for="alias" class="mb-2">Alias</Label>
                        <Input 
                            id="alias" 
                            name="alias" 
                            bind:value={alias}
                            placeholder="Un alias alternativo (opcional)"
                        />
                        <Helper class="mt-1">Se mostrará en lugar de tu nombre de usuario si lo prefieres</Helper>
                    </div>
                    
                    <div>
                        <Label for="age" class="mb-2">Edad</Label>
                        <Input 
                            type="number" 
                            id="age" 
                            name="age" 
                            bind:value={age}
                            placeholder="Tu edad"
                            min="0" 
                            max="120" 
                        />
                    </div>
                    
                    <Button type="submit" class="w-full">
                        Guardar Cambios
                    </Button>
                </form>
            </Card>

            <!-- Change Password -->
            <Card class="p-4">
                <div class="flex items-center gap-2 mb-6">
                    <Lock class="w-5 h-5 text-primary-600" />
                    <Heading tag="h4">Cambiar Contraseña</Heading>
                </div>
                
                {#if passwordError}
                    <Alert color="red" class="mb-4" dismissable onclick={() => passwordError = ''}>
                        <span class="font-medium">Error:</span> {passwordError}
                    </Alert>
                {/if}
                
                <form action="?/updatePassword" method="POST" use:enhance={handlePasswordSuccess()} class="space-y-4">
                    <div>
                        <Label for="currentPassword" class="mb-2">Contraseña Actual</Label>
                        <Input
                            type="password"
                            id="currentPassword"
                            name="currentPassword"
                            bind:value={currentPassword}
                            placeholder="Tu contraseña actual"
                            required
                        />
                    </div>
                    
                    <div>
                        <Label for="password" class="mb-2">Nueva Contraseña</Label>
                        <Input
                            type="password"
                            id="password"
                            name="password"
                            bind:value={password}
                            placeholder="Mínimo 6 caracteres"
                            required
                        />
                        {#if password && password.length < 6}
                            <Helper class="mt-1" color="red">La contraseña debe tener al menos 6 caracteres</Helper>
                        {/if}
                    </div>
                    
                    <div>
                        <Label for="confirmPassword" class="mb-2">Confirmar Contraseña</Label>
                        <Input
                            type="password"
                            id="confirmPassword"
                            bind:value={confirmPassword}
                            placeholder="Repite la contraseña"
                            color={!passwordMatch ? 'red' : 'green'}
                            required
                        />
                        {#if !passwordMatch}
                            <Helper class="mt-1" color="red">Las contraseñas no coinciden</Helper>
                        {/if}
                    </div>
                    
                    <Button 
                        type="submit" 
                        color="dark"
                        class="w-full" 
                        disabled={!canSubmitPassword}
                    >
                        Actualizar Contraseña
                    </Button>
                </form>
            </Card>
        </div>
    </div>
</div>