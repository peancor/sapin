<script lang="ts">
	import { MessageSquare, Send, CheckCircle, AlertCircle, ArrowLeft } from 'lucide-svelte';
	import { Button, Input, Textarea, Label, Alert } from 'flowbite-svelte';
	import { enhance } from '$app/forms';
	import type { ActionData, PageData } from './$types';
	import Turnstile from '$lib/components/Turnstile.svelte';

	let { form, data }: { form: ActionData; data: PageData } = $props();

	let isSubmitting = $state(false);
	let name = $state('');
	let email = $state('');
	let message = $state('');
	let turnstile = $state<Turnstile>();
	let turnstileToken = $state('');

	function handleTurnstileVerify(token: string) {
		turnstileToken = token;
	}

	function handleTurnstileExpire() {
		turnstileToken = '';
	}

	// Reset form values when form data changes (errors with prefilled data)
	$effect(() => {
		if (form?.name) name = form.name;
		if (form?.email) email = form.email;
		if (form?.message) message = form.message;
	});
</script>

<svelte:head>
	<title>Contacto | SAPIN</title>
	<meta
		name="description"
		content="Contacta con el equipo de SAPIN para resolver dudas o colaborar."
	/>
</svelte:head>

<div
	class="min-h-screen bg-gradient-to-b from-slate-50 to-white dark:from-gray-900 dark:to-gray-900"
>
	<div class="container mx-auto px-4 py-12 md:py-16">
		<div class="mx-auto max-w-xl">
			<!-- Back link -->
			<a
				href="/"
				class="mb-8 inline-flex items-center gap-2 text-sm text-slate-500 transition-colors hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-200"
			>
				<ArrowLeft class="h-4 w-4" />
				Volver al inicio
			</a>

			<!-- Header -->
			<div class="mb-8 text-center">
				<div
					class="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-indigo-100 dark:bg-indigo-900/40"
				>
					<MessageSquare class="h-7 w-7 text-indigo-600 dark:text-indigo-400" />
				</div>
				<h1 class="mb-2 text-3xl font-bold text-slate-900 dark:text-white">Contacto</h1>
				<p class="text-slate-600 dark:text-slate-400">
					¿Tienes alguna pregunta o sugerencia? Escríbenos.
				</p>
			</div>

			<!-- Success message -->
			{#if form?.success}
				<div
					class="rounded-2xl border border-slate-200 bg-white p-8 text-center shadow-sm dark:border-slate-700 dark:bg-slate-800"
				>
					<div
						class="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-green-100 dark:bg-green-900/40"
					>
						<CheckCircle class="h-8 w-8 text-green-600 dark:text-green-400" />
					</div>
					<h2 class="mb-2 text-xl font-semibold text-slate-900 dark:text-white">
						¡Mensaje enviado!
					</h2>
					<p class="mb-6 text-slate-600 dark:text-slate-400">
						{form.message}
					</p>
					<Button href="/" color="light">Volver al inicio</Button>
				</div>
			{:else}
				<!-- Form -->
				<div
					class="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm md:p-8 dark:border-slate-700 dark:bg-slate-800"
				>
					{#if form?.error}
						<Alert color="red" class="mb-6">
							{#snippet icon()}
								<AlertCircle class="h-5 w-5" />
							{/snippet}
							{form.error}
						</Alert>
					{/if}

					<form
						method="POST"
						use:enhance={() => {
							isSubmitting = true;
							return async ({ update }) => {
								await update();
								isSubmitting = false;
								turnstileToken = '';
								turnstile?.reset();
							};
						}}
						class="space-y-5"
					>
						<div>
							<Label for="name" class="mb-2 text-slate-700 dark:text-slate-300">Nombre</Label>
							<Input
								id="name"
								name="name"
								type="text"
								placeholder="Tu nombre"
								required
								bind:value={name}
								class="bg-slate-50 dark:bg-slate-900"
							/>
						</div>

						<div>
							<Label for="email" class="mb-2 text-slate-700 dark:text-slate-300">Email</Label>
							<Input
								id="email"
								name="email"
								type="email"
								placeholder="tu@email.com"
								required
								bind:value={email}
								class="bg-slate-50 dark:bg-slate-900"
							/>
						</div>

						<div>
							<Label for="message" class="mb-2 text-slate-700 dark:text-slate-300">Mensaje</Label>
							<Textarea
								id="message"
								name="message"
								rows={5}
								placeholder="¿En qué podemos ayudarte?"
								required
								bind:value={message}
								class="w-full bg-slate-50 dark:bg-slate-900"
							/>
						</div>

						{#if data.turnstileSiteKey}
							<Turnstile
								bind:this={turnstile}
								siteKey={data.turnstileSiteKey}
								theme="auto"
								onVerify={handleTurnstileVerify}
								onExpire={handleTurnstileExpire}
							/>
						{/if}

						<Button
							type="submit"
							color="primary"
							class="w-full"
							disabled={isSubmitting || (!!data.turnstileSiteKey && !turnstileToken)}
						>
							{#if isSubmitting}
								<span class="flex items-center gap-2"> Enviando... </span>
							{:else}
								<span class="flex items-center gap-2">
									Enviar mensaje
									<Send class="h-4 w-4" />
								</span>
							{/if}
						</Button>
					</form>

					<p class="mt-4 text-center text-xs text-slate-500 dark:text-slate-400">
						Al enviar aceptas nuestra <a
							href="/privacy"
							class="text-indigo-600 hover:underline dark:text-indigo-400">política de privacidad</a
						>.
					</p>
				</div>

				<!-- Quick info -->
				<!-- <div class="mt-6 flex items-center justify-center gap-2 text-sm text-slate-500 dark:text-slate-400">
					<Mail class="w-4 h-4" />
					Normalmente respondemos en 24-48h
				</div> -->
			{/if}
		</div>
	</div>
</div>
