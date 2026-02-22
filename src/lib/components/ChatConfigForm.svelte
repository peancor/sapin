<script lang="ts">
	import { Tooltip } from 'flowbite-svelte';
	import PromptMagician from '$lib/components/PromptMagician.svelte';
	import RoleMagician from '$lib/components/RoleMagician.svelte';
	import RichTextEditor from '$lib/components/RichTextEditor.svelte';

	interface Model {
		name: string;
		provider: string;
	}

	interface Props {
		/** Chat role value */
		llmRole?: string;
		/** Chat instructions value */
		llmInstructions?: string;
		/** Selected model */
		llmModel?: string;
		/** Temperature setting */
		temperature?: number;
		/** Max tokens setting */
		maxTokens?: number;
		/** Top P setting */
		topP?: number;
		/** Description value */
		description?: string;
		/** System prompt value */
		systemPrompt?: string;
		/** Additional context value */
		llmContext?: string;
		/** Activity status (draft, published, closed, archived) */
		status?: 'hidden' | 'published' | 'closed' | 'archived';
		/** Available models list */
		models?: Model[];
		/** Default model name */
		defaultModel?: string;
		/** Name field (only for create mode) */
		name?: string;
		/** Show name field */
		showNameField?: boolean;
		/** Callback when form values change */
		onchange?: () => void;
	}

	let {
		llmRole = $bindable(''),
		llmInstructions = $bindable(''),
		llmModel = $bindable(''),
		temperature = $bindable(0.7),
		maxTokens = $bindable(2000),
		topP = $bindable(0.9),
		description = $bindable(''),
		systemPrompt = $bindable(''),
		llmContext = $bindable(''),
		status = $bindable<'hidden' | 'published' | 'closed' | 'archived'>('hidden'),
		models = [],
		defaultModel = '',
		name = $bindable(''),
		showNameField = false,
		onchange
	}: Props = $props();

	let showRoleMagician = $state(false);
	let showPromptMagician = $state(false);
	let showSystemPrompt = $state(false);

	// Set default model if not provided
	$effect(() => {
		if (!llmModel && models.length > 0) {
			llmModel = defaultModel || models[0].name;
		}
	});

	function markDirty() {
		onchange?.();
	}
</script>

