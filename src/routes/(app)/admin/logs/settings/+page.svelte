<script lang="ts">
	import { enhance } from '$app/forms';
	import { breadcrumb } from '$lib/stores/breadcrumb';
	import { resolve } from '$app/paths';
	import {
		Button,
		Alert,
		Toggle,
		Select,
		Card
	} from 'flowbite-svelte';
	import {
		Settings,
		Save,
		ArrowLeft,
		Check,
		User,
		BookOpen,
		Cog,
		AlertTriangle,
		Info,
		Bell
	} from 'lucide-svelte';
	import { onMount } from 'svelte';
	import { beforeNavigate } from '$app/navigation';

	let { data, form } = $props();

	// State
	let enabled = $state(false);
	let retentionDays = $state(30);
	let categoryUser = $state(false);
	let categoryCourse = $state(false);
	let categorySettings = $state(false);
	let categoryNotifications = $state(false);
	let categoryErrors = $state(false);
	let isSaving = $state(false);
	let isDirty = $state(false);
	let isHydrated = $state(false);
	let baseline = $state({
		enabled: false,
		retentionDays: 30,
		categoryUser: false,
		categoryCourse: false,
		categorySettings: false,
		categoryNotifications: false,
		categoryErrors: false
	});

	$effect(() => {
		if (isDirty || isSaving) return;

		const nextBaseline = {
			enabled: data.config?.enabled ?? false,
			retentionDays: data.config?.retentionDays ?? 30,
			categoryUser: data.config?.categories?.user ?? false,
			categoryCourse: data.config?.categories?.course ?? false,
			categorySettings: data.config?.categories?.settings ?? false,
			categoryNotifications: data.config?.categories?.notifications ?? false,
			categoryErrors: data.config?.categories?.errors ?? false
		};

		enabled = nextBaseline.enabled;
		retentionDays = nextBaseline.retentionDays;
		categoryUser = nextBaseline.categoryUser;
		categoryCourse = nextBaseline.categoryCourse;
		categorySettings = nextBaseline.categorySettings;
		categoryNotifications = nextBaseline.categoryNotifications;
		categoryErrors = nextBaseline.categoryErrors;
		baseline = nextBaseline;
		isHydrated = true;
	});

	$effect(() => {
		if (!isHydrated || isSaving) return;
		const dirty =
			enabled !== baseline.enabled ||
			retentionDays !== baseline.retentionDays ||
			categoryUser !== baseline.categoryUser ||
			categoryCourse !== baseline.categoryCourse ||
			categorySettings !== baseline.categorySettings ||
			categoryNotifications !== baseline.categoryNotifications ||
			categoryErrors !== baseline.categoryErrors;
		isDirty = dirty;
	});

	onMount(() => {
		const handleBeforeUnload = (e: BeforeUnloadEvent) => {
			if (isDirty) {
				e.preventDefault();
				e.returnValue = '';
			}
		};

		window.addEventListener('beforeunload', handleBeforeUnload);

		return () => {
			window.removeEventListener('beforeunload', handleBeforeUnload);
		};
	});

	beforeNavigate((navigation) => {
		if (isDirty && !window.confirm('Hay cambios sin guardar. ¿Deseas salir de todas formas?')) {
			navigation.cancel();
		}
	});

	// Breadcrumb
	$effect(() => {
		breadcrumb.set([
			{ label: 'Admin', href: resolve('/admin') },
			{ label: 'Audit Logs', href: resolve('/admin/logs') },
			{ label: 'Configuracion', href: resolve('/admin/logs/settings') }
		]);
	});

	const retentionOptions = [
		{ value: 30, label: '30 dias' },
		{ value: 60, label: '60 dias' },
		{ value: 90, label: '90 dias' },
		{ value: 180, label: '180 dias' },
		{ value: 365, label: '1 ano' }
	];

	const categoryInfo = [
		{
			key: 'user',
			label: 'Usuarios',
			description: 'Creacion, modificacion, eliminacion de usuarios, login/logout',
			icon: User,
			bind: () => categoryUser,
			set: (v: boolean) => {
				categoryUser = v;
				isDirty = true;
			}
		},
		{
			key: 'course',
			label: 'Cursos',
			description: 'Creacion, modificacion, eliminacion de cursos',
			icon: BookOpen,
			bind: () => categoryCourse,
			set: (v: boolean) => {
				categoryCourse = v;
				isDirty = true;
			}
		},
		{
			key: 'settings',
			label: 'Configuracion',
			description: 'Cambios en configuracion del sistema',
			icon: Cog,
			bind: () => categorySettings,
			set: (v: boolean) => {
				categorySettings = v;
				isDirty = true;
			}
		},
		{
			key: 'notifications',
			label: 'Notificaciones',
			description: 'Envio de notificaciones y cambios de configuracion',
			icon: Bell,
			bind: () => categoryNotifications,
			set: (v: boolean) => {
				categoryNotifications = v;
				isDirty = true;
			}
		},
		{
			key: 'errors',
			label: 'Errores',
			description: 'Errores del sistema y eventos criticos',
			icon: AlertTriangle,
			bind: () => categoryErrors,
			set: (v: boolean) => {
				categoryErrors = v;
				isDirty = true;
			}
		}
	];
