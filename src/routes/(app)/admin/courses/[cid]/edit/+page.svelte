<script lang="ts">
	import type { PageData, ActionData } from './$types';
	import { enhance } from '$app/forms';
	import { invalidateAll } from '$app/navigation';
	import { Button, Label, Input, Textarea, Select, Toast, Badge } from 'flowbite-svelte';
	import {
		Save,
		Image as ImageIcon,
		Upload,
		X,
		Calendar,
		Hash,
		Clock,
		FileText,
		CheckCircle,
		AlertCircle
	} from 'lucide-svelte';

	let { data, form }: { data: PageData; form: ActionData } = $props();

	// Form state
	let name = $state(data.course.name);
	let description = $state(data.course.description ?? '');
	let status = $state(data.course.status);
	let isSaving = $state(false);
	let isUploadingImage = $state(false);

	// Image upload state
	let imagePreview = $state(data.course.image || '');
	let dragOver = $state(false);
	let imageInputRef = $state<HTMLInputElement | null>(null);

	// Toast state
	let showToast = $state(false);
	let toastMessage = $state('');
	let toastType = $state<'success' | 'error'>('success');

	// Sync with data changes
	$effect(() => {
		name = data.course.name;
		description = data.course.description ?? '';
		status = data.course.status;
		imagePreview = data.course.image || '';
	});

	// Show success message on form success
	$effect(() => {
		if (form?.success) {
			showToastMessage('Cambios guardados correctamente', 'success');
		} else if (form?.error) {
			showToastMessage(form.error, 'error');
		}
		if (form?.imageSuccess) {
			showToastMessage('Imagen actualizada correctamente', 'success');
		} else if (form?.imageError) {
			showToastMessage(form.imageError, 'error');
		}
	});

	function showToastMessage(message: string, type: 'success' | 'error') {
		toastMessage = message;
		toastType = type;
		showToast = true;
		setTimeout(() => (showToast = false), 3000);
	}

	const statusOptions = [
		{ value: 'draft', name: 'Borrador' },
		{ value: 'published', name: 'Publicado' },
		{ value: 'archived', name: 'Archivado' }
	];

	// Get status color
	function getStatusColor(s: string): 'green' | 'yellow' | 'gray' {
		switch (s) {
			case 'published':
				return 'green';
			case 'draft':
				return 'yellow';
			case 'archived':
				return 'gray';
			default:
				return 'gray';
		}
	}

	// Handle file selection for image upload form
	function handleFileSelect(event: Event) {
		const input = event.target as HTMLInputElement;
		if (input.files && input.files[0]) {
			// Auto-submit the form when a file is selected
			const form = input.closest('form');
			if (form) {
				form.requestSubmit();
			}
		}
	}

	function handleDrop(event: DragEvent) {
		event.preventDefault();
		dragOver = false;
		if (event.dataTransfer?.files && event.dataTransfer.files[0] && imageInputRef) {
			// Create a DataTransfer to set files on input
			const dt = new DataTransfer();
			dt.items.add(event.dataTransfer.files[0]);
			imageInputRef.files = dt.files;
			// Trigger submit
			const form = imageInputRef.closest('form');
			if (form) {
				form.requestSubmit();
			}
		}
	}

	function handleDragOver(event: DragEvent) {
		event.preventDefault();
		dragOver = true;
	}

	function handleDragLeave() {
		dragOver = false;
	}

	const defaultCourseImage = '/images/default-course.jpg';
</script>

