<script lang="ts">
	import { tick } from 'svelte';
	import { enhance } from '$app/forms';
	import { invalidateAll } from '$app/navigation';
	import { Modal, Button, Label, Input, Helper, Badge } from 'flowbite-svelte';
	import { UserPlus, Mail, User, Lock, Shield, Eye, EyeOff } from 'lucide-svelte';

	interface RoleOption {
		id: string;
		name: string;
		displayName: string;
		level: number;
		description?: string | null;
	}

	type Field = 'email' | 'username' | 'password' | 'roleId';

	interface Props {
		show: boolean;
		availableRoles?: RoleOption[];
		onCreated?: (message: string) => void;
	}

	let { show = $bindable(false), availableRoles = [], onCreated }: Props = $props();

	const uid = $props.id();
	const ids = {
		title: `${uid}-title`,
		description: `${uid}-description`,
		email: `${uid}-email`,
		username: `${uid}-username`,
		password: `${uid}-password`,
		passwordHelp: `${uid}-password-help`,
		roles: `${uid}-roles`,
		error: `${uid}-error`,
		discard: `${uid}-discard`
	};

	const MIN_PASSWORD_LENGTH = 8;

	let formEl = $state<HTMLFormElement | null>(null);
	let error = $state('');
	let errorField = $state<Field | null>(null);
	let loading = $state(false);
	let dirty = $state(false);
	let confirmDiscard = $state(false);
	let showPassword = $state(false);
	// Valores controlados: un re-render (p. ej. al marcar un error) no debe vaciar los campos
	let values = $state({ email: '', username: '', password: '' });
	let selectedRoleId = $state('');

	const sortedRoles = $derived(availableRoles.toSorted((a, b) => b.level - a.level));
	// Preselecciona el rol de menor nivel (normalmente estudiante) para evitar
	// crear cuentas con privilegios por descuido.
	const defaultRoleId = $derived(
		sortedRoles.find((r) => r.name === 'student')?.id ?? sortedRoles.at(-1)?.id ?? ''
	);
	const effectiveRoleId = $derived(
		sortedRoles.some((r) => r.id === selectedRoleId) ? selectedRoleId : defaultRoleId
	);

	function getRoleBadgeColor(level: number): 'red' | 'purple' | 'blue' | 'yellow' | 'green' {
		if (level >= 100) return 'red';
		if (level >= 90) return 'purple';
		if (level >= 50) return 'blue';
		if (level >= 40) return 'yellow';
		return 'green';
	}

	function resetState() {
		error = '';
		errorField = null;
		loading = false;
		dirty = false;
		confirmDiscard = false;
		showPassword = false;
		values = { email: '', username: '', password: '' };
		selectedRoleId = '';
	}

	function close() {
		resetState();
		show = false;
	}

	// Esc, el botón de cierre y "Cancelar" pasan por aquí. Si hay datos escritos se pide
	// confirmación: así un Esc para cerrar el desplegable de autocompletado o un clic
	// accidental no hace desaparecer el formulario.
	function handleCancel(event: Event) {
		if (loading) {
			event.preventDefault();
			return;
		}
		if (dirty && !confirmDiscard) {
			event.preventDefault();
			confirmDiscard = true;
			return;
		}
		resetState();
	}

	function requestCancel() {
		if (confirmDiscard) {
			confirmDiscard = false;
			return;
		}
		const event = new Event('cancel', { cancelable: true });
		handleCancel(event);
		if (!event.defaultPrevented) close();
	}

	async function focusField(field: Field | null) {
		await tick();
		if (!formEl) return;
		const target =
			field === 'roleId'
				? (formEl.querySelector<HTMLInputElement>('input[name="roleId"]:checked') ??
					formEl.querySelector<HTMLInputElement>('input[name="roleId"]'))
				: field
					? formEl.querySelector<HTMLInputElement>(`[name="${field}"]`)
					: formEl.querySelector<HTMLElement>(`#${CSS.escape(ids.error)}`);
		target?.focus();
	}

	function invalidProps(field: Field) {
		return errorField === field
			? { 'aria-invalid': 'true' as const, 'aria-errormessage': ids.error }
			: {};
	}
</script>

<Modal
	bind:open={show}
	size="md"
	outsideclose={false}
	oncancel={handleCancel}
	aria-labelledby={ids.title}
	aria-describedby={ids.description}
	class="backdrop:bg-gray-900/50"
