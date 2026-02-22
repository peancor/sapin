<script lang="ts">
    import { enhance } from '$app/forms';
    import type { ActionData, PageData } from './$types';    
    import { m } from '$lib/paraglide/messages.js';
    import Turnstile from '$lib/components/Turnstile.svelte';

    let { form, data }: { form: ActionData; data: PageData } = $props();
    
    let turnstileToken = $state('');
    let isSubmitting = $state(false);
    let turnstile: Turnstile | undefined = $state();
    
    function handleTurnstileVerify(token: string) {
        turnstileToken = token;
    }
</script>

<div class="flex justify-center items-center bg-gray-50 dark:bg-gray-900 transition-colors duration-200">
    <div class="w-full max-w-md bg-white dark:bg-gray-800 p-8 rounded-lg shadow-lg">
        <h1 class="text-2xl font-bold text-center text-gray-900 dark:text-white mb-6">
            {m.login()}
        </h1>

        <form method="post" action="?/login" use:enhance={() => {
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
                    <label for="email" class="block text-gray-700 dark:text-gray-200 mb-2">
                        {m.email()}
                    </label>
                    <input 
                        id="email"
                        type="email" 
                        name="identifier" 
                        required 
                        placeholder={m.enter_email()}
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
                    {m.login()}
                </button>
            </div>
        </form>

        <div class="mt-4 text-center">
            <a href="/register" 
               class="text-blue-600 dark:text-blue-400 hover:underline">
                {m.have_invite_code_register()}
            </a>
        </div>

        {#if form?.message}
            <p class="mt-4 text-red-600 dark:text-red-400 text-center text-sm">
                {form.message}
            </p>
        {/if}
    </div>
</div>
