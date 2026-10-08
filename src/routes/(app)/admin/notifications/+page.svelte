<script lang="ts">
	import type { PageData } from './$types';
	import { breadcrumb } from '$lib/stores/breadcrumb';
	import { enhance } from '$app/forms';
	import { goto } from '$app/navigation';
	import {
		Button,
		Input,
		Label,
		Textarea,
		Select,
		Toggle,
		Alert,
		Badge,
		Spinner
	} from 'flowbite-svelte';
	import {
		Bell,
		Send,
		Users,
		User,
		Search,
		CheckCircle,
		XCircle,
		AlertTriangle,
		X,
		Mail,
		BellRing
	} from 'lucide-svelte';

	let { data, form } = $props();

	// State
	let activeTab = $state<'broadcast' | 'individual'>('broadcast');
	let isSending = $state(false);

	// Broadcast form
	let broadcastTitle = $state('');
	let broadcastMessage = $state('');
	let broadcastPriority = $state('normal');
	let sendToAll = $state(false);
	let selectedRoles = $state<string[]>([]);
	let channelInApp = $state(true);
	// Email deshabilitado para broadcast durante desarrollo
	const channelEmail = false;

	// Individual form
	let individualTitle = $state('');
	let individualMessage = $state('');
	let individualPriority = $state('normal');
	let searchQuery = $state(data.searchQuery || '');
	let selectedUsers = $state<{ id: string; email: string; username: string | null }[]>([]);
	let individualChannelInApp = $state(true);
	let individualChannelEmail = $state(false);

	// Breadcrumb
	$effect(() => {
		breadcrumb.set([
			{ label: 'Admin', href: '/admin' },
			{ label: 'Enviar Notificaciones', href: '/admin/notifications' }
		]);
	});

	const priorityOptions = [
		{ value: 'low', name: 'Baja' },
		{ value: 'normal', name: 'Normal' },
		{ value: 'high', name: 'Alta' },
		{ value: 'urgent', name: 'Urgente' }
	];

	function toggleRole(roleId: string) {
		if (selectedRoles.includes(roleId)) {
			selectedRoles = selectedRoles.filter((r) => r !== roleId);
		} else {
			selectedRoles = [...selectedRoles, roleId];
		}
	}

	function selectAllRoles() {
		selectedRoles = data.roles.map((r) => r.id);
	}

	function clearRoles() {
		selectedRoles = [];
	}

	function addUser(user: { id: string; email: string; username: string | null }) {
		if (!selectedUsers.find((u) => u.id === user.id)) {
			selectedUsers = [...selectedUsers, user];
		}
	}

	function removeUser(userId: string) {
		selectedUsers = selectedUsers.filter((u) => u.id !== userId);
	}

	function handleSearch() {
		if (searchQuery.length >= 2) {
			goto(`/admin/notifications?search=${encodeURIComponent(searchQuery)}`, { keepFocus: true });
		}
	}

	function getRoleBadgeColor(level: number): 'red' | 'purple' | 'blue' | 'yellow' | 'green' {
		if (level >= 90) return 'red';
		if (level >= 70) return 'purple';
		if (level >= 50) return 'blue';
		if (level >= 30) return 'yellow';
		return 'green';
	}

	const canSendBroadcast = $derived(
		broadcastTitle.length >= 3 &&
			broadcastMessage.length >= 10 &&
			(sendToAll || selectedRoles.length > 0) &&
			channelInApp &&
			data.notificationConfig.enabled
	);

	const canSendIndividual = $derived(
		individualTitle.length >= 3 &&
			individualMessage.length >= 10 &&
			selectedUsers.length > 0 &&
			(individualChannelInApp || individualChannelEmail) &&
			data.notificationConfig.enabled
	);
</script>