<div class="space-y-8">
	<!-- Page Header -->
	<div class="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
		<div>
			<h1 class="text-2xl font-bold text-gray-900 dark:text-white">Configuración del curso</h1>
			<p class="mt-1 text-gray-500 dark:text-gray-400">
				Personaliza la identidad y configuración de tu curso
			</p>
		</div>
		<Badge color={getStatusColor(status)} class="self-start sm:self-center">
			{statusOptions.find((s) => s.value === status)?.name || status}
		</Badge>
	</div>

	<!-- Main Grid Layout -->
	<div class="grid grid-cols-1 gap-8 xl:grid-cols-3">
		<!-- Left Column - Main Form -->
		<div class="space-y-6 xl:col-span-2">
			<!-- Course Image Section -->
			<div class="rounded-2xl bg-white p-6 shadow-sm dark:bg-gray-800">
				<div class="mb-4 flex items-center gap-3">
					<div class="flex h-10 w-10 items-center justify-center rounded-xl bg-purple-100 dark:bg-purple-900/30">
						<ImageIcon class="h-5 w-5 text-purple-600 dark:text-purple-400" />
					</div>
					<div>
						<h2 class="font-semibold text-gray-900 dark:text-white">Imagen del curso</h2>
						<p class="text-sm text-gray-500 dark:text-gray-400">
							Esta imagen se mostrará en las tarjetas y banners
						</p>
					</div>
				</div>

				<form
					method="POST"
					action="?/uploadImage"
					enctype="multipart/form-data"
					use:enhance={() => {
						isUploadingImage = true;
						return async ({ update }) => {
							isUploadingImage = false;
							await update();
							await invalidateAll();
						};
					}}
					class="grid gap-6 md:grid-cols-2"
				>
					<!-- Current Image Preview -->
					<div class="relative overflow-hidden rounded-xl">
						<img
							src={imagePreview || defaultCourseImage}
							alt={data.course.name}
							class="h-48 w-full object-cover"
						/>
						<div class="absolute inset-0 bg-gradient-to-t from-black/50 to-transparent"></div>
						<div class="absolute bottom-3 left-3">
							<span class="rounded-lg bg-white/90 px-2 py-1 text-xs font-medium text-gray-700">
								Vista previa
							</span>
						</div>
					</div>

					<!-- Upload Area -->
					<div
						role="button"
						tabindex="0"
						ondrop={handleDrop}
						ondragover={handleDragOver}
						ondragleave={handleDragLeave}
						onkeydown={(e) => e.key === 'Enter' && imageInputRef?.click()}
						class="relative flex h-48 cursor-pointer flex-col items-center justify-center rounded-xl border-2 border-dashed transition-all {dragOver
							? 'border-purple-500 bg-purple-50 dark:bg-purple-900/20'
							: 'border-gray-300 bg-gray-50 hover:border-gray-400 hover:bg-gray-100 dark:border-gray-600 dark:bg-gray-700/50 dark:hover:border-gray-500'}"
					>
						{#if isUploadingImage}
							<div class="flex flex-col items-center">
								<div class="mb-3 h-10 w-10 animate-spin rounded-full border-4 border-purple-200 border-t-purple-600"></div>
								<p class="text-sm font-medium text-gray-600 dark:text-gray-400">Subiendo imagen...</p>
							</div>
						{:else}
							<Upload class="mb-3 h-10 w-10 text-gray-400" />
							<p class="mb-1 text-sm font-medium text-gray-600 dark:text-gray-400">
								Arrastra una imagen aquí
							</p>
							<p class="text-xs text-gray-400">o haz clic para seleccionar</p>
							<p class="mt-2 text-xs text-gray-400">PNG, JPG hasta 5MB</p>
						{/if}
						<input
							type="file"
							name="image"
							accept="image/*"
							bind:this={imageInputRef}
							onchange={handleFileSelect}
							class="absolute inset-0 cursor-pointer opacity-0"
							disabled={isUploadingImage}
						/>
					</div>
				</form>
			</div>

			<!-- Course Details Form -->
			<div class="rounded-2xl bg-white p-6 shadow-sm dark:bg-gray-800">
				<div class="mb-6 flex items-center gap-3">
					<div class="flex h-10 w-10 items-center justify-center rounded-xl bg-blue-100 dark:bg-blue-900/30">
						<FileText class="h-5 w-5 text-blue-600 dark:text-blue-400" />
					</div>
					<div>
						<h2 class="font-semibold text-gray-900 dark:text-white">Información del curso</h2>
						<p class="text-sm text-gray-500 dark:text-gray-400">
							Datos básicos que verán los estudiantes
						</p>
					</div>
				</div>

				<form
					method="POST"
					action="?/updateCourse"
					use:enhance={() => {
						isSaving = true;
						return async ({ update }) => {
							isSaving = false;
							await update();
							await invalidateAll();
						};
					}}
					class="space-y-6"
				>
					<!-- Course Name -->
					<div>
						<Label for="name" class="mb-2 flex items-center gap-2 text-sm font-medium">
							Nombre del curso
							<span class="text-red-500">*</span>
						</Label>
						<Input
							id="name"
							name="name"
							type="text"
							bind:value={name}
							placeholder="Ej: Introducción a la Programación"
							required
							class="!rounded-xl !py-3 transition-all focus:!ring-2 focus:!ring-blue-500/20"
						/>
						<p class="mt-1.5 text-xs text-gray-400">
							Un nombre claro y descriptivo ayuda a los estudiantes a identificar el curso
						</p>
					</div>

					<!-- Course Description -->
					<div>
						<Label for="description" class="mb-2 flex items-center gap-2 text-sm font-medium">
							Descripción
						</Label>
						<Textarea
							id="description"
							name="description"
							bind:value={description}
							rows={5}
							placeholder="Describe los objetivos, contenidos y metodología del curso..."
							class="!rounded-xl !py-3 transition-all focus:!ring-2 focus:!ring-blue-500/20"
						/>
						<div class="mt-1.5 flex items-center justify-between">
							<p class="text-xs text-gray-400">
								Una buena descripción aumenta el interés de los estudiantes
							</p>
							<span class="text-xs text-gray-400">{description.length} caracteres</span>
						</div>
					</div>

					<!-- Course Status -->
					<div>
						<Label for="status" class="mb-2 flex items-center gap-2 text-sm font-medium">
							Estado del curso
						</Label>
						<Select
							id="status"
							name="status"
							bind:value={status}
							items={statusOptions}
							class="!rounded-xl"
						/>
						<div class="mt-3 rounded-xl bg-gray-50 p-4 dark:bg-gray-700/50">
							{#if status === 'draft'}
								<div class="flex items-start gap-3">
									<AlertCircle class="mt-0.5 h-5 w-5 shrink-0 text-yellow-500" />
									<div>
										<p class="font-medium text-gray-900 dark:text-white">Modo borrador</p>
										<p class="text-sm text-gray-500 dark:text-gray-400">
											El curso no será visible para los estudiantes. Solo los administradores y profesores asignados pueden verlo.
										</p>
									</div>
								</div>
							{:else if status === 'published'}
								<div class="flex items-start gap-3">
									<CheckCircle class="mt-0.5 h-5 w-5 shrink-0 text-green-500" />
									<div>
										<p class="font-medium text-gray-900 dark:text-white">Curso publicado</p>
										<p class="text-sm text-gray-500 dark:text-gray-400">
											Los estudiantes inscritos pueden acceder al curso y sus actividades.
										</p>
									</div>
								</div>
							{:else if status === 'archived'}
								<div class="flex items-start gap-3">
									<X class="mt-0.5 h-5 w-5 shrink-0 text-gray-400" />
									<div>
										<p class="font-medium text-gray-900 dark:text-white">Curso archivado</p>
										<p class="text-sm text-gray-500 dark:text-gray-400">
											El curso está archivado y no es accesible. Los datos se conservan pero no está disponible.
										</p>
									</div>
								</div>
							{/if}
						</div>
					</div>

					<!-- Submit Button -->
					<div class="flex justify-end gap-3 border-t border-gray-100 pt-6 dark:border-gray-700">
						<Button href="/admin/courses/{data.course.id}" color="alternative" class="!rounded-xl">
							Cancelar
						</Button>
						<Button type="submit" color="primary" disabled={isSaving} class="!rounded-xl !px-6">
							{#if isSaving}
								<div class="mr-2 h-4 w-4 animate-spin rounded-full border-2 border-white/30 border-t-white"></div>
								Guardando...
							{:else}
								<Save class="mr-2 h-4 w-4" />
								Guardar cambios
							{/if}
						</Button>
					</div>
				</form>
			</div>
		</div>

		<!-- Right Column - Info Cards -->
		<div class="space-y-6">
			<!-- Course Info Card -->
			<div class="rounded-2xl bg-white p-6 shadow-sm dark:bg-gray-800">
				<h3 class="mb-4 font-semibold text-gray-900 dark:text-white">Información del sistema</h3>
				<div class="space-y-4">
					<div class="flex items-center gap-3">
						<div class="flex h-9 w-9 items-center justify-center rounded-lg bg-gray-100 dark:bg-gray-700">
							<Hash class="h-4 w-4 text-gray-500 dark:text-gray-400" />
						</div>
						<div class="min-w-0 flex-1">
							<p class="text-xs font-medium text-gray-500 dark:text-gray-400">ID del curso</p>
							<p class="truncate font-mono text-sm text-gray-900 dark:text-white">
								{data.course.id}
							</p>
						</div>
					</div>

					<div class="flex items-center gap-3">
						<div class="flex h-9 w-9 items-center justify-center rounded-lg bg-gray-100 dark:bg-gray-700">
							<Calendar class="h-4 w-4 text-gray-500 dark:text-gray-400" />
						</div>
						<div>
							<p class="text-xs font-medium text-gray-500 dark:text-gray-400">Fecha de creación</p>
							<p class="text-sm text-gray-900 dark:text-white">
								{data.course.createdAt
									? new Date(data.course.createdAt).toLocaleDateString('es-ES', {
											year: 'numeric',
											month: 'long',
											day: 'numeric'
										})
									: 'No disponible'}
							</p>
						</div>
					</div>

					<div class="flex items-center gap-3">
						<div class="flex h-9 w-9 items-center justify-center rounded-lg bg-gray-100 dark:bg-gray-700">
							<Clock class="h-4 w-4 text-gray-500 dark:text-gray-400" />
						</div>
						<div>
							<p class="text-xs font-medium text-gray-500 dark:text-gray-400">Última modificación</p>
							<p class="text-sm text-gray-900 dark:text-white">
								{data.course.updatedAt
									? new Date(data.course.updatedAt).toLocaleDateString('es-ES', {
											year: 'numeric',
											month: 'long',
											day: 'numeric',
											hour: '2-digit',
											minute: '2-digit'
										})
									: 'No disponible'}
							</p>
						</div>
					</div>
				</div>
			</div>

			<!-- Quick Stats Card -->
			<div class="rounded-2xl bg-gradient-to-br from-blue-500 to-purple-600 p-6 text-white shadow-sm">
				<h3 class="mb-4 font-semibold">Resumen del curso</h3>
				<div class="grid grid-cols-2 gap-4">
					<div class="rounded-xl bg-white/20 p-3 backdrop-blur-sm">
						<p class="text-2xl font-bold">{data.teachers?.length || 0}</p>
						<p class="text-sm text-white/80">Profesores</p>
					</div>
					<div class="rounded-xl bg-white/20 p-3 backdrop-blur-sm">
						<p class="text-2xl font-bold">{data.students?.length || 0}</p>
						<p class="text-sm text-white/80">Estudiantes</p>
					</div>
					<div class="col-span-2 rounded-xl bg-white/20 p-3 backdrop-blur-sm">
						<p class="text-2xl font-bold">{data.interactives?.length || 0}</p>
						<p class="text-sm text-white/80">Actividades</p>
					</div>
				</div>
			</div>

			<!-- Quick Links -->
			<div class="rounded-2xl bg-white p-6 shadow-sm dark:bg-gray-800">
				<h3 class="mb-4 font-semibold text-gray-900 dark:text-white">Accesos rápidos</h3>
				<div class="space-y-2">
					<a
						href="/admin/courses/{data.course.id}/teachers"
						class="flex items-center gap-3 rounded-xl p-3 transition-colors hover:bg-gray-50 dark:hover:bg-gray-700"
					>
						<div class="flex h-9 w-9 items-center justify-center rounded-lg bg-blue-100 dark:bg-blue-900/30">
							<span class="text-sm font-bold text-blue-600 dark:text-blue-400">P</span>
						</div>
						<span class="text-sm font-medium text-gray-700 dark:text-gray-300">Gestionar profesores</span>
					</a>
					<a
						href="/admin/courses/{data.course.id}/students"
						class="flex items-center gap-3 rounded-xl p-3 transition-colors hover:bg-gray-50 dark:hover:bg-gray-700"
					>
						<div class="flex h-9 w-9 items-center justify-center rounded-lg bg-green-100 dark:bg-green-900/30">
							<span class="text-sm font-bold text-green-600 dark:text-green-400">E</span>
						</div>
						<span class="text-sm font-medium text-gray-700 dark:text-gray-300">Gestionar estudiantes</span>
					</a>
					<a
						href="/admin/courses/{data.course.id}/interactives"
						class="flex items-center gap-3 rounded-xl p-3 transition-colors hover:bg-gray-50 dark:hover:bg-gray-700"
					>
						<div class="flex h-9 w-9 items-center justify-center rounded-lg bg-purple-100 dark:bg-purple-900/30">
							<span class="text-sm font-bold text-purple-600 dark:text-purple-400">A</span>
						</div>
						<span class="text-sm font-medium text-gray-700 dark:text-gray-300">Ver actividades</span>
					</a>
				</div>
			</div>
		</div>
	</div>
</div>

<!-- Toast notification -->
{#if showToast}
	<div class="fixed right-4 bottom-4 z-50">
		<Toast color={toastType === 'success' ? 'green' : 'red'}>
			{#snippet icon()}
				{#if toastType === 'success'}
					<CheckCircle class="h-5 w-5" />
				{:else}
					<AlertCircle class="h-5 w-5" />
				{/if}
			{/snippet}
			{toastMessage}
		</Toast>
	</div>
{/if}
