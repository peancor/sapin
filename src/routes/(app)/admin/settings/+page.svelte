<script lang="ts">
	import type { PageData } from './$types';
	import { breadcrumb } from '$lib/stores/breadcrumb';
	import { resolve } from '$app/paths';
	import { enhance } from '$app/forms';
	import { Input, Label, Toggle, Select, Button, Helper, Alert, Checkbox } from 'flowbite-svelte';
	import { Mail, Server, Send, CheckCircle, XCircle, Bell, BellRing, Users } from 'lucide-svelte';

	let { data }: { data: PageData } = $props();

	let activeTab = $state('email');
	let emailMessage = $state('');
	let emailMessageType = $state<'success' | 'error'>('success');
	let testEmail = $state('');
	let isTestingConnection = $state(false);
	let isSendingTest = $state(false);

	let emailFormValues = $state({
		enabled: false,
		provider: 'smtp',
		smtpHost: '',
		smtpPort: 587,
		smtpSecure: false,
		smtpUser: '',
		smtpPass: '',
		fromName: '',
		fromEmail: ''
	});

	const providerOptions = [
		{ value: 'smtp', name: 'SMTP' },
		{ value: 'resend', name: 'Resend (Próximamente)' }
	];

	// Update breadcrumb
	$effect(() => {
		breadcrumb.set([
			{ label: 'Admin', href: '/admin' },
			{ label: 'Settings', href: '/admin/settings' }
		]);
	});

	const tabs = [
		{ id: 'email', label: 'Email' },
		{ id: 'analytics', label: 'Analytics' },
		{ id: 'notifications', label: 'Notificaciones' }
	];


	let analyticsFormValues = $state({
		enabled: false,
		trackPageViews: false,
		trackSessions: false,
		retentionDays: 90
	});

	let notificationFormValues = $state({
		enabled: true,
		inAppEnabled: true,
		inAppRetentionDays: 30,
		emailEnabled: false,
		types: {
			activity_completed: { enabled: true, channels: { in_app: true, email: false } },
			enrollment: { enabled: true, channels: { in_app: true, email: false } },
			new_activity: { enabled: true, channels: { in_app: true, email: false } },
			course_update: { enabled: true, channels: { in_app: true, email: false } },
			contact_form: { enabled: true, channels: { in_app: true, email: true } },
			system: { enabled: true, channels: { in_app: true, email: false } },
			custom: { enabled: true, channels: { in_app: true, email: false } }
		},
		contactFormRecipients: [] as string[]
	});

	const notificationTypeLabels: Record<string, string> = {
		activity_completed: 'Actividad completada',
		enrollment: 'Inscripción en curso',
		new_activity: 'Nueva actividad',
		course_update: 'Actualización de curso',
		contact_form: 'Formulario de contacto',
		system: 'Sistema',
		custom: 'Personalizado'
	};

	let hasInitialized = $state(false);
	$effect(() => {
		if (hasInitialized) return;

		emailFormValues = {
			enabled: data.settings.email.enabled,
			provider: data.settings.email.provider,
			smtpHost: data.settings.email.smtp?.host || '',
			smtpPort: data.settings.email.smtp?.port || 587,
			smtpSecure: data.settings.email.smtp?.secure || false,
			smtpUser: data.settings.email.smtp?.auth.user || '',
			smtpPass: data.settings.email.smtp?.auth.pass || '',
			fromName: data.settings.email.smtp?.fromName || '',
			fromEmail: data.settings.email.smtp?.fromEmail || ''
		};

		analyticsFormValues = {
			enabled: data.settings.analytics.enabled,
			trackPageViews: data.settings.analytics.trackPageViews,
			trackSessions: data.settings.analytics.trackSessions,
			retentionDays: data.settings.analytics.retentionDays
		};

		// Initialize notification form values
		const nConfig = data.settings.notifications;
		notificationFormValues = {
			enabled: nConfig.enabled,
			inAppEnabled: nConfig.channels.inApp.enabled,
			inAppRetentionDays: nConfig.channels.inApp.retentionDays,
			emailEnabled: nConfig.channels.email.enabled,
			contactFormRecipients: nConfig.contactFormRecipients || [],
			types: {
				activity_completed: {
					enabled: nConfig.types.activity_completed.enabled,
					channels: {
						in_app: nConfig.types.activity_completed.channels.includes('in_app'),
						email: nConfig.types.activity_completed.channels.includes('email')
					}
				},
				enrollment: {
					enabled: nConfig.types.enrollment.enabled,
					channels: {
						in_app: nConfig.types.enrollment.channels.includes('in_app'),
						email: nConfig.types.enrollment.channels.includes('email')
					}
				},
				new_activity: {
					enabled: nConfig.types.new_activity.enabled,
					channels: {
						in_app: nConfig.types.new_activity.channels.includes('in_app'),
						email: nConfig.types.new_activity.channels.includes('email')
					}
				},
				course_update: {
					enabled: nConfig.types.course_update.enabled,
					channels: {
						in_app: nConfig.types.course_update.channels.includes('in_app'),
						email: nConfig.types.course_update.channels.includes('email')
					}
				},
				contact_form: {
					enabled: nConfig.types.contact_form.enabled,
					channels: {
						in_app: nConfig.types.contact_form.channels.includes('in_app'),
						email: nConfig.types.contact_form.channels.includes('email')
					}
				},
				system: {
					enabled: nConfig.types.system.enabled,
					channels: {
						in_app: nConfig.types.system.channels.includes('in_app'),
						email: nConfig.types.system.channels.includes('email')
					}
				},
				custom: {
					enabled: nConfig.types.custom.enabled,
					channels: {
						in_app: nConfig.types.custom.channels.includes('in_app'),
						email: nConfig.types.custom.channels.includes('email')
					}
				}
			}
		};

		hasInitialized = true;
	});

	function toggleRecipient(userId: string) {
		const idx = notificationFormValues.contactFormRecipients.indexOf(userId);
		if (idx >= 0) {
			notificationFormValues.contactFormRecipients = notificationFormValues.contactFormRecipients.filter(id => id !== userId);
		} else {
			notificationFormValues.contactFormRecipients = [...notificationFormValues.contactFormRecipients, userId];
		}
	}

	let analyticsMessage = $state('');
	let analyticsMessageType = $state<'success' | 'error'>('success');

	function showAnalyticsMessage(message: string, type: 'success' | 'error') {
		analyticsMessage = message;
		analyticsMessageType = type;
		setTimeout(() => (analyticsMessage = ''), 5000);
	}

	let notificationMessage = $state('');
	let notificationMessageType = $state<'success' | 'error'>('success');

	function showNotificationMessage(message: string, type: 'success' | 'error') {
		notificationMessage = message;
		notificationMessageType = type;
		setTimeout(() => (notificationMessage = ''), 5000);
	}

	function handleTabClick(id: string) {
		activeTab = id;
	}

	function showEmailMessage(message: string, type: 'success' | 'error') {
		emailMessage = message;
		emailMessageType = type;
		setTimeout(() => (emailMessage = ''), 5000);
	}
