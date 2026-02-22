<script lang="ts">
    import type { PageData, ActionData } from './$types';
    import { enhance } from '$app/forms';
    import { fade, fly, scale } from 'svelte/transition';
    import { 
        Input, 
        Label, 
        Button, 
        Helper, 
        Alert, 
        Progressbar,
        Spinner
    } from 'flowbite-svelte';
    import { 
        Shield, 
        User, 
        Mail, 
        Lock, 
        CheckCircle, 
        XCircle, 
        AlertTriangle,
        Eye,
        EyeOff,
        Info
    } from 'lucide-svelte';

    let { data, form }: { data: PageData; form: ActionData } = $props();

    // Estado del formulario
    let username = $state('');
    let email = $state('');
    let password = $state('');
    let confirmPassword = $state('');
    let showPassword = $state(false);
    let showConfirmPassword = $state(false);
    let isSubmitting = $state(false);

    // Validaciones en tiempo real
    let usernameValid = $derived.by(() => {
        if (!username) return null;
        if (username.length < 3) return { valid: false, message: 'Mínimo 3 caracteres' };
        if (username.length > 50) return { valid: false, message: 'Máximo 50 caracteres' };
        if (!/^[a-zA-Z0-9_-]+$/.test(username)) return { valid: false, message: 'Solo letras, números, guiones' };
        return { valid: true, message: 'Nombre de usuario válido' };
    });

    let emailValid = $derived.by(() => {
        if (!email) return null;
        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        if (!emailRegex.test(email)) return { valid: false, message: 'Email inválido' };
        if (email.length > 255) return { valid: false, message: 'Email muy largo' };
        return { valid: true, message: 'Email válido' };
    });

    // Validación de contraseña con indicadores de fortaleza
    let passwordChecks = $derived.by(() => {
        return {
            length: password.length >= 12,
            lowercase: /[a-z]/.test(password),
            uppercase: /[A-Z]/.test(password),
            number: /[0-9]/.test(password),
            special: /[!@#$%^&*()_+\-=\[\]{};':"\\|,.<>\/?]/.test(password),
            noCommonPatterns: !/(password|admin|qwerty|letmein|^(.)\1+$)/i.test(password)
        };
    });

    let passwordStrength = $derived.by(() => {
        if (!password) return { score: 0, label: '', color: 'gray' };
        
        const checks = passwordChecks;
        let score = 0;
        if (checks.length) score += password.length >= 16 ? 2 : 1;
        if (checks.lowercase) score += 1;
        if (checks.uppercase) score += 1;
        if (checks.number) score += 1;
        if (checks.special) score += 1;
        if (!checks.noCommonPatterns) score = Math.max(0, score - 2);

        if (score >= 5) return { score: 100, label: 'Fuerte', color: 'green' };
        if (score >= 3) return { score: 60, label: 'Media', color: 'yellow' };
        return { score: 30, label: 'Débil', color: 'red' };
    });

    let passwordsMatch = $derived(
        confirmPassword.length > 0 && password === confirmPassword
    );

    let passwordMismatch = $derived(
        confirmPassword.length > 0 && password !== confirmPassword
    );

    let canSubmit = $derived(
        usernameValid?.valid && 
        emailValid?.valid && 
        passwordStrength.score >= 60 && 
        passwordsMatch &&
        !isSubmitting
    );

    function handleSubmit() {
        isSubmitting = true;
        return async ({ result, update }: { result: any; update: () => Promise<void> }) => {
            isSubmitting = false;
            await update();
        };
    }
</script>

<svelte:head>
    <title>Configuración Inicial - Sistema</title>
</svelte:head>

<div class="min-h-screen flex items-center justify-center bg-linear-to-br from-gray-50 to-gray-100 dark:from-gray-900 dark:to-gray-800 p-4">
    {#if data.hasUsers}
        <!-- Sistema ya inicializado -->
        <div class="w-full max-w-md" transition:fade>
            <Alert color="red" class="shadow-lg">
                <div class="flex items-center gap-3">
                    <Shield class="w-6 h-6" />
                    <div>
                        <h3 class="font-semibold">Sistema ya inicializado</h3>
                        <p class="text-sm mt-1">
                            El sistema ya cuenta con usuarios registrados. 
                            Esta página solo está disponible durante la configuración inicial.
                        </p>
                    </div>
                </div>
                <div class="mt-4">
                    <Button href="/login" color="red" outline size="sm">
                        Ir al inicio de sesión
                    </Button>
                </div>
            </Alert>
        </div>
    {:else}
        <!-- Formulario de configuración inicial -->
        <div class="w-full max-w-lg" transition:fly={{ y: 20, duration: 600 }}>
            <!-- Header -->
            <div class="text-center mb-8">
                <div class="inline-flex items-center justify-center w-16 h-16 rounded-full bg-primary-100 dark:bg-primary-900/50 mb-4" transition:scale={{ delay: 200 }}>
                    <Shield class="w-8 h-8 text-primary-600 dark:text-primary-400" />
                </div>
                <h1 class="text-3xl font-bold text-gray-900 dark:text-white">
                    Configuración Inicial
                </h1>
                <p class="mt-2 text-gray-600 dark:text-gray-400">
                    Crea la cuenta de administrador principal del sistema
                </p>
            </div>

            <!-- Info Alert -->
            <Alert color="blue" class="mb-6">
                <div class="flex gap-2">
                    <Info class="w-5 h-5 shrink-0 mt-0.5" />
                    <div class="text-sm">
                        <p class="font-medium">Primera configuración del sistema</p>
                        <p class="mt-1 opacity-90">
                            Esta cuenta tendrá privilegios de Super Administrador. 
                            Asegúrate de usar una contraseña fuerte y guardarla en un lugar seguro.
                        </p>
                    </div>
                </div>
            </Alert>

            <!-- Formulario -->
            <div class="bg-white dark:bg-gray-800 rounded-2xl shadow-xl border border-gray-200 dark:border-gray-700 p-8">
                {#if form?.error}
                    <Alert color="red" class="mb-6" dismissable>
                        <div class="flex items-center gap-2">
                            <XCircle class="w-5 h-5" />
                            <span>{form.error}</span>
                        </div>
                        {#if 'errors' in form && Array.isArray(form.errors)}
                            <ul class="mt-2 text-sm list-disc list-inside">
                                {#each form.errors as formError, i (i)}
                                    <li>{formError}</li>
                                {/each}
                            </ul>
                        {/if}
                    </Alert>
                {/if}

                <form method="POST" use:enhance={handleSubmit} class="space-y-5">
                    <!-- Username -->
                    <div>
                        <Label for="username" class="mb-2 flex items-center gap-2">
                            <User class="w-4 h-4" />
                            Nombre de usuario
                        </Label>
                        <Input 
                            id="username"
                            name="username" 
                            type="text"
                            placeholder="admin"
                            autocomplete="username"
                            required
                            bind:value={username}
                            color={usernameValid === null ? undefined : usernameValid.valid ? 'green' : 'red'}
                        />
                        {#if usernameValid}
                            <Helper class="mt-1" color={usernameValid.valid ? 'green' : 'red'}>
                                <span class="flex items-center gap-1">
                                    {#if usernameValid.valid}
                                        <CheckCircle class="w-3 h-3" />
                                    {:else}
                                        <XCircle class="w-3 h-3" />
                                    {/if}
                                    {usernameValid.message}
                                </span>
                            </Helper>
                        {/if}
                    </div>

                    <!-- Email -->
                    <div>
                        <Label for="email" class="mb-2 flex items-center gap-2">
                            <Mail class="w-4 h-4" />
                            Correo electrónico
                        </Label>
                        <Input 
                            id="email"
                            name="email" 
                            type="email"
                            placeholder="admin@tudominio.com"
                            autocomplete="email"
                            required
                            bind:value={email}
                            color={emailValid === null ? undefined : emailValid.valid ? 'green' : 'red'}
                        />
                        {#if emailValid}
                            <Helper class="mt-1" color={emailValid.valid ? 'green' : 'red'}>
                                <span class="flex items-center gap-1">
                                    {#if emailValid.valid}
                                        <CheckCircle class="w-3 h-3" />
                                    {:else}
                                        <XCircle class="w-3 h-3" />
                                    {/if}
                                    {emailValid.message}
                                </span>
                            </Helper>
                        {/if}
                    </div>

                    <!-- Password -->
                    <div>
                        <Label for="password" class="mb-2 flex items-center gap-2">
                            <Lock class="w-4 h-4" />
                            Contraseña
                        </Label>
                        <div class="relative">
                            <Input 
                                id="password"
                                name="password" 
                                type={showPassword ? 'text' : 'password'}
                                placeholder="••••••••••••"
                                autocomplete="new-password"
                                required
                                bind:value={password}
                                class="pr-10"
                            />
                            <button 
                                type="button"
                                class="absolute right-3 top-1/2 -translate-y-1/2 text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200"
                                onclick={() => showPassword = !showPassword}
                            >
                                {#if showPassword}
                                    <EyeOff class="w-5 h-5" />
                                {:else}
                                    <Eye class="w-5 h-5" />
                                {/if}
                            </button>
                        </div>

                        <!-- Password strength indicator -->
                        {#if password}
                            <div class="mt-3 space-y-2" transition:fade={{ duration: 200 }}>
                                <div class="flex items-center justify-between text-sm">
                                    <span class="text-gray-600 dark:text-gray-400">Fortaleza:</span>
                                    <span class="font-medium" class:text-red-500={passwordStrength.color === 'red'} 
                                          class:text-yellow-500={passwordStrength.color === 'yellow'}
                                          class:text-green-500={passwordStrength.color === 'green'}>
                                        {passwordStrength.label}
                                    </span>
                                </div>
                                <Progressbar 
                                    progress={passwordStrength.score} 
                                    color={passwordStrength.color as 'red' | 'yellow' | 'green'}
                                    size="h-2"
                                />
                                
                                <!-- Checklist de requisitos -->
                                <div class="grid grid-cols-2 gap-1 text-xs mt-2">
                                    <div class="flex items-center gap-1" class:text-green-600={passwordChecks.length} class:text-gray-400={!passwordChecks.length}>
                                        {#if passwordChecks.length}<CheckCircle class="w-3 h-3" />{:else}<XCircle class="w-3 h-3" />{/if}
                                        12+ caracteres
                                    </div>
                                    <div class="flex items-center gap-1" class:text-green-600={passwordChecks.lowercase} class:text-gray-400={!passwordChecks.lowercase}>
                                        {#if passwordChecks.lowercase}<CheckCircle class="w-3 h-3" />{:else}<XCircle class="w-3 h-3" />{/if}
                                        Minúscula
                                    </div>
                                    <div class="flex items-center gap-1" class:text-green-600={passwordChecks.uppercase} class:text-gray-400={!passwordChecks.uppercase}>
                                        {#if passwordChecks.uppercase}<CheckCircle class="w-3 h-3" />{:else}<XCircle class="w-3 h-3" />{/if}
                                        Mayúscula
                                    </div>
                                    <div class="flex items-center gap-1" class:text-green-600={passwordChecks.number} class:text-gray-400={!passwordChecks.number}>
                                        {#if passwordChecks.number}<CheckCircle class="w-3 h-3" />{:else}<XCircle class="w-3 h-3" />{/if}
                                        Número
                                    </div>
                                    <div class="flex items-center gap-1" class:text-green-600={passwordChecks.special} class:text-gray-400={!passwordChecks.special}>
                                        {#if passwordChecks.special}<CheckCircle class="w-3 h-3" />{:else}<XCircle class="w-3 h-3" />{/if}
                                        Carácter especial
                                    </div>
                                    <div class="flex items-center gap-1" class:text-green-600={passwordChecks.noCommonPatterns} class:text-gray-400={!passwordChecks.noCommonPatterns}>
                                        {#if passwordChecks.noCommonPatterns}<CheckCircle class="w-3 h-3" />{:else}<XCircle class="w-3 h-3" />{/if}
                                        Sin patrones comunes
                                    </div>
                                </div>
                            </div>
                        {/if}
                    </div>

                    <!-- Confirm Password -->
                    <div>
                        <Label for="confirmPassword" class="mb-2 flex items-center gap-2">
                            <Lock class="w-4 h-4" />
                            Confirmar contraseña
                        </Label>
                        <div class="relative">
                            <Input 
                                id="confirmPassword"
                                name="confirmPassword" 
                                type={showConfirmPassword ? 'text' : 'password'}
                                placeholder="••••••••••••"
                                autocomplete="new-password"
                                required
                                bind:value={confirmPassword}
                                color={confirmPassword.length === 0 ? undefined : passwordsMatch ? 'green' : 'red'}
                                class="pr-10"
                            />
                            <button 
                                type="button"
                                class="absolute right-3 top-1/2 -translate-y-1/2 text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200"
                                onclick={() => showConfirmPassword = !showConfirmPassword}
                            >
                                {#if showConfirmPassword}
                                    <EyeOff class="w-5 h-5" />
                                {:else}
                                    <Eye class="w-5 h-5" />
                                {/if}
                            </button>
                        </div>
                        {#if confirmPassword}
                            <Helper class="mt-1" color={passwordsMatch ? 'green' : 'red'}>
                                <span class="flex items-center gap-1">
                                    {#if passwordsMatch}
                                        <CheckCircle class="w-3 h-3" />
                                        Las contraseñas coinciden
                                    {:else}
                                        <XCircle class="w-3 h-3" />
                                        Las contraseñas no coinciden
                                    {/if}
                                </span>
                            </Helper>
                        {/if}
                    </div>

                    <!-- Submit Button -->
                    <div class="pt-4">
                        <Button 
                            type="submit" 
                            color="primary" 
                            class="w-full"
                            disabled={!canSubmit}
                        >
                            {#if isSubmitting}
                                <Spinner size="4" class="mr-2" />
                                Creando cuenta...
                            {:else}
                                <Shield class="w-5 h-5 mr-2" />
                                Crear cuenta de administrador
                            {/if}
                        </Button>
                    </div>
                </form>

                <!-- Security notice -->
                <div class="mt-6 pt-6 border-t border-gray-200 dark:border-gray-700">
                    <div class="flex items-start gap-2 text-xs text-gray-500 dark:text-gray-400">
                        <AlertTriangle class="w-4 h-4 shrink-0 mt-0.5" />
                        <p>
                            Esta página solo está disponible cuando no hay usuarios en el sistema.
                            Después de crear el administrador, esta página quedará deshabilitada permanentemente.
                        </p>
                    </div>
                </div>
            </div>

            <!-- Footer -->
            <p class="text-center text-sm text-gray-500 dark:text-gray-400 mt-6">
                Conexión segura • Los datos se transmiten cifrados
            </p>
        </div>
    {/if}
</div>