<div class="space-y-6">
	{#if showNameField}
		<div>
			<label for="name" class="mb-2 block font-medium dark:text-white">Nombre</label>
			<input
				type="text"
				id="name"
				name="name"
				bind:value={name}
				oninput={markDirty}
				class="w-full rounded border p-2 dark:border-gray-600 dark:bg-gray-700 dark:text-white"
				required
			/>
		</div>
	{/if}

	<div>
		<label for="description" class="mb-2 block dark:text-white">Descripción</label>
		<input
			type="text"
			id="description"
			name="description"
			bind:value={description}
			oninput={markDirty}
			class="w-full rounded border p-2 dark:border-gray-600 dark:bg-gray-700 dark:text-white"
		/>
	</div>

	<!-- Activity status selector -->
	<div class="rounded-lg border border-gray-200 p-4 dark:border-gray-700">
		<label class="mb-3 block font-medium dark:text-white">Estado de la actividad</label>
		<!-- Hidden input to ensure status is always submitted -->
		<input type="hidden" name="status" value={status} />
		<div class="grid grid-cols-1 gap-3 sm:grid-cols-3">
			<label
				class="flex cursor-pointer items-center gap-2 rounded-lg border-2 p-3 transition-colors {status ===
				'hidden'
					? 'border-yellow-500 bg-yellow-50 dark:bg-yellow-900/20'
					: 'border-gray-200 hover:border-gray-300 dark:border-gray-600 dark:hover:border-gray-500'}"
			>
				<input
					type="radio"
					name="status_radio"
					value="hidden"
					checked={status === 'hidden'}
					onchange={() => {
						status = 'hidden';
						markDirty();
					}}
					class="hidden"
				/>
				<span class="text-lg">👁️‍🗨️</span>
				<div>
					<div class="font-medium dark:text-white">Oculta</div>
					<div class="text-xs text-gray-500">No visible para estudiantes</div>
				</div>
			</label>

			<label
				class="flex cursor-pointer items-center gap-2 rounded-lg border-2 p-3 transition-colors {status ===
				'published'
					? 'border-green-500 bg-green-50 dark:bg-green-900/20'
					: 'border-gray-200 hover:border-gray-300 dark:border-gray-600 dark:hover:border-gray-500'}"
			>
				<input
					type="radio"
					name="status_radio"
					value="published"
					checked={status === 'published'}
					onchange={() => {
						status = 'published';
						markDirty();
					}}
					class="hidden"
				/>
				<span class="text-lg">✅</span>
				<div>
					<div class="font-medium dark:text-white">Publicada</div>
					<div class="text-xs text-gray-500">Visible y activa</div>
				</div>
			</label>

			<label
				class="flex cursor-pointer items-center gap-2 rounded-lg border-2 p-3 transition-colors {status ===
				'closed'
					? 'border-orange-500 bg-orange-50 dark:bg-orange-900/20'
					: 'border-gray-200 hover:border-gray-300 dark:border-gray-600 dark:hover:border-gray-500'}"
			>
				<input
					type="radio"
					name="status_radio"
					value="closed"
					checked={status === 'closed'}
					onchange={() => {
						status = 'closed';
						markDirty();
					}}
					class="hidden"
				/>
				<span class="text-lg">🔒</span>
				<div>
					<div class="font-medium dark:text-white">Cerrada</div>
					<div class="text-xs text-gray-500">Solo consulta</div>
				</div>
			</label>
		</div>
		{#if status === 'archived'}
			<p class="mt-2 text-sm text-amber-600 dark:text-amber-400">
				⚠️ Esta actividad está archivada. Contacta al administrador para cambiar su estado.
			</p>
		{/if}
	</div>

	<div>
		<div class="mb-2 flex items-center justify-between">
			<label for="llmRole" class="dark:text-white">Rol a desempeñar</label>
			<button
				type="button"
				id="role-magic-btn"
				class="magic-button sparkle flex items-center gap-2 rounded-full px-4 py-1.5 text-sm font-medium text-white shadow-md"
				onclick={() => (showRoleMagician = true)}
			>
				<span>🧙‍♂️</span>
				<span>Asistente de Roles</span>
			</button>
			<Tooltip triggeredBy="#role-magic-btn" placement="top">
				Crea roles educativos personalizados basados en metodologías pedagógicas probadas
			</Tooltip>
		</div>
		<RichTextEditor
			value={llmRole}
			name="llmRole"
			id="llmRole"
			rows={5}
			placeholder="por ejemplo, Profesor, Tutor, Entrenador..."
			onchange={(content) => {
				llmRole = content;
				markDirty();
			}}
		/>
	</div>

	<div>
		<div class="mb-2 flex items-center justify-between">
			<label for="llmInstructions" class="dark:text-white">Instrucciones</label>
			<button
				type="button"
				id="prompt-magic-btn"
				class="magic-button-blue sparkle flex items-center gap-2 rounded-full px-4 py-1.5 text-sm font-medium text-white shadow-md"
				onclick={() => (showPromptMagician = true)}
			>
				<span>✨</span>
				<span>Asistente de Instrucciones</span>
			</button>
			<Tooltip triggeredBy="#prompt-magic-btn" placement="top">
				Diseña actividades de aprendizaje efectivas con estrategias pedagógicas avanzadas
			</Tooltip>
		</div>
		<RichTextEditor
			value={llmInstructions}
			name="llmInstructions"
			id="llmInstructions"
			rows={20}
			placeholder="Escribe las instrucciones para el asistente..."
			onchange={(content) => {
				llmInstructions = content;
				markDirty();
			}}
		/>
	</div>

	<div>
		<label for="llmContext" class="mb-2 block dark:text-white">Contexto adicional</label>
		<RichTextEditor
			value={llmContext}
			name="llmContext"
			id="llmContext"
			rows={5}
			placeholder="Ingresa el contexto adicional que quieras incluir para la actividad..."
			onchange={(content) => {
				llmContext = content;
				markDirty();
			}}
		/>
	</div>

	<div>
		<button
			type="button"
			class="mb-2 flex items-center gap-2 text-sm font-medium dark:text-white"
			onclick={() => (showSystemPrompt = !showSystemPrompt)}
		>
			<svg
				class="h-4 w-4 transition-transform"
				class:rotate-90={showSystemPrompt}
				viewBox="0 0 20 20"
				fill="currentColor"
			>
				<path
					fill-rule="evenodd"
					d="M7.21 14.77a.75.75 0 01.02-1.06L11.168 10 7.23 6.29a.75.75 0 111.04-1.08l4.5 4.25a.75.75 0 010 1.08l-4.5 4.25a.75.75 0 01-1.06-.02z"
					clip-rule="evenodd"
				/>
			</svg>
			Prompt del sistema (avanzado)
		</button>
		{#if showSystemPrompt}
			<textarea
				id="systemPrompt"
				name="systemPrompt"
				bind:value={systemPrompt}
				oninput={markDirty}
				rows="5"
				class="w-full rounded border p-2 dark:border-gray-600 dark:bg-gray-700 dark:text-white"
				placeholder="Ingresa el prompt del sistema (esto anulará el rol y las instrucciones)..."
				style="min-height: 500px;"
			></textarea>
		{:else}
			<!-- Hidden input to always submit systemPrompt value -->
			<input type="hidden" name="systemPrompt" value={systemPrompt} />
		{/if}
	</div>

	<div>
		<label for="llmModel" class="mb-2 block dark:text-white">Modelo</label>
		<select
			id="llmModel"
			name="llmModel"
			bind:value={llmModel}
			onchange={markDirty}
			class="w-full rounded border p-2 dark:border-gray-600 dark:bg-gray-700 dark:text-white"
		>
			{#each models as model (model.name)}
				<option value={model.name}>{model.name} ({model.provider})</option>
			{/each}
		</select>
	</div>

	<div class="grid grid-cols-1 gap-4 md:grid-cols-3">
		<div>
			<label for="temperature" class="mb-2 block dark:text-white">
				Temperatura ({temperature})
			</label>
			<input
				type="range"
				id="temperature"
				name="temperature"
				bind:value={temperature}
				oninput={markDirty}
				min="0"
				max="2"
				step="0.1"
				class="w-full"
			/>
		</div>

		<div>
			<label for="maxTokens" class="mb-2 block dark:text-white">Máximo de tokens</label>
			<input
				type="number"
				id="maxTokens"
				name="maxTokens"
				bind:value={maxTokens}
				oninput={markDirty}
				min="1"
				max="4000"
				class="w-full rounded border p-2 dark:border-gray-600 dark:bg-gray-700 dark:text-white"
			/>
		</div>

		<div>
			<label for="topP" class="mb-2 block dark:text-white">
				Top P ({topP})
			</label>
			<input
				type="range"
				id="topP"
				name="topP"
				bind:value={topP}
				oninput={markDirty}
				min="0"
				max="1"
				step="0.1"
				class="w-full"
			/>
		</div>
	</div>
</div>

<RoleMagician
	bind:open={showRoleMagician}
	role={llmRole}
	onroleUpdate={(role) => {
		llmRole = role;
		markDirty();
	}}
/>
<PromptMagician
	bind:open={showPromptMagician}
	instructions={llmInstructions}
	oninstructionsUpdate={(instructions) => {
		llmInstructions = instructions;
		markDirty();
	}}
/>

<style>
	.magic-button {
		background: linear-gradient(135deg, #8b5cf6 0%, #d946ef 50%, #f59e0b 100%);
		background-size: 200% 200%;
		animation: gradient-shift 3s ease infinite;
		transition: all 0.3s ease;
	}

	.magic-button:hover {
		transform: scale(1.05);
		box-shadow: 0 4px 20px rgba(139, 92, 246, 0.4);
	}

	@keyframes gradient-shift {
		0%,
		100% {
			background-position: 0% 50%;
		}
		50% {
			background-position: 100% 50%;
		}
	}

	.magic-button-blue {
		background: linear-gradient(135deg, #3b82f6 0%, #06b6d4 50%, #10b981 100%);
		background-size: 200% 200%;
		animation: gradient-shift 3s ease infinite;
		transition: all 0.3s ease;
	}

	.magic-button-blue:hover {
		transform: scale(1.05);
		box-shadow: 0 4px 20px rgba(59, 130, 246, 0.4);
	}

	.sparkle {
		position: relative;
	}

	.sparkle::before {
		content: '✨';
		position: absolute;
		top: -2px;
		right: -2px;
		font-size: 10px;
		animation: sparkle-pulse 1.5s ease-in-out infinite;
	}

	@keyframes sparkle-pulse {
		0%,
		100% {
			opacity: 1;
			transform: scale(1);
		}
		50% {
			opacity: 0.5;
			transform: scale(1.2);
		}
	}
</style>
