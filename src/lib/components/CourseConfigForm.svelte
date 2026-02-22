<script lang="ts">
	import { Label, Input, Textarea, Select } from 'flowbite-svelte';
	import { ImagePlus, Upload, X, BookOpen, FileText } from 'lucide-svelte';

	type CourseStatus = 'draft' | 'scheduled' | 'published' | 'archived';

	interface Props {
		/** Course name */
		name?: string;
		/** Course description */
		description?: string;
		/** Course image URL */
		imageUrl?: string;
		/** Course status */
		status?: CourseStatus;
		/** Show status selector */
		showStatusSelector?: boolean;
		/** Mode: 'create' or 'edit' */
		mode?: 'create' | 'edit';
		/** Callback when form values change */
		onchange?: () => void;
	}

	let {
		name = $bindable(''),
		description = $bindable(''),
		imageUrl = $bindable(''),
		status = $bindable<CourseStatus>('draft'),
		showStatusSelector = false,
		mode = 'edit',
		onchange
	}: Props = $props();

	const statusOptions = [
		{ value: 'draft', name: 'Borrador', description: 'Solo visible para administradores' },
		{ value: 'scheduled', name: 'Programado', description: 'Se publicará automáticamente' },
		{ value: 'published', name: 'Publicado', description: 'Visible para estudiantes' },
		{ value: 'archived', name: 'Archivado', description: 'Oculto pero conservado' }
	];

	let localImageOverride = $state<string | null>(null);
	let dragActive = $state(false);

	// Use local override if set, otherwise use prop value
	let imagePreview = $derived(localImageOverride ?? imageUrl);

	function markDirty() {
		onchange?.();
	}

	function handleImageChange(event: Event) {
		const input = event.target as HTMLInputElement;
		if (input.files && input.files[0]) {
			const reader = new FileReader();
			reader.onload = (e) => {
				localImageOverride = e.target?.result as string;
				markDirty();
			};
			reader.readAsDataURL(input.files[0]);
		}
	}

	function handleDrop(event: DragEvent) {
		event.preventDefault();
		dragActive = false;
		
		const files = event.dataTransfer?.files;
		if (files && files[0] && files[0].type.startsWith('image/')) {
			const reader = new FileReader();
			reader.onload = (e) => {
				localImageOverride = e.target?.result as string;
				markDirty();
			};
			reader.readAsDataURL(files[0]);
			
			// Create a synthetic event for the hidden input
			const input = document.getElementById('courseImage') as HTMLInputElement;
			if (input) {
				const dt = new DataTransfer();
				dt.items.add(files[0]);
				input.files = dt.files;
			}
		}
	}

	function handleDragOver(event: DragEvent) {
		event.preventDefault();
		dragActive = true;
	}

	function handleDragLeave() {
		dragActive = false;
	}

	function removeImage() {
		localImageOverride = '';
		const input = document.getElementById('courseImage') as HTMLInputElement;
		if (input) input.value = '';
		markDirty();
	}
</script>

