<script lang="ts">
	import { enhance } from '$app/forms';
	import { invalidateAll } from '$app/navigation';
	import { Modal, Button, Label, Input, Select, Helper, Badge } from 'flowbite-svelte';
	import { UserPlus, Mail, User, Lock, Shield } from 'lucide-svelte';

	interface RoleOption {
		id: string;
		name: string;
		displayName: string;
		level: number;
		description?: string | null;
	}

	interface Props {
		show: boolean;
		onClose: () => void;
		availableRoles?: RoleOption[];
	}

	let { show = $bindable(false), onClose, availableRoles = [] }: Props = $props();

	let error = $state('');
	let loading = $state(false);
	let selectedRoleId = $state('');

	// Roles legacy para fallback si no hay roles del nuevo sistema
	const legacyRoles = [
		{ value: 'student', name: 'Estudiante' },
		{ value: 'teacher', name: 'Profesor' },
		{ value: 'admin', name: 'Administrador' }
	];

	// Usar roles del nuevo sistema si están disponibles
	const hasNewRoles = $derived(availableRoles && availableRoles.length > 0);

	function getRoleBadgeColor(level: number): 'red' | 'purple' | 'blue' | 'yellow' | 'green' {
		if (level >= 100) return 'red';
		if (level >= 90) return 'purple';
		if (level >= 50) return 'blue';
		if (level >= 40) return 'yellow';
		return 'green';
	}

	function handleClose() {
		error = '';
		selectedRoleId = '';
		show = false;
		onClose();
	}
</script>

<Modal
	bind:open={show}
	size="md"
	dismissable
	outsideclose
	class="backdrop:bg-gray-900/50"
>
	{#snippet header()}
		<div class="flex items-center gap-3">
			<div class="flex h-10 w-10 items-center justify-center rounded-full bg-primary-100 dark:bg-primary-900">
				<UserPlus class="h-5 w-5 text-primary-600 dark:text-primary-400" />
			</div>
			<div>
				<h3 class="text-lg font-semibold text-gray-900 dark:text-white">Añadir nuevo usuario</h3>
				<p class="text-sm text-gray-500 dark:text-gray-400">Complete los campos para crear una cuenta</p>
			</div>
		</div>
	{/snippet}

	<form
		method="POST"
		action="?/addUser"
		use:enhance={() => {
			loading = true;
			error = '';
			return async ({ result }) => {
				loading = false;
				if (result.type === 'success') {
					await invalidateAll();
					handleClose();
				} else if (result.type === 'failure') {
					error = (result.data as { message?: string })?.message || 'Error al crear usuario';
				}
			};
		}}
		class="space-y-5"
	>
		{#if error}
			<div class="rounded-lg bg-red-50 p-4 text-sm text-red-800 dark:bg-red-900/50 dark:text-red-400">
				{error}
			</div>
		{/if}

		<div class="space-y-4">
			<Label class="space-y-2">
				<span>Correo electrónico</span>
				<Input
					type="email"
					name="email"
					placeholder="usuario@ejemplo.com"
					required
					class="ps-10"
				>
					{#snippet left()}
						<Mail class="h-5 w-5 text-gray-500 dark:text-gray-400" />
					{/snippet}
				</Input>
			</Label>

			<Label class="space-y-2">
				<span>Nombre de usuario</span>
				<Input
					type="text"
					name="username"
					placeholder="Nombre de usuario"
					required
					class="ps-10"
				>
					{#snippet left()}
						<User class="h-5 w-5 text-gray-500 dark:text-gray-400" />
					{/snippet}
				</Input>
			</Label>

			<Label class="space-y-2">
				<span>Contraseña</span>
				<Input
					type="password"
					name="password"
					placeholder="••••••••"
					required
					class="ps-10"
				>
					{#snippet left()}
						<Lock class="h-5 w-5 text-gray-500 dark:text-gray-400" />
					{/snippet}
				</Input>
				<Helper class="text-xs">Mínimo 8 caracteres recomendados</Helper>
			</Label>

			<!-- Selección de rol -->
			<div class="space-y-2">
				<Label>
					<span class="flex items-center gap-2">
						<Shield class="h-4 w-4 text-gray-500" />
						Rol del usuario
					</span>
				</Label>
				
				{#if hasNewRoles}
					<!-- Nuevo sistema de roles -->
					<input type="hidden" name="roleId" value={selectedRoleId} />
					<div class="grid gap-2">
						{#each availableRoles.sort((a, b) => b.level - a.level) as roleOption (roleOption.id)}
							<button
								type="button"
								class="flex items-center gap-3 rounded-lg border p-3 text-left transition-all {selectedRoleId === roleOption.id 
									? 'border-primary-500 bg-primary-50 dark:border-primary-400 dark:bg-primary-900/20' 
									: 'border-gray-200 hover:border-gray-300 hover:bg-gray-50 dark:border-gray-600 dark:hover:border-gray-500 dark:hover:bg-gray-700'}"
								onclick={() => selectedRoleId = roleOption.id}
							>
								<div class="flex h-8 w-8 items-center justify-center rounded-full {selectedRoleId === roleOption.id ? 'bg-primary-100 dark:bg-primary-800' : 'bg-gray-100 dark:bg-gray-600'}">
									<input
										type="radio"
										name="roleSelection"
										value={roleOption.id}
										checked={selectedRoleId === roleOption.id}
										class="h-4 w-4 text-primary-600"
										onchange={() => selectedRoleId = roleOption.id}
									/>
								</div>
								<div class="flex-1">
									<div class="flex items-center gap-2">
										<span class="font-medium text-gray-900 dark:text-white">{roleOption.displayName}</span>
										<Badge color={getRoleBadgeColor(roleOption.level)} class="text-xs">
											Nivel {roleOption.level}
										</Badge>
									</div>
									{#if roleOption.description}
										<p class="text-xs text-gray-500 dark:text-gray-400">{roleOption.description}</p>
									{/if}
								</div>
							</button>
						{/each}
					</div>
					{#if !selectedRoleId}
						<Helper color="red" class="text-xs">Selecciona un rol para el usuario</Helper>
					{/if}
				{:else}
					<!-- Sistema legacy de roles -->
					<Select
						name="role"
						items={legacyRoles}
						placeholder="Selecciona un rol"
						required
					/>
				{/if}
			</div>
		</div>

		<div class="flex items-center justify-end gap-3 border-t border-gray-200 pt-5 dark:border-gray-700">
			<Button color="alternative" onclick={handleClose} disabled={loading}>
				Cancelar
			</Button>
			<Button type="submit" color="primary" disabled={loading}>
				{#if loading}
					<svg class="mr-2 h-4 w-4 animate-spin" viewBox="0 0 24 24">
						<circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4" fill="none"></circle>
						<path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
					</svg>
					Guardando...
				{:else}
					Crear usuario
				{/if}
			</Button>
		</div>
	</form>
</Modal>