</script>

<div class="container mx-auto p-6">
	<h1 class="mb-1 text-2xl font-bold text-gray-900 dark:text-white">System Settings</h1>
	<p class="mb-6 text-sm text-gray-500 dark:text-gray-400">
		Configura el servicio de email y el sistema de analítica.
	</p>

	<!-- Tabs -->
	<div class="mb-6 border-b border-gray-200 dark:border-gray-700">
		<nav class="flex flex-wrap gap-2">
			{#each tabs as tab (tab.id)}
				<button
					type="button"
					class="focus-visible:ring-primary-500 rounded-t-lg px-4 py-2 text-sm font-medium transition-colors outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-offset-white dark:focus-visible:ring-offset-gray-800 {activeTab ===
					tab.id
						? 'text-primary-600 border-primary-600 dark:text-primary-400 dark:border-primary-400 border-b-2'
						: 'text-gray-500 hover:text-gray-900 dark:text-gray-400 dark:hover:text-white'}"
					onclick={() => handleTabClick(tab.id)}
				>
					{tab.label}
				</button>
			{/each}
		</nav>
	</div>


	<!-- Email Settings Tab -->
	<div class={activeTab === 'email' ? '' : 'hidden'}>
		{#if emailMessage}
			<Alert color={emailMessageType === 'success' ? 'green' : 'red'} class="mb-4">
				{#snippet icon()}
					{#if emailMessageType === 'success'}
						<CheckCircle class="h-5 w-5" />
					{:else}
						<XCircle class="h-5 w-5" />
					{/if}
				{/snippet}
				{emailMessage}
			</Alert>
		{/if}

		<form
			method="POST"
			action="?/saveEmailSettings"
			use:enhance={() => {
				return async ({ result }) => {
					if (result.type === 'success') {
						showEmailMessage('Configuración de email guardada correctamente', 'success');
					} else {
						showEmailMessage('Error al guardar la configuración', 'error');
					}
				};
			}}
		>
			<div class="max-w-xl space-y-6">
				<!-- Enable/Disable Email -->
				<div
					class="flex items-center gap-4 rounded-lg border border-gray-200 bg-gray-50 p-4 dark:border-gray-600 dark:bg-gray-700"
				>
					<Mail class="h-6 w-6 text-gray-500 dark:text-gray-300" />
					<div class="flex-1">
						<p class="font-medium text-gray-900 dark:text-white">Servicio de Email</p>
						<p class="text-sm text-gray-500 dark:text-gray-400">
							Habilitar envío de emails desde la aplicación
						</p>
					</div>
					<Toggle
						name="enabled"
						checked={emailFormValues.enabled}
						onchange={(e) => (emailFormValues.enabled = e.currentTarget.checked)}
					/>
				</div>

				<!-- Provider Selection -->
				<div>
					<Label for="provider" class="mb-2">Proveedor de Email</Label>
					<Select
						id="provider"
						name="provider"
						items={providerOptions}
						bind:value={emailFormValues.provider}
					/>
					{#if emailFormValues.provider === 'resend'}
						<Helper class="mt-2" color="yellow">
							Resend aún no está implementado. Por favor usa SMTP.
						</Helper>
					{/if}
				</div>

				{#if emailFormValues.provider === 'smtp'}
					<!-- SMTP Configuration -->
					<div
						class="space-y-4 rounded-lg border border-gray-200 bg-white p-4 dark:border-gray-600 dark:bg-gray-800"
					>
						<div class="mb-2 flex items-center gap-2">
							<Server class="h-5 w-5 text-gray-500 dark:text-gray-300" />
							<h3 class="font-medium text-gray-900 dark:text-white">Configuración SMTP</h3>
						</div>

						<div class="grid grid-cols-1 gap-4 md:grid-cols-2">
							<div>
								<Label for="smtpHost" class="mb-2">Servidor SMTP</Label>
								<Input
									id="smtpHost"
									name="smtpHost"
									type="text"
									placeholder="smtp.gmail.com"
									bind:value={emailFormValues.smtpHost}
								/>
							</div>
							<div>
								<Label for="smtpPort" class="mb-2">Puerto</Label>
								<Input
									id="smtpPort"
									name="smtpPort"
									type="number"
									placeholder="587"
									bind:value={emailFormValues.smtpPort}
								/>
							</div>
						</div>

						<div class="flex items-center gap-3">
							<Toggle
								name="smtpSecure"
								checked={emailFormValues.smtpSecure}
								onchange={(e) => (emailFormValues.smtpSecure = e.currentTarget.checked)}
								>Conexión segura (SSL/TLS)</Toggle
							>
							<Helper class="text-xs">Usar para puerto 465</Helper>
						</div>

						<div class="grid grid-cols-1 gap-4 md:grid-cols-2">
							<div>
								<Label for="smtpUser" class="mb-2">Usuario SMTP</Label>
								<Input
									id="smtpUser"
									name="smtpUser"
									type="text"
									placeholder="usuario@dominio.com"
									bind:value={emailFormValues.smtpUser}
								/>
							</div>
							<div>
								<Label for="smtpPass" class="mb-2">Contraseña SMTP</Label>
								<Input
									id="smtpPass"
									name="smtpPass"
									type="password"
									placeholder="••••••••"
									bind:value={emailFormValues.smtpPass}
								/>
							</div>
						</div>

						<hr class="border-gray-200 dark:border-gray-600" />

						<div class="grid grid-cols-1 gap-4 md:grid-cols-2">
							<div>
								<Label for="fromName" class="mb-2">Nombre del Remitente</Label>
								<Input
									id="fromName"
									name="fromName"
									type="text"
									placeholder="SAPIN"
									bind:value={emailFormValues.fromName}
								/>
							</div>
							<div>
								<Label for="fromEmail" class="mb-2">Email del Remitente</Label>
								<Input
									id="fromEmail"
									name="fromEmail"
									type="email"
									placeholder="noreply@tudominio.com"
									bind:value={emailFormValues.fromEmail}
								/>
							</div>
						</div>
					</div>
				{/if}

				<div class="flex gap-3">
					<Button type="submit" color="primary">Guardar Configuración</Button>
				</div>
			</div>
		</form>

		<!-- Test Section -->
		{#if emailFormValues.enabled}
			<div class="mt-8 border-t border-gray-200 pt-6 dark:border-gray-600">
				<h3 class="mb-4 text-lg font-medium text-gray-900 dark:text-white">Probar Configuración</h3>

				<div class="flex max-w-xl flex-col gap-4 sm:flex-row">
					<!-- Test Connection -->
					<form
						method="POST"
						action="?/testEmailConnection"
						use:enhance={() => {
							isTestingConnection = true;
							return async ({ result }) => {
								isTestingConnection = false;
								if (result.type === 'success' && result.data) {
									const data = result.data as { success: boolean; message: string };
									showEmailMessage(data.message, data.success ? 'success' : 'error');
								}
							};
						}}
					>
						<Button type="submit" color="alternative" disabled={isTestingConnection}>
							{#if isTestingConnection}
								Probando...
							{:else}
								Probar Conexión
							{/if}
						</Button>
					</form>

					<!-- Send Test Email -->
					<form
						method="POST"
						action="?/sendTestEmail"
						class="flex flex-1 gap-2"
						use:enhance={() => {
							isSendingTest = true;
							return async ({ result }) => {
								isSendingTest = false;
								if (result.type === 'success' && result.data) {
									const data = result.data as { success: boolean; message: string };
									showEmailMessage(data.message, data.success ? 'success' : 'error');
								}
							};
						}}
					>
						<Input
							name="testEmail"
							type="email"
							placeholder="email@prueba.com"
							bind:value={testEmail}
							class="flex-1"
						/>
						<Button type="submit" color="green" disabled={isSendingTest || !testEmail}>
							<Send class="me-2 h-4 w-4" />
							{isSendingTest ? 'Enviando...' : 'Enviar Prueba'}
						</Button>
					</form>
				</div>
			</div>
		{/if}
	</div>

	<!-- Analytics Settings Tab -->
	<div class={activeTab === 'analytics' ? '' : 'hidden'}>
		{#if analyticsMessage}
			<Alert color={analyticsMessageType === 'success' ? 'green' : 'red'} class="mb-4">
				{#snippet icon()}
					{#if analyticsMessageType === 'success'}
						<CheckCircle class="h-5 w-5" />
					{:else}
						<XCircle class="h-5 w-5" />
					{/if}
				{/snippet}
				{analyticsMessage}
			</Alert>
		{/if}

		<form
			method="POST"
			action="?/saveAnalyticsSettings"
			use:enhance={() => {
				return async ({ result }) => {
					if (result.type === 'success') {
						showAnalyticsMessage('Configuración de analytics guardada correctamente', 'success');
					} else {
						showAnalyticsMessage('Error al guardar la configuración', 'error');
					}
				};
			}}
		>
			<div class="max-w-xl space-y-6">
				<!-- Enable/Disable Analytics -->
				<div
					class="flex items-center gap-4 rounded-lg border border-gray-200 bg-gray-50 p-4 dark:border-gray-600 dark:bg-gray-700"
				>
					<svg
						class="h-6 w-6 text-gray-500 dark:text-gray-300"
						fill="none"
						stroke="currentColor"
						viewBox="0 0 24 24"
					>
						<path
							stroke-linecap="round"
							stroke-linejoin="round"
							stroke-width="2"
							d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z"
						></path>
					</svg>
					<div class="flex-1">
						<p class="font-medium text-gray-900 dark:text-white">Sistema de Analítica</p>
						<p class="text-sm text-gray-500 dark:text-gray-400">
							Recopilar métricas de uso y comportamiento de usuarios
						</p>
					</div>
					<Toggle
						name="analyticsEnabled"
						checked={analyticsFormValues.enabled}
						onchange={(e) => (analyticsFormValues.enabled = e.currentTarget.checked)}
					/>
				</div>

				{#if analyticsFormValues.enabled}
					<!-- Tracking Options -->
					<div
						class="space-y-4 rounded-lg border border-gray-200 bg-white p-4 dark:border-gray-600 dark:bg-gray-800"
					>
						<h3 class="font-medium text-gray-900 dark:text-white">Opciones de Tracking</h3>

						<div class="space-y-3">
							<div class="flex items-center gap-3">
								<input
									type="checkbox"
									id="trackPageViews"
									name="analyticsTrackPageViews"
									checked={analyticsFormValues.trackPageViews}
									onchange={(e) => (analyticsFormValues.trackPageViews = e.currentTarget.checked)}
									class="text-primary-600 focus:ring-primary-500 h-4 w-4 rounded border-gray-300 dark:border-gray-600 dark:bg-gray-700"
								/>
								<label for="trackPageViews" class="text-sm text-gray-700 dark:text-gray-200">
									Rastrear vistas de página
								</label>
							</div>

							<div class="flex items-center gap-3">
								<input
									type="checkbox"
									id="trackSessions"
									name="analyticsTrackSessions"
									checked={analyticsFormValues.trackSessions}
									onchange={(e) => (analyticsFormValues.trackSessions = e.currentTarget.checked)}
									class="text-primary-600 focus:ring-primary-500 h-4 w-4 rounded border-gray-300 dark:border-gray-600 dark:bg-gray-700"
								/>
								<label for="trackSessions" class="text-sm text-gray-700 dark:text-gray-200">
									Rastrear sesiones de usuario
								</label>
							</div>
						</div>
					</div>

					<!-- Retention Settings -->
					<div
						class="space-y-4 rounded-lg border border-gray-200 bg-white p-4 dark:border-gray-600 dark:bg-gray-800"
					>
						<h3 class="font-medium text-gray-900 dark:text-white">Retención de Datos</h3>

						<div>
							<Label for="retentionDays" class="mb-2">Días de retención de eventos</Label>
							<select
								id="retentionDays"
								name="analyticsRetentionDays"
								bind:value={analyticsFormValues.retentionDays}
								class="focus:border-primary-500 focus:ring-primary-500 block w-full rounded-lg border border-gray-300 bg-gray-50 p-2.5 text-sm text-gray-900 dark:border-gray-600 dark:bg-gray-700 dark:text-white"
							>
								<option value={30}>30 días</option>
								<option value={60}>60 días</option>
								<option value={90}>90 días</option>
								<option value={180}>180 días</option>
								<option value={365}>1 año</option>
							</select>
							<Helper class="mt-2 text-xs">
								Los eventos más antiguos serán eliminados automáticamente. Las estadísticas diarias se
								conservan indefinidamente.
							</Helper>
						</div>
					</div>
				{/if}

				<div class="flex gap-3">
					<Button type="submit" color="primary">Guardar Configuración</Button>
					<Button type="button" color="alternative" href={resolve('/admin/analytics')}>
						Ver Dashboard
					</Button>
				</div>
			</div>
		</form>
	</div>

	<!-- Notifications Settings Tab -->
	<div class={activeTab === 'notifications' ? '' : 'hidden'}>
		{#if notificationMessage}
			<Alert color={notificationMessageType === 'success' ? 'green' : 'red'} class="mb-4">
				{#snippet icon()}
					{#if notificationMessageType === 'success'}
						<CheckCircle class="h-5 w-5" />
					{:else}
						<XCircle class="h-5 w-5" />
					{/if}
				{/snippet}
				{notificationMessage}
			</Alert>
		{/if}

		<form
			method="POST"
			action="?/saveNotificationSettings"
			use:enhance={() => {
				return async ({ result }) => {
					if (result.type === 'success') {
						showNotificationMessage('Configuración de notificaciones guardada correctamente', 'success');
					} else {
						showNotificationMessage('Error al guardar la configuración', 'error');
					}
				};
			}}
		>
			<div class="max-w-2xl space-y-6">
				<!-- Enable/Disable Notifications -->
				<div
					class="flex items-center gap-4 rounded-lg border border-gray-200 bg-gray-50 p-4 dark:border-gray-600 dark:bg-gray-700"
				>
					<Bell class="h-6 w-6 text-gray-500 dark:text-gray-300" />
					<div class="flex-1">
						<p class="font-medium text-gray-900 dark:text-white">Sistema de Notificaciones</p>
						<p class="text-sm text-gray-500 dark:text-gray-400">
							Habilitar el envío de notificaciones a usuarios
						</p>
					</div>
					<Toggle
						name="notificationsEnabled"
						checked={notificationFormValues.enabled}
						onchange={(e) => (notificationFormValues.enabled = e.currentTarget.checked)}
					/>
				</div>

				{#if notificationFormValues.enabled}
					<!-- Channel Configuration -->
					<div
						class="space-y-4 rounded-lg border border-gray-200 bg-white p-4 dark:border-gray-600 dark:bg-gray-800"
					>
						<h3 class="font-medium text-gray-900 dark:text-white">Canales de Notificación</h3>

						<div class="space-y-4">
							<!-- In-App Channel -->
							<div class="flex items-start gap-4 p-3 rounded-lg bg-gray-50 dark:bg-gray-700/50">
								<BellRing class="h-5 w-5 text-blue-500 mt-0.5" />
								<div class="flex-1">
									<div class="flex items-center justify-between">
										<div>
											<p class="font-medium text-gray-900 dark:text-white">In-App</p>
											<p class="text-xs text-gray-500 dark:text-gray-400">
												Notificaciones visibles en la aplicación
											</p>
										</div>
										<Toggle
											name="inAppEnabled"
											checked={notificationFormValues.inAppEnabled}
											onchange={(e) => (notificationFormValues.inAppEnabled = e.currentTarget.checked)}
										/>
									</div>
									{#if notificationFormValues.inAppEnabled}
										<div class="mt-3">
											<Label for="inAppRetentionDays" class="text-xs mb-1">Retención (días)</Label>
											<select
												id="inAppRetentionDays"
												name="inAppRetentionDays"
												bind:value={notificationFormValues.inAppRetentionDays}
												class="w-32 p-2 text-sm rounded-lg border border-gray-300 bg-white dark:border-gray-600 dark:bg-gray-700 dark:text-white"
											>
												<option value={7}>7 días</option>
												<option value={14}>14 días</option>
												<option value={30}>30 días</option>
												<option value={60}>60 días</option>
												<option value={90}>90 días</option>
											</select>
										</div>
									{/if}
								</div>
							</div>

							<!-- Email Channel -->
							<div class="flex items-start gap-4 p-3 rounded-lg bg-gray-50 dark:bg-gray-700/50">
								<Mail class="h-5 w-5 text-green-500 mt-0.5" />
								<div class="flex-1">
									<div class="flex items-center justify-between">
										<div>
											<p class="font-medium text-gray-900 dark:text-white">Email</p>
											<p class="text-xs text-gray-500 dark:text-gray-400">
												Enviar notificaciones por correo electrónico
											</p>
										</div>
										<Toggle
											name="emailEnabled"
											checked={notificationFormValues.emailEnabled}
											onchange={(e) => (notificationFormValues.emailEnabled = e.currentTarget.checked)}
										/>
									</div>
									{#if notificationFormValues.emailEnabled && !data.settings.email.enabled}
										<Helper class="mt-2" color="yellow">
											El servicio de email no está habilitado. Configúralo en la pestaña "Email".
										</Helper>
									{/if}
								</div>
							</div>
						</div>
					</div>

					<!-- Notification Types Configuration -->
					<div
						class="space-y-4 rounded-lg border border-gray-200 bg-white p-4 dark:border-gray-600 dark:bg-gray-800"
					>
						<h3 class="font-medium text-gray-900 dark:text-white">Tipos de Notificación</h3>
						<p class="text-xs text-gray-500 dark:text-gray-400 -mt-2">
							Configura qué tipos de notificaciones enviar y por qué canales.
						</p>

						<div class="space-y-3">
							{#each Object.entries(notificationFormValues.types) as [key, typeConfig]}
								<div class="flex items-center gap-4 p-3 rounded-lg border border-gray-100 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-700/30 transition-colors">
									<div class="flex-1 min-w-0">
										<div class="flex items-center gap-3">
											<input
												type="checkbox"
												name={`type_${key}`}
												checked={typeConfig.enabled}
												onchange={(e) => {
													notificationFormValues.types[key as keyof typeof notificationFormValues.types].enabled = e.currentTarget.checked;
												}}
												class="h-4 w-4 rounded border-gray-300 text-primary-600 focus:ring-primary-500"
											/>
											<span class="text-sm font-medium text-gray-900 dark:text-white">
												{notificationTypeLabels[key]}
											</span>
										</div>
									</div>
									{#if typeConfig.enabled}
										<div class="flex items-center gap-4 text-xs">
											<label class="flex items-center gap-1.5 cursor-pointer">
												<input
													type="checkbox"
													name={`${key}_channel_in_app`}
													checked={typeConfig.channels.in_app}
													onchange={(e) => {
														notificationFormValues.types[key as keyof typeof notificationFormValues.types].channels.in_app = e.currentTarget.checked;
													}}
													disabled={!notificationFormValues.inAppEnabled}
													class="h-3.5 w-3.5 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
												/>
												<span class="text-gray-600 dark:text-gray-400">In-App</span>
											</label>
											<label class="flex items-center gap-1.5 cursor-pointer">
												<input
													type="checkbox"
													name={`${key}_channel_email`}
													checked={typeConfig.channels.email}
													onchange={(e) => {
														notificationFormValues.types[key as keyof typeof notificationFormValues.types].channels.email = e.currentTarget.checked;
													}}
													disabled={!notificationFormValues.emailEnabled}
													class="h-3.5 w-3.5 rounded border-gray-300 text-green-600 focus:ring-green-500"
												/>
												<span class="text-gray-600 dark:text-gray-400">Email</span>
											</label>
										</div>
									{/if}
								</div>
							{/each}
						</div>
					</div>

					<!-- Contact Form Recipients -->
					<div
						class="space-y-4 rounded-lg border border-gray-200 bg-white p-4 dark:border-gray-600 dark:bg-gray-800"
					>
						<div class="flex items-center gap-2 mb-2">
							<Users class="h-5 w-5 text-gray-500 dark:text-gray-300" />
							<h3 class="font-medium text-gray-900 dark:text-white">Destinatarios del Formulario de Contacto</h3>
						</div>
						<p class="text-xs text-gray-500 dark:text-gray-400 -mt-2">
							Selecciona los usuarios que recibirán las notificaciones cuando alguien envíe un mensaje a través del formulario de contacto. Si no seleccionas ninguno, se notificará a todos los administradores.
						</p>

						<input type="hidden" name="contactFormRecipients" value={notificationFormValues.contactFormRecipients.join(',')} />

						<div class="grid gap-2 max-h-48 overflow-y-auto">
							{#each data.adminUsers as adminUser}
								<label class="flex items-center gap-3 p-2 rounded-lg border border-gray-100 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-700/30 transition-colors cursor-pointer">
									<input
										type="checkbox"
										checked={notificationFormValues.contactFormRecipients.includes(adminUser.id)}
										onchange={() => toggleRecipient(adminUser.id)}
										class="h-4 w-4 rounded border-gray-300 text-primary-600 focus:ring-primary-500"
									/>
									<div class="flex-1 min-w-0">
										<span class="text-sm font-medium text-gray-900 dark:text-white">
											{adminUser.username || adminUser.email}
										</span>
										<span class="text-xs text-gray-500 dark:text-gray-400 ml-2">
											({adminUser.roleName})
										</span>
									</div>
									<span class="text-xs text-gray-400 dark:text-gray-500 truncate max-w-[200px]">
										{adminUser.email}
									</span>
								</label>
							{/each}
							{#if data.adminUsers.length === 0}
								<p class="text-sm text-gray-500 dark:text-gray-400 italic py-2">
									No hay usuarios con rol de profesor o administrador.
								</p>
							{/if}
						</div>

						{#if notificationFormValues.contactFormRecipients.length === 0}
							<Helper class="mt-2">
								Sin destinatarios seleccionados, las notificaciones se enviarán a todos los administradores del sistema.
							</Helper>
						{:else}
							<Helper class="mt-2" color="green">
								{notificationFormValues.contactFormRecipients.length} usuario(s) seleccionado(s)
							</Helper>
						{/if}
					</div>
				{/if}

				<div class="flex gap-3">
					<Button type="submit" color="primary">Guardar Configuración</Button>
				</div>
			</div>
		</form>
	</div>
</div>