</script>

<div class="space-y-6">
	<!-- Header -->
	<div class="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
		<div>
			<h1 class="text-2xl font-bold text-gray-900 dark:text-white">Configuracion de Auditoria</h1>
			<p class="mt-1 text-sm text-gray-500 dark:text-gray-400">
				Configura el sistema de logs de auditoria
			</p>
		</div>
		<a href={resolve("/admin/logs")}>
			<Button color="alternative" class="flex items-center gap-2">
				<ArrowLeft class="h-4 w-4" />
				Volver a Logs
			</Button>
		</a>
	</div>

	<!-- Success message -->
	{#if form?.success}
		<Alert color="green" class="flex items-center gap-3">
			{#snippet icon()}
				<Check class="h-5 w-5" />
			{/snippet}
			Configuracion guardada correctamente.
		</Alert>
	{/if}

	<!-- Error message -->
	{#if form?.error}
		<Alert color="red" class="flex items-center gap-3">
			{#snippet icon()}
				<AlertTriangle class="h-5 w-5" />
			{/snippet}
			{form.error}
		</Alert>
	{/if}

	<form
		method="POST"
		action="?/save"
		use:enhance={() => {
			isSaving = true;
			return async ({ update }) => {
				await update({ reset: false });
				isSaving = false;
				isDirty = false;
			};
		}}
	>
		<!-- General Settings -->
		<Card class="mb-6">
			<h2 class="mb-4 flex items-center gap-2 text-lg font-semibold text-gray-900 dark:text-white">
				<Settings class="h-5 w-5" />
				Configuracion General
			</h2>

			<div class="space-y-6">
				<!-- Enabled toggle -->
				<div class="flex items-center justify-between">
					<div>
						<label class="font-medium text-gray-900 dark:text-white">Sistema de Auditoria</label>
						<p class="text-sm text-gray-500 dark:text-gray-400">
							Activa o desactiva el registro de eventos de auditoria
						</p>
					</div>
					<Toggle name="enabled" bind:checked={enabled} />
				</div>

				<!-- Retention days -->
				<div>
					<label class="mb-2 block font-medium text-gray-900 dark:text-white">
						Periodo de Retencion
					</label>
					<p class="mb-3 text-sm text-gray-500 dark:text-gray-400">
						Los logs mas antiguos que este periodo seran eliminados automaticamente
					</p>
					<Select name="retentionDays" bind:value={retentionDays} class="w-48">
						{#each retentionOptions as option (option.value)}
							<option value={option.value}>{option.label}</option>
						{/each}
					</Select>
				</div>
			</div>
		</Card>

		<!-- Category Settings -->
		<Card class="mb-6">
			<h2 class="mb-4 flex items-center gap-2 text-lg font-semibold text-gray-900 dark:text-white">
				<Info class="h-5 w-5" />
				Categorias de Eventos
			</h2>
			<p class="mb-4 text-sm text-gray-500 dark:text-gray-400">
				Selecciona que tipos de eventos se deben registrar
			</p>

			<div class="space-y-4">
				{#each categoryInfo as cat (cat.label)}
					{@const checked = cat.bind()}
					<div
						class="flex items-center justify-between rounded-lg border border-gray-200 p-4 dark:border-gray-700"
					>
						<div class="flex items-center gap-3">
							<div
								class="flex h-10 w-10 items-center justify-center rounded-lg bg-gray-100 dark:bg-gray-700"
							>
								<cat.icon class="h-5 w-5 text-gray-600 dark:text-gray-400" />
							</div>
							<div>
								<label class="font-medium text-gray-900 dark:text-white">{cat.label}</label>
								<p class="text-sm text-gray-500 dark:text-gray-400">{cat.description}</p>
							</div>
						</div>
						<Toggle
							name={"category" + cat.label}
							checked={checked}
							onchange={(e: Event) => cat.set((e.target as HTMLInputElement).checked)}
						/>
					</div>
				{/each}
			</div>

			<!-- Hidden inputs to send actual values -->
			<input type="hidden" name="categoryUser" value={categoryUser ? 'on' : ''} />
			<input type="hidden" name="categoryCourse" value={categoryCourse ? 'on' : ''} />
			<input type="hidden" name="categorySettings" value={categorySettings ? 'on' : ''} />
			<input type="hidden" name="categoryNotifications" value={categoryNotifications ? 'on' : ''} />
			<input type="hidden" name="categoryErrors" value={categoryErrors ? 'on' : ''} />
		</Card>

		<!-- Info card -->
		<Alert color="blue" class="mb-6">
			{#snippet icon()}
				<Info class="h-5 w-5" />
			{/snippet}
			<div>
				<span class="font-medium">Nota:</span> Los logs volatiles (HTTP requests, tiempos de respuesta,
				debug) se envian a stdout y pueden visualizarse con herramientas externas como PM2, Docker logs,
				etc.
			</div>
		</Alert>

		<!-- Save button -->
		<div class="flex justify-end">
			<Button type="submit" color="primary" class="flex items-center gap-2" disabled={isSaving}>
				<Save class="h-4 w-4" />
				{isSaving ? 'Guardando...' : 'Guardar Configuracion'}
			</Button>
		</div>
	</form>
</div>
