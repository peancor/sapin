<script lang="ts">
	import { Button, Label, Input, Textarea, Avatar, Badge } from 'flowbite-svelte';
	import {
		ArrowLeftOutline,
		ArrowRightOutline,
		CheckOutline,
		BookOpenSolid,
		UsersSolid,
		CogSolid,
		StarSolid,
		GraduationCapSolid,
		GridSolid,
		ClipboardListSolid,
		SearchOutline,
		CloseOutline
	} from 'flowbite-svelte-icons';
	import type { PageData } from './$types';
	import { goto, invalidateAll } from '$app/navigation';

	let { data }: { data: PageData } = $props();

	// Stepper state
	let currentStep = $state(1);
	const totalSteps = 4;

	// Form data
	let courseData = $state({
		name: '',
		description: '',
		teacherIds: [] as string[],
		settings: {
			allowEnrollment: true,
			showProgress: true,
			enableDiscussions: false,
			requireApproval: false
		},
		style: {
			color: 'blue',
			icon: 'book'
		}
	});

	let isLoading = $state(false);
	let nameError = $state('');

	// Color palette for course
	const colorOptions = [
		{
			id: 'blue',
			bg: 'from-blue-500 to-indigo-600',
			light: 'bg-blue-100 dark:bg-blue-900/30',
			text: 'text-blue-600 dark:text-blue-400'
		},
		{
			id: 'purple',
			bg: 'from-purple-500 to-pink-600',
			light: 'bg-purple-100 dark:bg-purple-900/30',
			text: 'text-purple-600 dark:text-purple-400'
		},
		{
			id: 'emerald',
			bg: 'from-emerald-500 to-teal-600',
			light: 'bg-emerald-100 dark:bg-emerald-900/30',
			text: 'text-emerald-600 dark:text-emerald-400'
		},
		{
			id: 'orange',
			bg: 'from-orange-500 to-red-600',
			light: 'bg-orange-100 dark:bg-orange-900/30',
			text: 'text-orange-600 dark:text-orange-400'
		},
		{
			id: 'rose',
			bg: 'from-rose-500 to-pink-600',
			light: 'bg-rose-100 dark:bg-rose-900/30',
			text: 'text-rose-600 dark:text-rose-400'
		},
		{
			id: 'cyan',
			bg: 'from-cyan-500 to-blue-600',
			light: 'bg-cyan-100 dark:bg-cyan-900/30',
			text: 'text-cyan-600 dark:text-cyan-400'
		}
	];

	// Icon options for course
	const iconOptions = [
		{ id: 'book', icon: BookOpenSolid, label: 'Libro' },
		{ id: 'academic', icon: GraduationCapSolid, label: 'Académico' },
		{ id: 'grid', icon: GridSolid, label: 'Módulos' },
		{ id: 'clipboard', icon: ClipboardListSolid, label: 'Tareas' },
		{ id: 'star', icon: StarSolid, label: 'Destacado' },
		{ id: 'cog', icon: CogSolid, label: 'Técnico' }
	];

	// Stepper steps configuration
	const steps = [
		{ id: 1, label: 'Identidad', description: 'Nombre y descripción' },
		{ id: 2, label: 'Equipo', description: 'Asignar profesores' },
		{ id: 3, label: 'Estilo', description: 'Personalización' },
		{ id: 4, label: 'Finalizar', description: 'Revisar y crear' }
	];

	// Selected color helper
	let selectedColor = $derived(
		colorOptions.find((c) => c.id === courseData.style.color) || colorOptions[0]
	);

	// Selected icon helper
	let selectedIcon = $derived(
		iconOptions.find((i) => i.id === courseData.style.icon) || iconOptions[0]
	);

	// Teacher search
	let teacherSearchTerm = $state('');

	// Filtered teachers based on search
	let filteredTeachers = $derived.by(() => {
		if (!teacherSearchTerm) return data.teachers;
		const term = teacherSearchTerm.toLowerCase();
		return data.teachers.filter(
			(t) =>
				t.username?.toLowerCase().includes(term) || t.email?.toLowerCase().includes(term)
		);
	});

	// Selected teachers
	let selectedTeachers = $derived(
		data.teachers.filter((t) => courseData.teacherIds.includes(t.id))
	);

	// Validation
	function validateStep(step: number): boolean {
		if (step === 1) {
			if (!courseData.name.trim()) {
				nameError = 'El nombre del curso es obligatorio';
				return false;
			}
			if (courseData.name.trim().length < 3) {
				nameError = 'El nombre debe tener al menos 3 caracteres';
				return false;
			}
			nameError = '';
		}
		return true;
	}

	// Navigation
	function nextStep() {
		if (validateStep(currentStep) && currentStep < totalSteps) {
			currentStep++;
		}
	}

	function prevStep() {
		if (currentStep > 1) {
			currentStep--;
		}
	}

	function goToStep(step: number) {
		if (step < currentStep || validateStep(currentStep)) {
			currentStep = step;
		}
	}

	// Toggle teacher selection
	function toggleTeacher(teacherId: string) {
		if (courseData.teacherIds.includes(teacherId)) {
			courseData.teacherIds = courseData.teacherIds.filter((id) => id !== teacherId);
		} else {
			courseData.teacherIds = [...courseData.teacherIds, teacherId];
		}
	}

	// Create course
	async function createCourse() {
		if (!validateStep(currentStep)) return;

		isLoading = true;
		try {
			const response = await fetch('/api/courses', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({
					name: courseData.name,
					description: courseData.description,
					teacherIds: courseData.teacherIds
				})
			});

			if (response.ok) {
				await invalidateAll();
				goto('/admin/courses');
			}
		} finally {
			isLoading = false;
		}
	}

	// Get initials for avatar
	function getInitials(name: string): string {
		return name
			.split(' ')
			.map((n) => n[0])
			.join('')
			.toUpperCase()
			.slice(0, 2);
	}