<div class="p-6">
	<!-- Header -->
	<div class="mb-6">
		<h1 class="flex items-center gap-3 text-2xl font-bold text-gray-900 dark:text-white">
			<Bell class="text-primary-600 dark:text-primary-400 h-7 w-7" />
			Enviar Notificaciones
		</h1>
		<p class="mt-1 text-sm text-gray-500 dark:text-gray-400">
			Envía notificaciones manuales a grupos de usuarios o usuarios específicos
		</p>
	</div>

	<!-- Success/Error Messages -->
	{#if form?.success}
		<Alert color="green" class="mb-4">
			{#snippet icon()}
				<CheckCircle class="h-5 w-5" />
			{/snippet}
			{form.message}
		</Alert>
	{/if}

	{#if form?.error}
		<Alert color="red" class="mb-4">
			{#snippet icon()}
				<XCircle class="h-5 w-5" />
			{/snippet}
			{form.error}
		</Alert>
	{/if}

	<!-- Warning if notifications disabled -->
	{#if !data.notificationConfig.enabled}
		<Alert color="yellow" class="mb-4">
			{#snippet icon()}
				<AlertTriangle class="h-5 w-5" />
			{/snippet}
			El sistema de notificaciones está deshabilitado. Las notificaciones no se enviarán hasta que lo
			actives en
			<a href="/admin/settings" class="font-medium underline">Configuración</a>.
		</Alert>
	{/if}

	<!-- Tabs -->
	<div class="mb-6 border-b border-gray-200 dark:border-gray-700">
		<nav class="flex gap-4">
			<button
				type="button"
				class="flex items-center gap-2 border-b-2 px-4 py-2 text-sm font-medium transition-colors outline-none {activeTab ===
				'broadcast'
					? 'text-primary-600 border-primary-600 dark:text-primary-400 dark:border-primary-400'
					: 'border-transparent text-gray-500 hover:text-gray-900 dark:text-gray-400 dark:hover:text-white'}"
				onclick={() => (activeTab = 'broadcast')}
			>
				<Users class="h-4 w-4" />
				Por Roles
			</button>
			<button
				type="button"
				class="flex items-center gap-2 border-b-2 px-4 py-2 text-sm font-medium transition-colors outline-none {activeTab ===
				'individual'
					? 'text-primary-600 border-primary-600 dark:text-primary-400 dark:border-primary-400'
					: 'border-transparent text-gray-500 hover:text-gray-900 dark:text-gray-400 dark:hover:text-white'}"
				onclick={() => (activeTab = 'individual')}
			>
				<User class="h-4 w-4" />
				Usuarios Específicos
			</button>
		</nav>
	</div>

	<!-- Broadcast Tab -->
	{#if activeTab === 'broadcast'}
		<form
			method="POST"
			action="?/sendBroadcast"
			use:enhance={() => {
				isSending = true;
				return async ({ update }) => {
					await update();
					isSending = false;
				};
			}}
		>
			<div class="grid grid-cols-1 gap-6 xl:grid-cols-3">
				<!-- Left Column: Message Content -->
				<div class="space-y-6 xl:col-span-2">
					<div
						class="rounded-xl border border-gray-200 bg-white p-6 dark:border-gray-700 dark:bg-gray-800"
					>
						<h3 class="mb-4 text-lg font-semibold text-gray-900 dark:text-white">
							Contenido del Mensaje
						</h3>

						<div class="space-y-4">
							<div>
								<Label for="title" class="mb-2">Título</Label>
								<Input
									id="title"
									name="title"
									type="text"
									placeholder="Ej: Nueva funcionalidad disponible"
									bind:value={broadcastTitle}
									required
								/>
							</div>

							<div>
								<Label for="message" class="mb-2">Mensaje</Label>
								<Textarea
									id="message"
									name="message"
									rows={6}
									placeholder="Escribe el contenido del mensaje..."
									bind:value={broadcastMessage}
									required
								/>
								<p class="mt-1 text-xs text-gray-500">{broadcastMessage.length} caracteres</p>
							</div>

							<div class="grid grid-cols-1 gap-4 sm:grid-cols-2">
								<div>
									<Label for="priority" class="mb-2">Prioridad</Label>
									<Select
										id="priority"
										name="priority"
										items={priorityOptions}
										bind:value={broadcastPriority}
									/>
								</div>
								<div>
									<Label class="mb-2">Canal de Envío</Label>
									<div class="mt-2 flex gap-4">
										<label class="flex cursor-pointer items-center gap-2">
											<input
												type="checkbox"
												name="channel_in_app"
												checked={channelInApp}
												onchange={(e) => (channelInApp = e.currentTarget.checked)}
												class="text-primary-600 h-4 w-4 rounded border-gray-300"
											/>
											<BellRing class="h-4 w-4 text-blue-500" />
											<span class="text-sm">In-App</span>
										</label>
										<!-- Email deshabilitado para broadcast masivo durante desarrollo -->
									</div>
								</div>
							</div>
						</div>
					</div>
				</div>

				<!-- Right Column: Target Audience -->
				<div class="space-y-6">
					<div
						class="rounded-xl border border-gray-200 bg-white p-6 dark:border-gray-700 dark:bg-gray-800"
					>
						<h3 class="mb-4 text-lg font-semibold text-gray-900 dark:text-white">Destinatarios</h3>

						<div class="space-y-4">
							<div class="flex items-center gap-3 rounded-lg bg-gray-50 p-3 dark:bg-gray-700/50">
								<Toggle name="sendToAll" bind:checked={sendToAll} />
								<span class="text-sm font-medium text-gray-700 dark:text-gray-300">
									Enviar a todos los usuarios
								</span>
							</div>

							{#if !sendToAll}
								<div>
									<div class="mb-2 flex items-center justify-between">
										<Label>Selecciona los roles</Label>
										<div class="flex gap-2">
											<button
												type="button"
												class="text-primary-600 text-xs hover:underline"
												onclick={selectAllRoles}
											>
												Todos
											</button>
											<span class="text-gray-300">|</span>
											<button
												type="button"
												class="text-xs text-gray-500 hover:underline"
												onclick={clearRoles}
											>
												Ninguno
											</button>
										</div>
									</div>
									<div class="max-h-64 space-y-2 overflow-y-auto">
										{#each data.roles as role}
											{@const isSelected = selectedRoles.includes(role.id)}
											<button
												type="button"
												class="flex w-full items-center justify-between rounded-lg border p-3 text-left transition-colors {isSelected
													? 'border-primary-500 bg-primary-50 dark:bg-primary-900/20'
													: 'border-gray-200 hover:bg-gray-50 dark:border-gray-600 dark:hover:bg-gray-700'}"
												onclick={() => toggleRole(role.id)}
											>
												<div class="flex items-center gap-2">
													<input
														type="checkbox"
														name="roles"
														value={role.id}
														checked={isSelected}
														class="text-primary-600 h-4 w-4 rounded border-gray-300"
														onchange={() => {}}
													/>
													<span class="text-sm font-medium text-gray-900 dark:text-white">
														{role.displayName}
													</span>
												</div>
												<Badge color={getRoleBadgeColor(role.level)} class="text-xs">
													Nivel {role.level}
												</Badge>
											</button>
										{/each}
									</div>
									{#if selectedRoles.length > 0}
										<p class="mt-2 text-xs text-gray-500">
											{selectedRoles.length} rol(es) seleccionado(s)
										</p>
									{/if}
								</div>
							{/if}
						</div>
					</div>

					<!-- Submit Button -->
					<Button
						type="submit"
						color="primary"
						class="w-full"
						disabled={isSending || !canSendBroadcast}
					>
						{#if isSending}
							<Spinner size="4" class="mr-2" />
							Enviando...
						{:else}
							<Send class="mr-2 h-4 w-4" />
							Enviar Notificación
						{/if}
					</Button>
				</div>
			</div>
		</form>
	{/if}

	<!-- Individual Tab -->
	{#if activeTab === 'individual'}
		<form
			method="POST"
			action="?/sendToUsers"
			use:enhance={() => {
				isSending = true;
				return async ({ update }) => {
					await update();
					isSending = false;
					selectedUsers = [];
				};
			}}
		>
			<div class="grid grid-cols-1 gap-6 xl:grid-cols-3">
				<!-- Left Column: Message Content -->
				<div class="space-y-6 xl:col-span-2">
					<div
						class="rounded-xl border border-gray-200 bg-white p-6 dark:border-gray-700 dark:bg-gray-800"
					>
						<h3 class="mb-4 text-lg font-semibold text-gray-900 dark:text-white">
							Contenido del Mensaje
						</h3>

						<div class="space-y-4">
							<div>
								<Label for="ind-title" class="mb-2">Título</Label>
								<Input
									id="ind-title"
									name="title"
									type="text"
									placeholder="Ej: Información importante"
									bind:value={individualTitle}
									required
								/>
							</div>

							<div>
								<Label for="ind-message" class="mb-2">Mensaje</Label>
								<Textarea
									id="ind-message"
									name="message"
									rows={6}
									placeholder="Escribe el mensaje personalizado..."
									bind:value={individualMessage}
									required
								/>
								<p class="mt-1 text-xs text-gray-500">{individualMessage.length} caracteres</p>
							</div>

							<div class="grid grid-cols-1 gap-4 sm:grid-cols-2">
								<div>
									<Label for="ind-priority" class="mb-2">Prioridad</Label>
									<Select
										id="ind-priority"
										name="priority"
										items={priorityOptions}
										bind:value={individualPriority}
									/>
								</div>
								<div>
									<Label class="mb-2">Canales de Envío</Label>
									<div class="mt-2 flex gap-4">
										<label class="flex cursor-pointer items-center gap-2">
											<input
												type="checkbox"
												name="channel_in_app"
												checked={individualChannelInApp}
												onchange={(e) => (individualChannelInApp = e.currentTarget.checked)}
												class="text-primary-600 h-4 w-4 rounded border-gray-300"
											/>
											<BellRing class="h-4 w-4 text-blue-500" />
											<span class="text-sm">In-App</span>
										</label>
										<label class="flex cursor-pointer items-center gap-2">
											<input
												type="checkbox"
												name="channel_email"
												checked={individualChannelEmail}
												onchange={(e) => (individualChannelEmail = e.currentTarget.checked)}
												class="h-4 w-4 rounded border-gray-300 text-green-600"
											/>
											<Mail class="h-4 w-4 text-green-500" />
											<span class="text-sm">Email</span>
										</label>
									</div>
								</div>
							</div>
						</div>
					</div>
				</div>

				<!-- Right Column: User Selection -->
				<div class="space-y-6">
					<div
						class="rounded-xl border border-gray-200 bg-white p-6 dark:border-gray-700 dark:bg-gray-800"
					>
						<h3 class="mb-4 text-lg font-semibold text-gray-900 dark:text-white">
							Seleccionar Usuarios
						</h3>

						<!-- Search -->
						<div class="mb-4 flex gap-2">
							<Input
								type="text"
								placeholder="Buscar por email o nombre..."
								bind:value={searchQuery}
								class="flex-1"
								onkeydown={(e) => e.key === 'Enter' && (e.preventDefault(), handleSearch())}
							/>
							<Button color="alternative" size="sm" onclick={handleSearch}>
								<Search class="h-4 w-4" />
							</Button>
						</div>

						<!-- Search Results -->
						{#if data.users.length > 0}
							<div
								class="mb-4 max-h-48 overflow-y-auto rounded-lg border border-gray-200 dark:border-gray-700"
							>
								{#each data.users as user}
									{@const isSelected = selectedUsers.some((u) => u.id === user.id)}
									<button
										type="button"
										class="flex w-full items-center justify-between border-b border-gray-100 p-3 text-left transition-colors last:border-b-0 hover:bg-gray-50 dark:border-gray-700 dark:hover:bg-gray-700 {isSelected
											? 'bg-primary-50 dark:bg-primary-900/20'
											: ''}"
										onclick={() => addUser(user)}
										disabled={isSelected}
									>
										<div>
											<p class="text-sm font-medium text-gray-900 dark:text-white">
												{user.username || 'Sin nombre'}
											</p>
											<p class="text-xs text-gray-500 dark:text-gray-400">{user.email}</p>
										</div>
										{#if isSelected}
											<Badge color="green" class="text-xs">Añadido</Badge>
										{/if}
									</button>
								{/each}
							</div>
						{:else if data.searchQuery}
							<p class="mb-4 py-4 text-center text-sm text-gray-500 dark:text-gray-400">
								No se encontraron usuarios para "{data.searchQuery}"
							</p>
						{:else}
							<p class="mb-4 py-4 text-center text-sm text-gray-500 dark:text-gray-400">
								Escribe al menos 2 caracteres para buscar
							</p>
						{/if}

						<!-- Selected Users -->
						{#if selectedUsers.length > 0}
							<div>
								<Label class="mb-2">Usuarios seleccionados ({selectedUsers.length})</Label>
								<div class="max-h-40 space-y-2 overflow-y-auto">
									{#each selectedUsers as user}
										<input type="hidden" name="userIds" value={user.id} />
										<div
											class="flex items-center justify-between rounded-lg bg-gray-50 p-2 dark:bg-gray-700"
										>
											<div class="min-w-0">
												<p class="truncate text-sm font-medium text-gray-900 dark:text-white">
													{user.username || user.email}
												</p>
												{#if user.username}
													<p class="truncate text-xs text-gray-500">{user.email}</p>
												{/if}
											</div>
											<button
												type="button"
												class="rounded p-1 text-gray-400 transition-colors hover:bg-red-100 hover:text-red-500 dark:hover:bg-red-900/30"
												onclick={() => removeUser(user.id)}
											>
												<X class="h-4 w-4" />
											</button>
										</div>
									{/each}
								</div>
							</div>
						{/if}
					</div>

					<!-- Submit Button -->
					<Button
						type="submit"
						color="primary"
						class="w-full"
						disabled={isSending || !canSendIndividual}
					>
						{#if isSending}
							<Spinner size="4" class="mr-2" />
							Enviando...
						{:else}
							<Send class="mr-2 h-4 w-4" />
							Enviar a {selectedUsers.length} usuario(s)
						{/if}
					</Button>
				</div>
			</div>
		</form>
	{/if}
</div>
