<script lang="ts">
    import { enhance } from '$app/forms';
    import type { ActionData, PageData } from './$types';
    import { m } from '$lib/paraglide/messages.js';
    import Turnstile from '$lib/components/Turnstile.svelte';
    import { BookOpen, UserPlus, Shield, Globe } from 'lucide-svelte';

    let { form, data }: { form: ActionData; data: PageData } = $props();
    
    let turnstileToken = $state('');
    let isSubmitting = $state(false);
    let turnstile: Turnstile | undefined = $state();
    let inviteCodeValue = $state(data.inviteCode || '');
    
    function handleTurnstileVerify(token: string) {
        turnstileToken = token;
    }

    function getInviteTypeIcon(type: string) {
        switch (type) {
            case 'course_student': return BookOpen;
            case 'course_role': return BookOpen;
            case 'system_role': return Shield;
            case 'open_registration': return Globe;
            default: return UserPlus;
        }
    }

    function getInviteTypeLabel(type: string): string {
        switch (type) {
            case 'course_student': return 'Matriculación en curso';
            case 'course_role': return 'Invitación a curso';
            case 'system_role': return 'Invitación de rol';
            case 'open_registration': return 'Registro abierto';
            default: return 'Invitación';
        }
    }
</script>

<div class="flex justify-center items-center bg-gray-50 dark:bg-gray-900 transition-colors duration-200">
    <div class="w-full max-w-md bg-white dark:bg-gray-800 p-8 rounded-lg shadow-lg">
        <h1 class="text-2xl font-bold text-center text-gray-900 dark:text-white mb-6">
            {m.register()}
        </h1>

        <!-- Invite Info Banner -->
        {#if data.inviteInfo?.isValid}
            {@const InviteIcon = getInviteTypeIcon(data.inviteInfo.type)}
            <div class="mb-6 rounded-lg border border-green-200 bg-green-50 p-4 dark:border-green-800 dark:bg-green-900/30">
                <div class="flex items-start gap-3">
                    <div class="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full bg-green-100 dark:bg-green-800">
                        <InviteIcon class="h-4 w-4 text-green-600 dark:text-green-400" />
                    </div>
                    <div>
                        <p class="text-sm font-medium text-green-800 dark:text-green-200">
                            {getInviteTypeLabel(data.inviteInfo.type)}
                        </p>
                        {#if data.inviteInfo.courseName}
                            <p class="mt-1 text-sm text-green-700 dark:text-green-300">
                                Curso: <strong>{data.inviteInfo.courseName}</strong>
                            </p>
                        {/if}
                        {#if data.inviteInfo.welcomeMessage}
                            <p class="mt-1 text-sm text-green-600 dark:text-green-400">
                                {data.inviteInfo.welcomeMessage}
                            </p>
                        {/if}
                    </div>
                </div>
            </div>
        {:else if data.inviteCode && !data.inviteInfo}
            <div class="mb-6 rounded-lg border border-red-200 bg-red-50 p-4 dark:border-red-800 dark:bg-red-900/30">
                <p class="text-sm text-red-700 dark:text-red-300">
                    El código de invitación proporcionado no es válido o ha expirado.
                </p>
            </div>
        {/if}

        <form method="post" action="?/register" use:enhance={() => {
            isSubmitting = true;
            return async ({ update }) => {
                await update();
                isSubmitting = false;
                turnstileToken = '';
                turnstile?.reset();
            };
        }}>
            <div class="space-y-4">
                <div>
                    <label for="inviteCode" class="block text-gray-700 dark:text-gray-200 mb-2">
                        {m.invite_code()}
                    </label>
                    <input 
                        id="inviteCode"
                        type="text"
                        name="inviteCode"
                        bind:value={inviteCodeValue}
                        required
                        placeholder="XXXX-XXXX-XXXX-XXXX"
                        class="w-full p-3 rounded-lg border border-gray-300 dark:border-gray-600 
                               bg-white dark:bg-gray-700 text-gray-900 dark:text-white
                               focus:ring-2 focus:ring-blue-500 dark:focus:ring-blue-400 
                               focus:border-transparent transition-colors font-mono"
                    />
                </div>

                <div>
                    <label for="email" class="block text-gray-700 dark:text-gray-200 mb-2">
                        {m.email()}
                    </label>
                    <input 
                        id="email"
                        type="email" 
                        name="email" 
                        required
                        class="w-full p-3 rounded-lg border border-gray-300 dark:border-gray-600 
                               bg-white dark:bg-gray-700 text-gray-900 dark:text-white
                               focus:ring-2 focus:ring-blue-500 dark:focus:ring-blue-400 
                               focus:border-transparent transition-colors"
                    />
                </div>

                <div>
                    <label for="password" class="block text-gray-700 dark:text-gray-200 mb-2">
                        {m.password()}
                    </label>
                    <input 
                        id="password"
                        type="password" 
                        name="password" 
                        required
                        minlength="6"
                        class="w-full p-3 rounded-lg border border-gray-300 dark:border-gray-600 
                               bg-white dark:bg-gray-700 text-gray-900 dark:text-white
                               focus:ring-2 focus:ring-blue-500 dark:focus:ring-blue-400 
                               focus:border-transparent transition-colors"
                    />
                </div>

                {#if data.turnstileSiteKey}
                    <Turnstile
                        bind:this={turnstile}
                        siteKey={data.turnstileSiteKey}
                        theme="auto"
                        onVerify={handleTurnstileVerify}
                        onExpire={() => turnstileToken = ''}
                    />
                {/if}

                <button 
                    type="submit"
                    disabled={isSubmitting || (!!data.turnstileSiteKey && !turnstileToken)}
                    class="w-full p-3 rounded-lg bg-blue-600 hover:bg-blue-700 
                           dark:bg-blue-500 dark:hover:bg-blue-600
                           text-white font-medium transition-colors
                           disabled:opacity-50 disabled:cursor-not-allowed"
                >
                    {m.register()}
                </button>
            </div>
        </form>

        <div class="mt-4 text-center">
            <a href="/login" 
               class="text-blue-600 dark:text-blue-400 hover:underline">
                {m.already_have_account()}
            </a>
        </div>

        {#if form?.message}
            <p class="mt-4 text-red-600 dark:text-red-400 text-center text-sm">
                {form.message}
            </p>
        {/if}
    </div>
</div>