>
	{#snippet header()}
		<div class="flex items-center gap-3">
			<div
				class="bg-primary-100 dark:bg-primary-900 flex h-10 w-10 shrink-0 items-center justify-center rounded-full"
				aria-hidden="true"
			>
				<UserPlus class="text-primary-600 dark:text-primary-400 h-5 w-5" />
			</div>
			<div>
				<h2 id={ids.title} class="text-lg font-semibold text-gray-900 dark:text-white">
					Añadir nuevo usuario
				</h2>
				<p id={ids.description} class="text-sm text-gray-500 dark:text-gray-400">
					La cuenta se crea para otra persona; no uses tus propias credenciales.
				</p>
			</div>
		</div>
	{/snippet}

	<form
		bind:this={formEl}
		method="POST"
		action="?/addUser"
		autocomplete="off"
		aria-labelledby={ids.title}
		class="space-y-5"
		oninput={() => {
			dirty = true;
			confirmDiscard = false;
			if (errorField) errorField = null;
		}}
		use:enhance={() => {
			loading = true;
			error = '';
			errorField = null;
			confirmDiscard = false;
			return async ({ result }) => {
				loading = false;
				if (result.type === 'success') {
					const message =
						(result.data as { message?: string } | undefined)?.message ??
						'Usuario creado correctamente.';
					close();
					await invalidateAll();
					onCreated?.(message);
				} else if (result.type === 'failure') {
					const data = result.data as { message?: string; field?: Field } | undefined;
					error = data?.message ?? 'No se pudo crear el usuario.';
					errorField = data?.field ?? null;
					focusField(errorField);
				} else if (result.type === 'error') {
					error = 'No tienes permisos o la sesión ha caducado. Recarga la página.';
					focusField(null);
				}
			};
		}}
	>
		<div
			id={ids.error}
			role="alert"
			tabindex="-1"
			class="rounded-lg bg-red-50 p-4 text-sm text-red-800 dark:bg-red-900/50 dark:text-red-300"
			hidden={!error}
		>
			{error}
		</div>

		<div class="space-y-4">
			<div class="space-y-2">
				<Label for={ids.email}>Correo electrónico <span aria-hidden="true">*</span></Label>
				<Input
					id={ids.email}
					type="email"
					name="email"
					bind:value={values.email}
					placeholder="usuario@ejemplo.com…"
					required
					maxlength={255}
					autocomplete="off"
					spellcheck="false"
					autocapitalize="none"
					enterkeyhint="next"
					data-1p-ignore
					data-lpignore="true"
					data-bwignore
					class="ps-10"
					{...invalidProps('email')}
				>
					{#snippet left()}
						<Mail class="h-5 w-5 text-gray-500 dark:text-gray-400" aria-hidden="true" />
					{/snippet}
				</Input>
			</div>

			<div class="space-y-2">
				<Label for={ids.username}>Nombre de usuario <span aria-hidden="true">*</span></Label>
				<Input
					id={ids.username}
					type="text"
					name="username"
					bind:value={values.username}
					placeholder="p. ej. mgarcia…"
					required
					maxlength={64}
					autocomplete="off"
					spellcheck="false"
					autocapitalize="none"
					autocorrect="off"
					enterkeyhint="next"
					data-1p-ignore
					data-lpignore="true"
					data-bwignore
					class="ps-10"
					{...invalidProps('username')}
				>
					{#snippet left()}
						<User class="h-5 w-5 text-gray-500 dark:text-gray-400" aria-hidden="true" />
					{/snippet}
				</Input>
			</div>

			<div class="space-y-2">
				<Label for={ids.password}>Contraseña inicial <span aria-hidden="true">*</span></Label>
				<div class="relative">
					<Input
						id={ids.password}
						type={showPassword ? 'text' : 'password'}
						name="password"
						bind:value={values.password}
						required
						minlength={MIN_PASSWORD_LENGTH}
						maxlength={255}
						autocomplete="new-password"
						spellcheck="false"
						autocapitalize="none"
						enterkeyhint="done"
						aria-describedby={ids.passwordHelp}
						class="ps-10 pe-11"
						{...invalidProps('password')}
					>
						{#snippet left()}
							<Lock class="h-5 w-5 text-gray-500 dark:text-gray-400" aria-hidden="true" />
						{/snippet}
					</Input>
					<button
						type="button"
						class="focus-visible:ring-primary-500 absolute inset-y-0 end-0 flex w-11 items-center justify-center rounded-e-lg text-gray-500 hover:text-gray-900 focus-visible:ring-2 focus-visible:outline-none dark:text-gray-400 dark:hover:text-white"
						aria-label={showPassword ? 'Ocultar contraseña' : 'Mostrar contraseña'}
						aria-pressed={showPassword}
						aria-controls={ids.password}
						onclick={() => (showPassword = !showPassword)}
					>
						{#if showPassword}
							<EyeOff class="h-5 w-5" aria-hidden="true" />
						{:else}
							<Eye class="h-5 w-5" aria-hidden="true" />
						{/if}
					</button>
				</div>
				<Helper id={ids.passwordHelp} class="text-xs">
					Mínimo {MIN_PASSWORD_LENGTH} caracteres. Comunícasela a la persona por un canal seguro.
				</Helper>
			</div>

			<fieldset
				class="space-y-2"
				aria-describedby={errorField === 'roleId' ? ids.error : undefined}
			>
				<legend
					class="mb-2 flex items-center gap-2 text-sm font-medium text-gray-900 dark:text-white"
				>
					<Shield class="h-4 w-4 text-gray-500" aria-hidden="true" />
					Rol del usuario <span aria-hidden="true">*</span>
				</legend>

				{#if sortedRoles.length > 0}
					<div class="grid gap-2" id={ids.roles}>
						{#each sortedRoles as roleOption (roleOption.id)}
							{@const optionId = `${uid}-role-${roleOption.id}`}
							<label
								for={optionId}
								class="has-checked:border-primary-500 has-checked:bg-primary-50 dark:has-checked:border-primary-400 dark:has-checked:bg-primary-900/20 has-focus-visible:ring-primary-500 flex cursor-pointer items-center gap-3 rounded-lg border border-gray-200 p-3 transition-colors hover:border-gray-300 hover:bg-gray-50 has-focus-visible:ring-2 dark:border-gray-600 dark:hover:border-gray-500 dark:hover:bg-gray-700"
							>
								<input
									id={optionId}
									type="radio"
									name="roleId"
									value={roleOption.id}
									checked={roleOption.id === effectiveRoleId}
									onchange={() => (selectedRoleId = roleOption.id)}
									required
									class="text-primary-600 focus:ring-primary-500 h-4 w-4 shrink-0 border-gray-300"
								/>
								<span class="min-w-0 flex-1">
									<span class="flex flex-wrap items-center gap-2">
										<span class="font-medium text-gray-900 dark:text-white">
											{roleOption.displayName}
										</span>
										<Badge color={getRoleBadgeColor(roleOption.level)} class="text-xs">
											Nivel {roleOption.level}
										</Badge>
									</span>
									{#if roleOption.description}
										<span class="block text-xs text-gray-500 dark:text-gray-400">
											{roleOption.description}
										</span>
									{/if}
								</span>
							</label>
						{/each}
					</div>
				{:else}
					<p
						class="rounded-lg bg-yellow-50 p-3 text-sm text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-300"
					>
						No tienes roles asignables. Revisa la configuración de roles antes de crear usuarios.
					</p>
				{/if}
			</fieldset>
		</div>

		<div
			id={ids.discard}
			role="status"
			class="rounded-lg bg-yellow-50 p-3 text-sm text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-300"
			hidden={!confirmDiscard}
		>
			Hay datos sin guardar. ¿Quieres descartarlos y cerrar?
		</div>

		<div
			class="flex flex-wrap items-center justify-end gap-3 border-t border-gray-200 pt-5 dark:border-gray-700"
		>
			<!-- "Descartar" aparece a la izquierda para no desplazar los botones existentes:
			     un segundo clic en el mismo sitio nunca descarta los datos. -->
			{#if confirmDiscard}
				<Button type="button" color="red" outline aria-describedby={ids.discard} onclick={close}>
					Descartar y cerrar
				</Button>
			{/if}
			<Button type="button" color="alternative" onclick={requestCancel} disabled={loading}>
				{confirmDiscard ? 'Seguir editando' : 'Cancelar'}
			</Button>
			<Button
				type="submit"
				color="primary"
				disabled={loading || sortedRoles.length === 0}
				aria-busy={loading}
			>
				{#if loading}
					<svg
						class="mr-2 h-4 w-4 animate-spin motion-reduce:hidden"
						viewBox="0 0 24 24"
						aria-hidden="true"
					>
						<circle
							class="opacity-25"
							cx="12"
							cy="12"
							r="10"
							stroke="currentColor"
							stroke-width="4"
							fill="none"
						></circle>
						<path
							class="opacity-75"
							fill="currentColor"
							d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
						></path>
					</svg>
					Creando usuario…
				{:else}
					Crear usuario
				{/if}
			</Button>
		</div>
	</form>
</Modal>
