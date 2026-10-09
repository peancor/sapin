<script lang="ts">
	import { resolve } from '$app/paths';
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

<div
	class="flex items-center justify-center bg-gray-50 transition-colors duration-200 dark:bg-gray-900"
>
	<div class="w-full max-w-md rounded-lg bg-white p-8 shadow-lg dark:bg-gray-800">
		<h1 class="mb-6 text-center text-2xl font-bold text-gray-900 dark:text-white">
			{m.login()}
		</h1>

		<form
			method="post"
			action="?/login"
			use:enhance={() => {
				isSubmitting = true;
				return async ({ update }) => {
					await update();
					isSubmitting = false;
					turnstileToken = '';
					turnstile?.reset();
				};
			}}
		>
			<div class="space-y-4">
				<div>
					<label for="email" class="mb-2 block text-gray-700 dark:text-gray-200">
						{m.email()}
					</label>
					<input
						id="email"
						type="email"
						name="identifier"
						required
						placeholder={m.enter_email()}
						class="w-full rounded-lg border border-gray-300 bg-white p-3
                               text-gray-900 transition-colors focus:border-transparent focus:ring-2
                               focus:ring-blue-500 dark:border-gray-600 dark:bg-gray-700
                               dark:text-white dark:focus:ring-blue-400"
					/>
				</div>

				<div>
					<label for="password" class="mb-2 block text-gray-700 dark:text-gray-200">
						{m.password()}
					</label>
					<input
						id="password"
						type="password"
						name="password"
						required
						class="w-full rounded-lg border border-gray-300 bg-white p-3
                               text-gray-900 transition-colors focus:border-transparent focus:ring-2
                               focus:ring-blue-500 dark:border-gray-600 dark:bg-gray-700
                               dark:text-white dark:focus:ring-blue-400"
					/>
				</div>

				{#if data.turnstileSiteKey}
					<Turnstile
						bind:this={turnstile}
						siteKey={data.turnstileSiteKey}
						theme="auto"
						onVerify={handleTurnstileVerify}
						onExpire={() => (turnstileToken = '')}
					/>
				{/if}

				<button
					type="submit"
					disabled={isSubmitting || (!!data.turnstileSiteKey && !turnstileToken)}
					class="w-full rounded-lg bg-blue-600 p-3 font-medium
                           text-white transition-colors
                           hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-50
                           dark:bg-blue-500 dark:hover:bg-blue-600"
				>
					{m.login()}
				</button>
			</div>
		</form>

		<div class="mt-4 text-center">
			<a href={resolve('/register')} class="text-blue-600 hover:underline dark:text-blue-400">
				{m.have_invite_code_register()}
			</a>
		</div>

		{#if form?.message}
			<p class="mt-4 text-center text-sm text-red-600 dark:text-red-400">
				{form.message}
			</p>
		{/if}
	</div>
</div>