<div class="space-y-8">
	<!-- Header Section with Image -->
	<div class="relative overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-sm dark:border-gray-700 dark:bg-gray-800">
		<!-- Image Banner -->
		<div
			class="relative h-48 bg-gradient-to-br from-blue-500 to-indigo-600 sm:h-56"
			role="region"
			aria-label="Imagen del curso"
			ondrop={handleDrop}
			ondragover={handleDragOver}
			ondragleave={handleDragLeave}
		>
			{#if imagePreview}
				<img
					src={imagePreview}
					alt="Vista previa del curso"
					class="h-full w-full object-cover"
				/>
				<button
					type="button"
					onclick={removeImage}
					class="absolute top-4 right-4 rounded-full bg-black/50 p-2 text-white backdrop-blur-sm transition-colors hover:bg-black/70"
					title="Eliminar imagen"
				>
					<X class="h-4 w-4" />
				</button>
			{:else}
				<div
					class="absolute inset-0 flex flex-col items-center justify-center transition-colors
						{dragActive ? 'bg-blue-600/80' : 'bg-gradient-to-br from-blue-500/90 to-indigo-600/90'}"
				>
					<div class="rounded-full bg-white/20 p-4 backdrop-blur-sm">
						<ImagePlus class="h-8 w-8 text-white" />
					</div>
					<p class="mt-3 text-sm font-medium text-white/90">
						{dragActive ? 'Suelta la imagen aquí' : 'Arrastra una imagen o haz clic para subir'}
					</p>
					<p class="mt-1 text-xs text-white/70">PNG, JPG hasta 5MB · Recomendado: 1200×400px</p>
				</div>
			{/if}
			
			<!-- Upload overlay/button -->
			<label
				for="courseImage"
				class="absolute inset-0 cursor-pointer opacity-0 transition-opacity hover:opacity-100
					{imagePreview ? 'bg-black/40' : ''}"
			>
				{#if imagePreview}
					<div class="flex h-full items-center justify-center">
						<div class="rounded-full bg-white/20 p-3 backdrop-blur-sm">
							<Upload class="h-6 w-6 text-white" />
						</div>
					</div>
				{/if}
			</label>
			<input
				type="file"
				id="courseImage"
				name="image"
				accept="image/*"
				onchange={handleImageChange}
				class="hidden"
			/>
		</div>

		<!-- Course Icon Badge -->
		<div class="absolute left-6 -bottom-6 sm:left-8">
			<div class="flex h-14 w-14 items-center justify-center rounded-xl border-4 border-white bg-gradient-to-br from-blue-500 to-indigo-600 shadow-lg dark:border-gray-800">
				<BookOpen class="h-7 w-7 text-white" />
			</div>
		</div>
	</div>

	<!-- Basic Info Section -->
	<div class="space-y-6 pt-4">
		<div class="grid gap-6 md:grid-cols-2">
			<!-- Name Field -->
			<div class="md:col-span-2">
				<Label for="course-name" class="mb-2 text-base font-semibold">
					Nombre del curso <span class="text-red-500">*</span>
				</Label>
				<Input
					id="course-name"
					name="name"
					type="text"
					placeholder="Ej: Introducción al Pensamiento Creativo"
					bind:value={name}
					oninput={markDirty}
					class="!rounded-xl border-2 !px-4 !py-3 !text-lg transition-all focus:!border-blue-500 focus:!ring-2 focus:!ring-blue-500/20"
					required
				/>
			</div>

			<!-- Description Field -->
			<div class="md:col-span-2">
				<Label for="course-desc" class="mb-2 text-base font-semibold">Descripción</Label>
				<Textarea
					id="course-desc"
					name="description"
					placeholder="Describe los objetivos, metodología y lo que aprenderán los estudiantes..."
					rows={4}
					bind:value={description}
					oninput={markDirty}
					class="w-full resize-none !rounded-xl border-2 !px-4 !py-3 transition-all focus:!border-blue-500 focus:!ring-2 focus:!ring-blue-500/20"
				/>
				<p class="mt-2 text-xs text-gray-400">
					💡 Una buena descripción ayuda a los estudiantes a entender el contenido del curso
				</p>
			</div>
		</div>
	</div>

	<!-- Status Selector (optional) -->
	{#if showStatusSelector}
		<div class="rounded-2xl border border-gray-200 bg-white p-6 dark:border-gray-700 dark:bg-gray-800">
			<div class="mb-4 flex items-center gap-3">
				<div class="rounded-lg bg-green-100 p-2 dark:bg-green-900/30">
					<FileText class="h-5 w-5 text-green-600 dark:text-green-400" />
				</div>
				<div>
					<h3 class="font-semibold text-gray-900 dark:text-white">Estado del curso</h3>
					<p class="text-sm text-gray-500 dark:text-gray-400">
						Controla la visibilidad y ciclo de vida del curso
					</p>
				</div>
			</div>
			<Select
				id="course-status"
				name="status"
				bind:value={status}
				onchange={markDirty}
				class="!rounded-xl"
			>
				{#each statusOptions as opt}
					<option value={opt.value}>{opt.name} - {opt.description}</option>
				{/each}
			</Select>
		</div>
	{/if}
</div>
