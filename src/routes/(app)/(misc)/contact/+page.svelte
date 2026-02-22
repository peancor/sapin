<script lang="ts">
	import { Mail, MessageSquare, Send, CheckCircle, AlertCircle, ArrowLeft } from 'lucide-svelte';
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
	<meta name="description" content="Contacta con el equipo de SAPIN para resolver dudas o colaborar." />
</svelte:head>

<div class="min-h-screen bg-gradient-to-b from-slate-50 to-white dark:from-gray-900 dark:to-gray-900">
	<div class="container mx-auto px-4 py-12 md:py-16">
		<div class="max-w-xl mx-auto">
			<!-- Back link -->
			<a href="/" class="inline-flex items-center gap-2 text-sm text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 mb-8 transition-colors">
				<ArrowLeft class="w-4 h-4" />
				Volver al inicio
			</a>

			<!-- Header -->
			<div class="text-center mb-8">
				<div class="w-14 h-14 bg-indigo-100 dark:bg-indigo-900/40 rounded-2xl flex items-center justify-center mx-auto mb-4">
					<MessageSquare class="w-7 h-7 text-indigo-600 dark:text-indigo-400" />
				</div>
				<h1 class="text-3xl font-bold text-slate-900 dark:text-white mb-2">
					Contacto
				</h1>
				<p class="text-slate-600 dark:text-slate-400">
					¿Tienes alguna pregunta o sugerencia? Escríbenos.
				</p>
			</div>

			<!-- Success message -->
			{#if form?.success}
				<div class="bg-white dark:bg-slate-800 rounded-2xl p-8 border border-slate-200 dark:border-slate-700 shadow-sm text-center">
					<div class="w-16 h-16 bg-green-100 dark:bg-green-900/40 rounded-full flex items-center justify-center mx-auto mb-4">
						<CheckCircle class="w-8 h-8 text-green-600 dark:text-green-400" />
					</div>
					<h2 class="text-xl font-semibold text-slate-900 dark:text-white mb-2">
						¡Mensaje enviado!
					</h2>
					<p class="text-slate-600 dark:text-slate-400 mb-6">
						{form.message}
					</p>
					<Button href="/" color="light">
						Volver al inicio
					</Button>
				</div>
			{:else}
				<!-- Form -->
				<div class="bg-white dark:bg-slate-800 rounded-2xl p-6 md:p-8 border border-slate-200 dark:border-slate-700 shadow-sm">
					{#if form?.error}
						<Alert color="red" class="mb-6">
							{#snippet icon()}
								<AlertCircle class="w-5 h-5" />
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

						<Button type="submit" color="primary" class="w-full" disabled={isSubmitting || (!!data.turnstileSiteKey && !turnstileToken)}>
							{#if isSubmitting}
								<span class="flex items-center gap-2">
									Enviando...
								</span>
							{:else}
								<span class="flex items-center gap-2">
									Enviar mensaje
									<Send class="w-4 h-4" />
								</span>
							{/if}
						</Button>
					</form>

					<p class="text-xs text-slate-500 dark:text-slate-400 text-center mt-4">
						Al enviar aceptas nuestra <a href="/privacy" class="text-indigo-600 dark:text-indigo-400 hover:underline">política de privacidad</a>.
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
