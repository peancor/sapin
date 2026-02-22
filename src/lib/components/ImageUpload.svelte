<script lang="ts">
	import { Image, Upload, Trash2, Camera } from 'lucide-svelte';

	interface Props {
		currentImage?: string | null;
		onchange?: (file: File | null) => void;
		onremove?: () => void;
		size?: 'sm' | 'md' | 'lg';
		showPreview?: boolean;
	}

	let { 
		currentImage = null, 
		onchange, 
		onremove,
		size = 'lg',
		showPreview = true 
	}: Props = $props();

	let fileInput = $state<HTMLInputElement | null>(null);
	let previewUrl = $state<string | null>(null);
	let hasNewFile = $state(false);
	let isRemoved = $state(false);

	// Sincronizar con currentImage cuando cambie externamente
	$effect(() => {
		if (!hasNewFile && !isRemoved) {
			previewUrl = currentImage;
		}
	});

	const sizeClasses = {
		sm: 'h-16 w-16',
		md: 'h-24 w-24',
		lg: 'h-32 w-32'
	};

	function handleFileSelect(event: Event) {
		const input = event.target as HTMLInputElement;
		const file = input.files?.[0];

		if (file) {
			if (file.size > 5 * 1024 * 1024) {
				alert('El archivo debe ser menor a 5MB');
				if (fileInput) fileInput.value = '';
				return;
			}

			if (!file.type.startsWith('image/')) {
				alert('Solo se permiten archivos de imagen');
				if (fileInput) fileInput.value = '';
				return;
			}

			// Crear preview inmediatamente
			previewUrl = URL.createObjectURL(file);
			hasNewFile = true;
			isRemoved = false; // Si se selecciona nueva imagen, ya no está "eliminada"
			onchange?.(file);
		}
	}

	function handleRemove() {
		previewUrl = null;
		hasNewFile = false;
		isRemoved = true; // Marcar como eliminada para evitar que $effect restaure la imagen
		if (fileInput) fileInput.value = '';
		onremove?.();
	}

	function triggerFileSelect() {
		fileInput?.click();
	}
</script>

<div class="flex flex-col items-center gap-3">
	<!-- Preview -->
	{#if showPreview}
		<div class="relative group">
			<div 
				class="relative {sizeClasses[size]} overflow-hidden rounded-full bg-gray-100 ring-4 ring-gray-200 dark:bg-gray-700 dark:ring-gray-600"
			>
				{#if previewUrl}
					<img
						src={previewUrl}
						alt="Preview"
						class="h-full w-full object-cover"
					/>
				{:else}
					<div class="flex h-full w-full items-center justify-center">
						<Image class="h-1/2 w-1/2 text-gray-400" />
					</div>
				{/if}
				
				<!-- Overlay on hover -->
				<button
					type="button"
					onclick={triggerFileSelect}
					class="absolute inset-0 flex items-center justify-center bg-black/50 opacity-0 transition-opacity group-hover:opacity-100"
				>
					<Camera class="h-8 w-8 text-white" />
				</button>
			</div>

			<!-- Remove button -->
			{#if previewUrl}
				<button
					type="button"
					onclick={handleRemove}
					class="absolute -right-1 -top-1 rounded-full bg-red-500 p-1.5 text-white shadow-lg transition-transform hover:scale-110 hover:bg-red-600"
					title="Eliminar imagen"
				>
					<Trash2 class="h-3.5 w-3.5" />
				</button>
			{/if}
		</div>
	{/if}

	<!-- Buttons -->
	<div class="flex items-center gap-2">
		<label class="cursor-pointer">
			<div class="flex items-center gap-2 rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm font-medium text-gray-700 transition-colors hover:bg-gray-50 dark:border-gray-600 dark:bg-gray-700 dark:text-gray-200 dark:hover:bg-gray-600">
				<Upload size={16} />
				<span>{previewUrl ? 'Cambiar' : 'Subir imagen'}</span>
			</div>
			<input
				type="file"
				accept="image/*"
				class="hidden"
				bind:this={fileInput}
				onchange={handleFileSelect}
			/>
		</label>

		{#if previewUrl && !showPreview}
			<button
				type="button"
				onclick={handleRemove}
				class="flex items-center gap-2 rounded-lg border border-red-300 bg-white px-3 py-2 text-sm font-medium text-red-600 transition-colors hover:bg-red-50 dark:border-red-600 dark:bg-gray-700 dark:text-red-400 dark:hover:bg-red-900/20"
			>
				<Trash2 size={16} />
				<span>Eliminar</span>
			</button>
		{/if}
	</div>

	<!-- Status text -->
	{#if hasNewFile}
		<p class="text-xs text-green-600 dark:text-green-400">
			✓ Nueva imagen seleccionada
		</p>
	{:else if isRemoved}
		<p class="text-xs text-red-600 dark:text-red-400">
			✗ Imagen eliminada (se guardará al enviar)
		</p>
	{/if}
</div>