</script>

<div class="min-h-screen bg-gray-50 dark:bg-gray-900">
	<!-- Header con navegación y progreso -->
	<div
		class="sticky top-0 z-10 border-b border-gray-200 bg-white dark:border-gray-700 dark:bg-gray-800"
	>
		<div class="mx-auto max-w-screen-2xl px-4 sm:px-6 lg:px-8">
			<div class="flex h-16 items-center justify-between">
				<!-- Back -->
				<a
					href="/admin/courses"
					class="flex items-center gap-2 text-gray-600 transition-colors hover:text-gray-900 dark:text-gray-400 dark:hover:text-white"
				>
					<ArrowLeftOutline class="h-5 w-5" />
					<span class="hidden font-medium sm:inline">Volver</span>
				</a>

				<!-- Steps indicator -->
				<div class="flex items-center gap-2 sm:gap-4">
					{#each steps as step (step.id)}
						<button
							type="button"
							onclick={() => goToStep(step.id)}
							class="group flex items-center gap-2"
						>
							<div
								class="flex h-8 w-8 items-center justify-center rounded-full text-sm font-semibold transition-all
                                {step.id === currentStep
									? 'bg-gradient-to-br ' + selectedColor.bg + ' text-white shadow-lg'
									: step.id < currentStep
										? 'bg-emerald-500 text-white'
										: 'bg-gray-200 text-gray-500 group-hover:bg-gray-300 dark:bg-gray-700 dark:text-gray-400 dark:group-hover:bg-gray-600'}"
							>
								{#if step.id < currentStep}
									<CheckOutline class="h-4 w-4" />
								{:else}
									{step.id}
								{/if}
							</div>
							<span
								class="hidden text-sm font-medium lg:block {step.id === currentStep
									? 'text-gray-900 dark:text-white'
									: 'text-gray-500 dark:text-gray-400'}"
							>
								{step.label}
							</span>
						</button>
						{#if step.id < steps.length}
							<div
								class="h-0.5 w-8 lg:w-12 {step.id < currentStep
									? 'bg-emerald-500'
									: 'bg-gray-200 dark:bg-gray-700'}"
							></div>
						{/if}
					{/each}
				</div>

				<!-- Preview mini -->
				<div class="hidden items-center gap-3 md:flex">
					<div
						class="h-10 w-10 rounded-xl bg-gradient-to-br {selectedColor.bg} flex items-center justify-center transition-all duration-300"
					>
						{#if selectedIcon}
							<svelte:component this={selectedIcon.icon} class="h-5 w-5 text-white" />
						{/if}
					</div>
					<div class="max-w-[150px]">
						<p class="truncate text-sm font-semibold text-gray-900 dark:text-white">
							{courseData.name || 'Nuevo curso'}
						</p>
						<p class="text-xs text-gray-500 dark:text-gray-400">
							Paso {currentStep} de {totalSteps}
						</p>
					</div>
				</div>
			</div>
		</div>
	</div>

	<!-- Main content -->
	<div class="mx-auto max-w-screen-2xl px-4 py-8 sm:px-6 lg:px-8 lg:py-12">
		<div class="grid grid-cols-1 gap-8 lg:gap-12 xl:grid-cols-3">
			<!-- Contenido principal -->
			<div class="xl:col-span-2">
				<!-- Step 1: Identity -->
				{#if currentStep === 1}
					<div class="animate-in fade-in duration-300">
						<div class="mb-8">
							<h2 class="text-2xl font-bold text-gray-900 lg:text-3xl dark:text-white">
								Dale identidad a tu curso
							</h2>
							<p class="mt-2 text-gray-500 dark:text-gray-400">
								Un buen nombre y descripción ayudan a los estudiantes a conectar
							</p>
						</div>

						<div class="grid grid-cols-1 gap-6 lg:grid-cols-2 lg:gap-8">
							<div class="lg:col-span-2">
								<Label for="course-name" class="mb-2 text-base font-semibold">
									Nombre del curso <span class="text-red-500">*</span>
								</Label>
								<Input
									id="course-name"
									type="text"
									placeholder="Ej: Introducción al Pensamiento Creativo"
									bind:value={courseData.name}
									class="!rounded-xl border-2 !px-5 !py-4 !text-lg transition-all focus:!ring-2 focus:!ring-blue-500/20 {nameError
										? '!border-red-500'
										: ''}"
								/>
								{#if nameError}
									<p class="mt-2 text-sm text-red-500">{nameError}</p>
								{/if}
							</div>

							<div class="lg:col-span-2">
								<Label for="course-desc" class="mb-2 text-base font-semibold">Descripción</Label>
								<Textarea								
									id="course-desc"
									placeholder="Describe los objetivos, metodología y lo que aprenderán los estudiantes..."
									rows={6}									
									bind:value={courseData.description}
									class="w-full resize-none !rounded-xl border-2 !px-5 !py-4 transition-all focus:!ring-2 focus:!ring-blue-500/20"
								/>
								<p class="mt-2 text-xs text-gray-400">
									💡 Una buena descripción aumenta el engagement de los estudiantes
								</p>
							</div>
						</div>
					</div>
				{/if}

				<!-- Step 2: Team -->
				{#if currentStep === 2}
					<div class="animate-in fade-in duration-300">
						<div class="mb-8">
							<h2 class="text-2xl font-bold text-gray-900 lg:text-3xl dark:text-white">
								Forma tu equipo docente
							</h2>
							<p class="mt-2 text-gray-500 dark:text-gray-400">
								Selecciona los profesores que colaborarán en este curso
							</p>
						</div>

						{#if selectedTeachers.length > 0}
							<div
								class="mb-6 flex flex-wrap gap-2 rounded-xl bg-emerald-50 p-4 dark:bg-emerald-900/20"
							>
								<span class="mr-2 text-sm font-medium text-emerald-700 dark:text-emerald-300"
									>Seleccionados:</span
								>
								{#each selectedTeachers as teacher (teacher.id)}
									<Badge color="green" class="!px-3 !py-1.5">
										{teacher.username}
										<button
											type="button"
											onclick={() => toggleTeacher(teacher.id)}
											class="ml-2 transition-colors hover:text-red-500"
										>
											×
										</button>
									</Badge>
								{/each}
							</div>
						{/if}

						<!-- Search Box -->
						<div class="mb-6">
							<div class="relative max-w-md">
								<div class="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-4">
									<SearchOutline class="h-5 w-5 text-gray-400" />
								</div>
								<input
									type="text"
									placeholder="Buscar profesor por nombre o email..."
									bind:value={teacherSearchTerm}
									class="w-full rounded-xl border border-gray-200 bg-white py-3 pl-12 pr-10 text-gray-900 placeholder-gray-400 transition-all focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 dark:border-gray-700 dark:bg-gray-800 dark:text-white"
								/>
								{#if teacherSearchTerm}
									<button
										type="button"
										onclick={() => (teacherSearchTerm = '')}
										class="absolute inset-y-0 right-0 flex items-center pr-4 text-gray-400 hover:text-gray-600"
									>
										<CloseOutline class="h-5 w-5" />
									</button>
								{/if}
							</div>
							{#if teacherSearchTerm && filteredTeachers.length === 0}
								<p class="mt-2 text-sm text-gray-500 dark:text-gray-400">
									No se encontraron profesores que coincidan con "{teacherSearchTerm}"
								</p>
							{:else if teacherSearchTerm}
								<p class="mt-2 text-sm text-gray-500 dark:text-gray-400">
									Mostrando {filteredTeachers.length} de {data.teachers.length} profesores
								</p>
							{/if}
						</div>

						<div class="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
							{#each filteredTeachers as teacher (teacher.id)}
								{@const isSelected = courseData.teacherIds.includes(teacher.id)}
								<button
									type="button"
									onclick={() => toggleTeacher(teacher.id)}
									class="group relative rounded-2xl border-2 p-4 text-left transition-all duration-200
                                                    {isSelected
										? 'border-emerald-500 bg-emerald-50 shadow-lg shadow-emerald-500/10 dark:bg-emerald-900/20'
										: 'border-gray-200 hover:border-gray-300 hover:shadow-md dark:border-gray-700 dark:hover:border-gray-600'}"
								>
									{#if isSelected}
										<div class="absolute top-2 right-2">
											<div
												class="flex h-6 w-6 items-center justify-center rounded-full bg-emerald-500"
											>
												<CheckOutline class="h-4 w-4 text-white" />
											</div>
										</div>
									{/if}

									<div class="flex items-center gap-3">
										{#if teacher.image}
											<Avatar
												src={teacher.image}
												size="md"
												class="ring-2 ring-white dark:ring-gray-800"
											/>
										{:else}
											<div
												class="flex h-10 w-10 items-center justify-center rounded-full bg-gradient-to-br from-gray-200 to-gray-300 dark:from-gray-700 dark:to-gray-600"
											>
												<span class="text-sm font-semibold text-gray-600 dark:text-gray-300">
													{getInitials(teacher.username)}
												</span>
											</div>
										{/if}
										<div class="min-w-0 flex-1">
											<p class="truncate font-semibold text-gray-900 dark:text-white">
												{teacher.username}
											</p>
											{#if teacher.email}
												<p class="truncate text-xs text-gray-500 dark:text-gray-400">
													{teacher.email}
												</p>
											{/if}
										</div>
									</div>
								</button>
							{/each}
						</div>

						{#if data.teachers.length === 0}
							<div class="rounded-2xl bg-gray-50 py-12 text-center dark:bg-gray-800/50">
								<div class="mb-4 inline-flex rounded-full bg-gray-100 p-4 dark:bg-gray-800">
									<UsersSolid class="h-8 w-8 text-gray-400" />
								</div>
								<p class="text-gray-500 dark:text-gray-400">
									No hay profesores disponibles para asignar
								</p>
							</div>
						{:else if filteredTeachers.length === 0 && teacherSearchTerm}
							<div class="rounded-2xl bg-gray-50 py-12 text-center dark:bg-gray-800/50">
								<div class="mb-4 inline-flex rounded-full bg-gray-100 p-4 dark:bg-gray-800">
									<SearchOutline class="h-8 w-8 text-gray-400" />
								</div>
								<p class="text-gray-500 dark:text-gray-400">
									No se encontraron profesores que coincidan con tu búsqueda
								</p>
								<button
									type="button"
									onclick={() => (teacherSearchTerm = '')}
									class="mt-3 text-sm font-medium text-blue-600 hover:text-blue-700 dark:text-blue-400"
								>
									Limpiar búsqueda
								</button>
							</div>
						{/if}

						<p class="mt-6 text-sm text-gray-400">
							💡 Puedes asignar profesores más tarde desde la configuración del curso
						</p>
					</div>
				{/if}

				<!-- Step 3: Style -->
				{#if currentStep === 3}
					<div class="animate-in fade-in duration-300">
						<div class="mb-8">
							<h2 class="text-2xl font-bold text-gray-900 lg:text-3xl dark:text-white">
								Dale estilo a tu curso
							</h2>
							<p class="mt-2 text-gray-500 dark:text-gray-400">Personaliza la apariencia visual</p>
						</div>

						<div class="grid grid-cols-1 gap-8 lg:grid-cols-2 lg:gap-12">
							<!-- Color Selection -->
							<div>
								<Label class="mb-4 block text-base font-semibold">Elige un color</Label>
								<div class="flex flex-wrap gap-3">
									{#each colorOptions as color (color.id)}
										<button
											type="button"
											onclick={() => (courseData.style.color = color.id)}
											class="relative h-12 w-12 rounded-2xl bg-gradient-to-br lg:h-14 lg:w-14 {color.bg} transition-all duration-200 hover:scale-110
                                                            {courseData.style.color === color.id
												? 'scale-110 ring-4 ring-gray-900 ring-offset-2 dark:ring-white'
												: ''}"
										>
											{#if courseData.style.color === color.id}
												<div class="absolute inset-0 flex items-center justify-center">
													<CheckOutline class="h-5 w-5 text-white lg:h-6 lg:w-6" />
												</div>
											{/if}
										</button>
									{/each}
								</div>
							</div>

							<!-- Icon Selection -->
							<div>
								<Label class="mb-4 block text-base font-semibold">Elige un icono</Label>
								<div class="grid gap-3 grid-cols-[repeat(auto-fit,minmax(96px,1fr))]">
									{#each iconOptions as iconOpt (iconOpt.id)}
										<button
											type="button"
											onclick={() => (courseData.style.icon = iconOpt.id)}
											class="flex flex-col items-center gap-2 rounded-2xl border-2 p-3 transition-all duration-200 lg:p-4
                                                            {courseData.style.icon === iconOpt.id
												? 'border-gray-900 bg-gray-100 dark:border-white dark:bg-gray-800'
												: 'border-gray-200 hover:border-gray-300 dark:border-gray-700 dark:hover:border-gray-600'}"
										>
											<svelte:component
												this={iconOpt.icon}
												class="h-5 w-5 text-gray-700 lg:h-6 lg:w-6 dark:text-gray-300"
											/>
											<span class="text-xs text-gray-600 dark:text-gray-400">{iconOpt.label}</span>
										</button>
									{/each}
								</div>
							</div>
						</div>
					</div>
				{/if}

				<!-- Step 4: Review -->
				{#if currentStep === 4}
					<div class="animate-in fade-in duration-300">
						<div class="mb-8">
							<h2 class="text-2xl font-bold text-gray-900 lg:text-3xl dark:text-white">
								¡Todo listo!
							</h2>
							<p class="mt-2 text-gray-500 dark:text-gray-400">
								Revisa los detalles antes de crear el curso
							</p>
						</div>

						<!-- Summary grid -->
						<div class="grid grid-cols-1 gap-6 md:grid-cols-2">
							<div class="space-y-4">
								<div>
									<p class="mb-1 text-xs tracking-wider text-gray-400 uppercase">Nombre</p>
									<p class="text-lg font-semibold text-gray-900 dark:text-white">
										{courseData.name || 'Sin nombre'}
									</p>
								</div>
								<div>
									<p class="mb-1 text-xs tracking-wider text-gray-400 uppercase">Descripción</p>
									<p class="text-gray-600 dark:text-gray-400">
										{courseData.description || 'Sin descripción'}
									</p>
								</div>
							</div>
							<div class="space-y-4">
								<div>
									<p class="mb-2 text-xs tracking-wider text-gray-400 uppercase">Equipo docente</p>
									{#if selectedTeachers.length > 0}
										<div class="flex flex-wrap gap-2">
											{#each selectedTeachers as teacher (teacher.id)}
												<Badge color="gray">{teacher.username}</Badge>
											{/each}
										</div>
									{:else}
										<p class="text-sm text-gray-500 dark:text-gray-400">Sin profesores asignados</p>
									{/if}
								</div>
								<div>
									<p class="mb-2 text-xs tracking-wider text-gray-400 uppercase">Estilo visual</p>
									<div class="flex items-center gap-3">
										<div
											class="h-10 w-10 rounded-xl bg-gradient-to-br {selectedColor.bg} flex items-center justify-center"
										>
											{#if selectedIcon}
												<svelte:component this={selectedIcon.icon} class="h-5 w-5 text-white" />
											{/if}
										</div>
										<span class="text-sm text-gray-600 capitalize dark:text-gray-400"
											>{selectedColor.id} · {selectedIcon?.label}</span
										>
									</div>
								</div>
							</div>
						</div>
					</div>
				{/if}
			</div>

			<!-- Sidebar derecho - Preview del curso (solo visible en xl+) -->
			<div class="hidden xl:block xl:col-span-1">
				<div class="space-y-6 xl:sticky xl:top-24">
					<!-- Preview -->
					<div
						class="overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-sm dark:border-gray-700 dark:bg-gray-800"
					>
						<div class="h-24 bg-gradient-to-br {selectedColor.bg} relative">
							<div class="absolute -bottom-5 left-5">
								<div
									class="flex h-12 w-12 items-center justify-center rounded-xl bg-white shadow-lg dark:bg-gray-800"
								>
									{#if selectedIcon}
										<svelte:component
											this={selectedIcon.icon}
											class="h-6 w-6 {selectedColor.text}"
										/>
									{/if}
								</div>
							</div>
						</div>
						<div class="p-5 pt-8">
							<h3 class="truncate font-bold text-gray-900 dark:text-white">
								{courseData.name || 'Nombre del curso'}
							</h3>
							<p class="mt-1 line-clamp-2 text-sm text-gray-500 dark:text-gray-400">
								{courseData.description || 'Descripción del curso...'}
							</p>
							{#if selectedTeachers.length > 0}
								<div
									class="mt-4 flex items-center gap-2 border-t border-gray-100 pt-4 dark:border-gray-700"
								>
									<div class="flex -space-x-2">
										{#each selectedTeachers.slice(0, 3) as teacher (teacher.id)}
											<div
												class="flex h-6 w-6 items-center justify-center rounded-full bg-gray-300 ring-2 ring-white dark:bg-gray-600 dark:ring-gray-800"
											>
												<span class="text-xs font-medium">{getInitials(teacher.username)}</span>
											</div>
										{/each}
									</div>
									<span class="text-xs text-gray-500"
										>{selectedTeachers.length} profesor{selectedTeachers.length !== 1
											? 'es'
											: ''}</span
									>
								</div>
							{/if}
						</div>
					</div>

					<!-- Info -->
					<p class="text-center text-xs text-gray-400">Vista previa del curso</p>
				</div>
			</div>
		</div>

		<!-- Spacer para el footer fijo -->
		<div class="h-20"></div>
	</div>
</div>

<!-- Footer fijo con acciones -->
<div
	class="fixed right-0 bottom-0 left-0 z-10 border-t border-gray-200 bg-white dark:border-gray-700 dark:bg-gray-800"
>
	<div class="mx-auto max-w-screen-2xl px-4 sm:px-6 lg:px-8">
		<div class="flex h-16 items-center justify-between">
			<Button color="light" onclick={prevStep} disabled={currentStep === 1}>
				<ArrowLeftOutline class="me-2 h-4 w-4" />
				Anterior
			</Button>

			<div class="hidden items-center gap-2 text-sm text-gray-500 sm:flex">
				Paso {currentStep} de {totalSteps}
			</div>

			{#if currentStep < totalSteps}
				<Button color="blue" onclick={nextStep} class="bg-gradient-to-r {selectedColor.bg}">
					Siguiente
					<ArrowRightOutline class="ms-2 h-4 w-4" />
				</Button>
			{:else}
				<Button
					color="green"
					onclick={createCourse}
					disabled={isLoading || !courseData.name.trim()}
				>
					{#if isLoading}
						<div
							class="me-2 h-4 w-4 animate-spin rounded-full border-2 border-white/30 border-t-white"
						></div>
						Creando...
					{:else}
						<CheckOutline class="me-2 h-5 w-5" />
						Crear Curso
					{/if}
				</Button>
			{/if}
		</div>
	</div>
</div>

<style>
	@keyframes fade-in {
		from {
			opacity: 0;
			transform: translateY(10px);
		}
		to {
			opacity: 1;
			transform: translateY(0);
		}
	}

	.animate-in {
		animation: fade-in 0.3s ease-out forwards;
	}
</style>
