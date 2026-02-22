<script lang="ts">
	import { Modal, Button, Badge } from 'flowbite-svelte';
	import { fly, fade } from 'svelte/transition';
	import { quintOut } from 'svelte/easing';

	interface Props {
		open: boolean;
		role: string;
		onroleUpdate?: (role: string) => void;
		onclose?: () => void;
	}

	let { open = $bindable(), role, onroleUpdate, onclose }: Props = $props();

	// Estados
	let currentStep = $state(1);
	let selectedArchetype = $state<RoleArchetype | null>(null);
	let selectedPersonality = $state<string[]>([]);
	let selectedApproach = $state<TeachingApproach | null>(null);
	let customizations = $state({
		name: '',
		subject: '',
		ageGroup: 'teens',
		specialNeeds: [] as string[],
		tone: 'friendly'
	});
	let generatedRole = $state('');
	let isGenerating = $state(false);

	// Arquetipos de roles educativos basados en investigación pedagógica
	interface RoleArchetype {
		id: string;
		name: string;
		icon: string;
		description: string;
		basePrompt: string;
		pedagogicalBasis: string;
		bestFor: string[];
		color: string;
	}

	interface TeachingApproach {
		id: string;
		name: string;
		description: string;
		icon: string;
		techniques: string[];
	}

	const roleArchetypes: RoleArchetype[] = [
		{
			id: 'socratic-guide',
			name: 'Guía Socrático',
			icon: '🏛️',
			description: 'Facilita el aprendizaje mediante preguntas que estimulan el pensamiento crítico',
			basePrompt: 'Un guía paciente y reflexivo que nunca da respuestas directas, sino que formula preguntas perspicaces que llevan al estudiante a descubrir el conocimiento por sí mismo.',
			pedagogicalBasis: 'Método Socrático / Mayéutica',
			bestFor: ['Filosofía', 'Ética', 'Pensamiento crítico', 'Debate'],
			color: 'blue'
		},
		{
			id: 'mentor-coach',
			name: 'Mentor Coach',
			icon: '🎯',
			description: 'Acompaña el desarrollo personal y académico con metas claras',
			basePrompt: 'Un mentor motivador que establece metas claras, celebra los logros y ayuda a superar obstáculos con estrategias prácticas y apoyo emocional.',
			pedagogicalBasis: 'Coaching Educativo / Zona de Desarrollo Próximo (Vygotsky)',
			bestFor: ['Desarrollo personal', 'Proyectos', 'Habilidades blandas'],
			color: 'green'
		},
		{
			id: 'expert-tutor',
			name: 'Tutor Experto',
			icon: '📚',
			description: 'Domina la materia y adapta explicaciones al nivel del estudiante',
			basePrompt: 'Un experto en la materia que domina profundamente los conceptos y puede explicarlos de múltiples formas, adaptándose al nivel y estilo de aprendizaje del estudiante.',
			pedagogicalBasis: 'Instrucción Diferenciada / Teoría de las Inteligencias Múltiples',
			bestFor: ['Matemáticas', 'Ciencias', 'Idiomas', 'Materias técnicas'],
			color: 'purple'
		},
		{
			id: 'creative-facilitator',
			name: 'Facilitador Creativo',
			icon: '🎨',
			description: 'Inspira la creatividad y el pensamiento divergente',
			basePrompt: 'Un facilitador entusiasta que fomenta la experimentación, celebra ideas originales y conecta conceptos de formas inesperadas para despertar la creatividad.',
			pedagogicalBasis: 'Pensamiento de Diseño / Aprendizaje Basado en la Creatividad',
			bestFor: ['Arte', 'Diseño', 'Escritura creativa', 'Innovación'],
			color: 'pink'
		},
		{
			id: 'scientific-investigator',
			name: 'Investigador Científico',
			icon: '🔬',
			description: 'Guía el descubrimiento mediante el método científico',
			basePrompt: 'Un investigador curioso que guía al estudiante a formular hipótesis, diseñar experimentos, analizar datos y llegar a conclusiones basadas en evidencia.',
			pedagogicalBasis: 'Aprendizaje por Indagación / Método Científico',
			bestFor: ['Ciencias naturales', 'Investigación', 'Análisis de datos'],
			color: 'cyan'
		},
		{
			id: 'storyteller',
			name: 'Narrador Histórico',
			icon: '📖',
			description: 'Enseña a través de historias y conexiones narrativas',
			basePrompt: 'Un narrador cautivador que teje historias fascinantes alrededor de los conceptos, conectando el aprendizaje con experiencias humanas memorables.',
			pedagogicalBasis: 'Aprendizaje Narrativo / Storytelling Educativo',
			bestFor: ['Historia', 'Literatura', 'Ciencias sociales', 'Cultura'],
			color: 'amber'
		},
		{
			id: 'game-master',
			name: 'Director de Juego',
			icon: '🎮',
			description: 'Convierte el aprendizaje en una aventura gamificada',
			basePrompt: 'Un director de juego entusiasta que presenta desafíos, otorga puntos y logros, y convierte cada lección en una aventura emocionante con niveles y recompensas.',
			pedagogicalBasis: 'Gamificación / Aprendizaje Basado en Juegos',
			bestFor: ['Cualquier materia', 'Motivación', 'Práctica repetitiva'],
			color: 'red'
		},
		{
			id: 'practical-mentor',
			name: 'Mentor Práctico',
			icon: '🛠️',
			description: 'Conecta teoría con aplicaciones del mundo real',
			basePrompt: 'Un mentor con experiencia práctica que siempre conecta los conceptos teóricos con aplicaciones reales, casos de estudio y proyectos concretos.',
			pedagogicalBasis: 'Aprendizaje Basado en Problemas / Aprendizaje Experiencial',
			bestFor: ['Tecnología', 'Negocios', 'Oficios', 'Profesiones'],
			color: 'orange'
		}
	];

	const teachingApproaches: TeachingApproach[] = [
		{
			id: 'scaffolding',
			name: 'Andamiaje',
			description: 'Apoyo gradual que se reduce conforme el estudiante gana competencia',
			icon: '🏗️',
			techniques: ['Modelado paso a paso', 'Pistas progresivas', 'Retroalimentación inmediata']
		},
		{
			id: 'discovery',
			name: 'Descubrimiento Guiado',
			description: 'El estudiante descubre conceptos con guía sutil del tutor',
			icon: '🔍',
			techniques: ['Preguntas orientadoras', 'Experimentos mentales', 'Exploración estructurada']
		},
		{
			id: 'mastery',
			name: 'Dominio Progresivo',
			description: 'Avance solo cuando se demuestra dominio del tema actual',
			icon: '📈',
			techniques: ['Evaluación continua', 'Práctica deliberada', 'Retroalimentación correctiva']
		},
		{
			id: 'collaborative',
			name: 'Diálogo Colaborativo',
			description: 'Construcción conjunta del conocimiento mediante diálogo',
			icon: '💬',
			techniques: ['Pensamiento en voz alta', 'Co-construcción', 'Reflexión compartida']
		},
		{
			id: 'challenge-based',
			name: 'Basado en Retos',
			description: 'Aprendizaje mediante la resolución de desafíos motivadores',
			icon: '🏆',
			techniques: ['Retos graduados', 'Competencias amigables', 'Logros desbloqueables']
		}
	];

	const personalityTraits = [
		{ id: 'patient', label: 'Paciente', icon: '🧘' },
		{ id: 'enthusiastic', label: 'Entusiasta', icon: '✨' },
		{ id: 'humorous', label: 'Con humor', icon: '😄' },
		{ id: 'empathetic', label: 'Empático', icon: '💝' },
		{ id: 'rigorous', label: 'Riguroso', icon: '📐' },
		{ id: 'encouraging', label: 'Alentador', icon: '💪' },
		{ id: 'curious', label: 'Curioso', icon: '🤔' },
		{ id: 'creative', label: 'Creativo', icon: '🌈' }
	];

	const ageGroups = [
		{ id: 'kids', label: 'Niños (5-10 años)', description: 'Lenguaje simple, ejemplos cotidianos, mucha visualización' },
		{ id: 'tweens', label: 'Preadolescentes (11-13)', description: 'Referencias actuales, retos motivadores, autonomía guiada' },
		{ id: 'teens', label: 'Adolescentes (14-17)', description: 'Pensamiento crítico, conexiones con intereses, respeto a su perspectiva' },
		{ id: 'young-adults', label: 'Jóvenes adultos (18-25)', description: 'Enfoque profesional, aplicaciones prácticas, autonomía' },
		{ id: 'adults', label: 'Adultos (26+)', description: 'Contenido profundo, respeto a experiencia previa, flexibilidad' }
	];

	const toneOptions = [
		{ id: 'friendly', label: 'Amigable y cercano', emoji: '😊' },
		{ id: 'professional', label: 'Profesional y formal', emoji: '👔' },
		{ id: 'playful', label: 'Juguetón y divertido', emoji: '🎉' },
		{ id: 'inspiring', label: 'Inspirador y motivador', emoji: '🌟' },
		{ id: 'calm', label: 'Calmado y tranquilo', emoji: '🌿' }
	];

	const specialNeedsOptions = [
		{ id: 'dyslexia', label: 'Dislexia', tip: 'Textos más cortos, evitar bloques densos' },
		{ id: 'adhd', label: 'TDAH', tip: 'Contenido segmentado, variedad de actividades' },
		{ id: 'anxiety', label: 'Ansiedad', tip: 'Ambiente sin presión, ritmo flexible' },
		{ id: 'gifted', label: 'Altas capacidades', tip: 'Retos avanzados, profundización' },
		{ id: 'esl', label: 'Español como segunda lengua', tip: 'Vocabulario claro, apoyo visual' }
	];

	function selectArchetype(archetype: RoleArchetype) {
		selectedArchetype = archetype;
	}

	function togglePersonality(traitId: string) {
		if (selectedPersonality.includes(traitId)) {
			selectedPersonality = selectedPersonality.filter(t => t !== traitId);
		} else if (selectedPersonality.length < 3) {
			selectedPersonality = [...selectedPersonality, traitId];
		}
	}

	function toggleSpecialNeed(needId: string) {
		if (customizations.specialNeeds.includes(needId)) {
			customizations.specialNeeds = customizations.specialNeeds.filter(n => n !== needId);
		} else {
			customizations.specialNeeds = [...customizations.specialNeeds, needId];
		}
	}

	function generateRole() {
		if (!selectedArchetype) return;

		isGenerating = true;
		
		let roleText = '';
		
		const roleName = customizations.name || selectedArchetype.name;
		roleText += `<h3>${roleName}</h3>\n\n`;
		
		roleText += `<p>${selectedArchetype.basePrompt}</p>\n\n`;
		
		if (selectedPersonality.length > 0) {
			const traits = selectedPersonality.map(id => 
				personalityTraits.find(t => t.id === id)?.label
			).filter(Boolean);
			roleText += `<p><strong>Personalidad:</strong> ${traits.join(', ')}.</p>\n\n`;
		}
		
		if (selectedApproach) {
			roleText += `<p><strong>Metodología:</strong> Utiliza el enfoque de ${selectedApproach.name.toLowerCase()} - ${selectedApproach.description.toLowerCase()}.</p>\n`;
			roleText += `<p><strong>Técnicas principales:</strong></p>\n<ul>\n`;
			selectedApproach.techniques.forEach(t => {
				roleText += `<li>${t}</li>\n`;
			});
			roleText += `</ul>\n\n`;
		}
		
		const ageGroup = ageGroups.find(a => a.id === customizations.ageGroup);
		if (ageGroup) {
			roleText += `<p><strong>Audiencia:</strong> ${ageGroup.label}. ${ageGroup.description}.</p>\n\n`;
		}
		
		if (customizations.subject) {
			roleText += `<p><strong>Especialización:</strong> ${customizations.subject}.</p>\n\n`;
		}
		
		const tone = toneOptions.find(t => t.id === customizations.tone);
		if (tone) {
			roleText += `<p><strong>Tono de comunicación:</strong> ${tone.label}.</p>\n\n`;
		}
		
		if (customizations.specialNeeds.length > 0) {
			roleText += `<p><strong>Adaptaciones especiales:</strong></p>\n<ul>\n`;
			customizations.specialNeeds.forEach(needId => {
				const need = specialNeedsOptions.find(n => n.id === needId);
				if (need) {
					roleText += `<li><strong>${need.label}:</strong> ${need.tip}</li>\n`;
				}
			});
			roleText += `</ul>\n\n`;
		}
		
		roleText += `<p><em>Fundamento pedagógico: ${selectedArchetype.pedagogicalBasis}</em></p>`;
		
		generatedRole = roleText;
		isGenerating = false;
		currentStep = 4;
	}

	function applyRole() {
		onroleUpdate?.(generatedRole);
		resetAndClose();
	}

	function resetAndClose() {
		currentStep = 1;
		selectedArchetype = null;
		selectedPersonality = [];
		selectedApproach = null;
		customizations = {
			name: '',
			subject: '',
			ageGroup: 'teens',
			specialNeeds: [],
			tone: 'friendly'
		};
		generatedRole = '';
		open = false;
		onclose?.();
	}

	function nextStep() {
		if (currentStep < 4) currentStep++;
	}

	function prevStep() {
		if (currentStep > 1) currentStep--;
	}

	function getColorClass(color: string): string {
		const colors: Record<string, string> = {
			blue: 'border-blue-500 bg-blue-50 dark:bg-blue-900/20',
			green: 'border-green-500 bg-green-50 dark:bg-green-900/20',
			purple: 'border-purple-500 bg-purple-50 dark:bg-purple-900/20',
			pink: 'border-pink-500 bg-pink-50 dark:bg-pink-900/20',
			cyan: 'border-cyan-500 bg-cyan-50 dark:bg-cyan-900/20',
			amber: 'border-amber-500 bg-amber-50 dark:bg-amber-900/20',
			red: 'border-red-500 bg-red-50 dark:bg-red-900/20',
			orange: 'border-orange-500 bg-orange-50 dark:bg-orange-900/20'
		};
		return colors[color] || colors.blue;
	}

	function getBadgeColor(color: string): 'blue' | 'green' | 'purple' | 'pink' | 'red' | 'yellow' | 'indigo' | 'cyan' | 'amber' | 'orange' {
		const colorMap: Record<string, 'blue' | 'green' | 'purple' | 'pink' | 'red' | 'yellow' | 'indigo' | 'cyan' | 'amber' | 'orange'> = {
			blue: 'blue',
			green: 'green',
			purple: 'purple',
			pink: 'pink',
			cyan: 'cyan',
			amber: 'amber',
			red: 'red',
			orange: 'orange'
		};
		return colorMap[color] || 'blue';
	}
</script>

<Modal 
	bind:open 
	size="xl" 
	title=""
	class="role-magician-modal"
	outsideclose
>
	<div class="min-h-[70vh]">
		<!-- Header con progreso -->
		<div class="mb-6 border-b border-gray-200 pb-4 dark:border-gray-700">
			<div class="mb-4 flex items-center gap-3">
				<div class="flex h-12 w-12 items-center justify-center rounded-xl bg-gradient-to-br from-purple-500 to-pink-500 text-2xl shadow-lg">
					🧙‍♂️
				</div>
				<div>
					<h2 class="text-xl font-bold text-gray-900 dark:text-white">Asistente de Creación de Roles</h2>
					<p class="text-sm text-gray-500 dark:text-gray-400">Diseña el rol perfecto para tu actividad educativa</p>
				</div>
			</div>
			
			<!-- Progress bar -->
			<div class="flex items-center gap-2">
				{#each [1, 2, 3, 4] as step}
					<div class="flex items-center">
						<button
							type="button"
							class="flex h-8 w-8 items-center justify-center rounded-full text-sm font-medium transition-all duration-300"
							class:bg-purple-600={currentStep >= step}
							class:text-white={currentStep >= step}
							class:bg-gray-200={currentStep < step}
							class:dark:bg-gray-700={currentStep < step}
							class:text-gray-600={currentStep < step}
							class:dark:text-gray-400={currentStep < step}
							class:ring-4={currentStep === step}
							class:ring-purple-200={currentStep === step}
							class:dark:ring-purple-800={currentStep === step}
							onclick={() => { if (step < currentStep) currentStep = step; }}
							disabled={step > currentStep}
						>
							{step}
						</button>
						{#if step < 4}
							<div 
								class="mx-2 h-1 w-8 rounded-full transition-all duration-300 sm:w-12"
								class:bg-purple-600={currentStep > step}
								class:bg-gray-200={currentStep <= step}
								class:dark:bg-gray-700={currentStep <= step}
							></div>
						{/if}
					</div>
				{/each}
				<span class="ml-2 text-xs text-gray-500 dark:text-gray-400 sm:ml-4 sm:text-sm">
					{#if currentStep === 1}Arquetipo{:else if currentStep === 2}Personalización{:else if currentStep === 3}Metodología{:else}Resultado{/if}
				</span>
			</div>
		</div>

		<!-- Contenido por pasos -->
		{#if currentStep === 1}
			<div in:fly={{ x: 20, duration: 300, easing: quintOut }}>
				<h3 class="mb-2 text-lg font-semibold dark:text-white">¿Qué tipo de educador necesitas?</h3>
				<p class="mb-6 text-sm text-gray-500 dark:text-gray-400">
					Cada arquetipo está basado en metodologías pedagógicas probadas. Selecciona el que mejor se adapte a tu objetivo educativo.
				</p>
				
				<div class="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
					{#each roleArchetypes as archetype}
						<button
							type="button"
							class="group relative rounded-xl border-2 p-4 text-left transition-all duration-200 hover:shadow-lg {selectedArchetype?.id === archetype.id ? getColorClass(archetype.color) + ' border-2' : 'border-gray-200 hover:border-gray-300 dark:border-gray-700 dark:hover:border-gray-600'}"
							onclick={() => selectArchetype(archetype)}
						>
							<div class="mb-3 text-3xl">{archetype.icon}</div>
							<h4 class="mb-1 font-semibold text-gray-900 dark:text-white">{archetype.name}</h4>
							<p class="mb-3 text-xs text-gray-600 dark:text-gray-400">{archetype.description}</p>
							<div class="flex flex-wrap gap-1">
								{#each archetype.bestFor.slice(0, 2) as tag}
									<Badge color={getBadgeColor(archetype.color)} class="text-xs">{tag}</Badge>
								{/each}
							</div>
							{#if selectedArchetype?.id === archetype.id}
								<div class="absolute -right-1 -top-1 flex h-6 w-6 items-center justify-center rounded-full bg-purple-600 text-white">
									✓
								</div>
							{/if}
						</button>
					{/each}
				</div>
				
				{#if selectedArchetype}
					<div class="mt-4 rounded-lg border border-purple-200 bg-purple-50 p-4 dark:border-purple-800 dark:bg-purple-900/20" transition:fade>
						<div class="flex items-start gap-3">
							<span class="text-2xl">{selectedArchetype.icon}</span>
							<div>
								<p class="text-sm text-gray-700 dark:text-gray-300">{selectedArchetype.basePrompt}</p>
								<p class="mt-2 text-xs text-purple-600 dark:text-purple-400">
									📖 Basado en: {selectedArchetype.pedagogicalBasis}
								</p>
							</div>
						</div>
					</div>
				{/if}
			</div>
		{:else if currentStep === 2}
			<div in:fly={{ x: 20, duration: 300, easing: quintOut }}>
				<h3 class="mb-2 text-lg font-semibold dark:text-white">Personaliza tu educador</h3>
				<p class="mb-6 text-sm text-gray-500 dark:text-gray-400">
					Ajusta los detalles para que el rol se adapte perfectamente a tu contexto.
				</p>
				
				<div class="space-y-6">
					<!-- Nombre y materia -->
					<div class="grid gap-4 md:grid-cols-2">
						<div>
							<label for="role-name" class="mb-2 block text-sm font-medium dark:text-white">
								Nombre del rol (opcional)
							</label>
							<input
								type="text"
								id="role-name"
								bind:value={customizations.name}
								placeholder="Ej: Profesor García, Mentora Ana..."
								class="w-full rounded-lg border border-gray-300 p-3 dark:border-gray-600 dark:bg-gray-700 dark:text-white"
							/>
						</div>
						<div>
							<label for="subject" class="mb-2 block text-sm font-medium dark:text-white">
								Materia o tema
							</label>
							<input
								type="text"
								id="subject"
								bind:value={customizations.subject}
								placeholder="Ej: Matemáticas, Historia del Arte..."
								class="w-full rounded-lg border border-gray-300 p-3 dark:border-gray-600 dark:bg-gray-700 dark:text-white"
							/>
						</div>
					</div>

					<!-- Personalidad -->
					<div>
						<span class="mb-2 block text-sm font-medium dark:text-white">
							Rasgos de personalidad <span class="text-gray-400">(máx. 3)</span>
						</span>
						<div class="flex flex-wrap gap-2">
							{#each personalityTraits as trait}
								<button
									type="button"
									class="flex items-center gap-2 rounded-full border px-4 py-2 text-sm transition-all {selectedPersonality.includes(trait.id) ? 'border-purple-500 bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-300' : 'border-gray-300 hover:border-gray-400 dark:border-gray-600 dark:text-gray-300'}"
									onclick={() => togglePersonality(trait.id)}
								>
									<span>{trait.icon}</span>
									<span>{trait.label}</span>
								</button>
							{/each}
						</div>
					</div>

					<!-- Grupo de edad -->
					<div>
						<span class="mb-2 block text-sm font-medium dark:text-white">Grupo de edad objetivo</span>
						<div class="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
							{#each ageGroups as age}
								<button
									type="button"
									class="rounded-lg border p-3 text-left transition-all {customizations.ageGroup === age.id ? 'border-purple-500 bg-purple-50 dark:bg-purple-900/20' : 'border-gray-200 hover:border-gray-300 dark:border-gray-700'}"
									onclick={() => customizations.ageGroup = age.id}
								>
									<span class="font-medium text-gray-900 dark:text-white">{age.label}</span>
									<p class="mt-1 text-xs text-gray-500 dark:text-gray-400">{age.description}</p>
								</button>
							{/each}
						</div>
					</div>

					<!-- Tono -->
					<div>
						<span class="mb-2 block text-sm font-medium dark:text-white">Tono de comunicación</span>
						<div class="flex flex-wrap gap-2">
							{#each toneOptions as tone}
								<button
									type="button"
									class="flex items-center gap-2 rounded-lg border px-4 py-2 transition-all {customizations.tone === tone.id ? 'border-purple-500 bg-purple-100 dark:bg-purple-900/30' : 'border-gray-300 dark:border-gray-600'}"
									onclick={() => customizations.tone = tone.id}
								>
									<span>{tone.emoji}</span>
									<span class="text-sm dark:text-gray-300">{tone.label}</span>
								</button>
							{/each}
						</div>
					</div>

					<!-- Necesidades especiales -->
					<div>
						<span class="mb-2 block text-sm font-medium dark:text-white">
							Adaptaciones especiales <span class="text-gray-400">(opcional)</span>
						</span>
						<div class="flex flex-wrap gap-2">
							{#each specialNeedsOptions as need}
								<button
									type="button"
									class="rounded-lg border px-3 py-2 text-sm transition-all {customizations.specialNeeds.includes(need.id) ? 'border-green-500 bg-green-100 dark:bg-green-900/30' : 'border-gray-300 dark:border-gray-600 dark:text-gray-300'}"
									onclick={() => toggleSpecialNeed(need.id)}
								>
									{need.label}
								</button>
							{/each}
						</div>
					</div>
				</div>
			</div>
		{:else if currentStep === 3}
			<div in:fly={{ x: 20, duration: 300, easing: quintOut }}>
				<h3 class="mb-2 text-lg font-semibold dark:text-white">Enfoque pedagógico</h3>
				<p class="mb-6 text-sm text-gray-500 dark:text-gray-400">
					Selecciona la metodología de enseñanza que utilizará el rol. Esto determinará cómo guiará el aprendizaje.
				</p>
				
				<div class="grid gap-4 md:grid-cols-2">
					{#each teachingApproaches as approach}
						<button
							type="button"
							class="rounded-xl border-2 p-5 text-left transition-all hover:shadow-md {selectedApproach?.id === approach.id ? 'border-purple-500 bg-purple-50 dark:bg-purple-900/20' : 'border-gray-200 dark:border-gray-700'}"
							onclick={() => selectedApproach = approach}
						>
							<div class="mb-3 flex items-center gap-3">
								<span class="text-2xl">{approach.icon}</span>
								<h4 class="font-semibold text-gray-900 dark:text-white">{approach.name}</h4>
							</div>
							<p class="mb-4 text-sm text-gray-600 dark:text-gray-400">{approach.description}</p>
							<div class="space-y-1">
								<span class="text-xs font-medium text-gray-500 dark:text-gray-400">Técnicas:</span>
								<ul class="text-xs text-gray-600 dark:text-gray-400">
									{#each approach.techniques as technique}
										<li class="flex items-center gap-1">
											<span class="text-green-500">✓</span> {technique}
										</li>
									{/each}
								</ul>
							</div>
						</button>
					{/each}
				</div>
			</div>
		{:else if currentStep === 4}
			<div in:fly={{ x: 20, duration: 300, easing: quintOut }}>
				<h3 class="mb-2 text-lg font-semibold dark:text-white">Tu rol está listo 🎉</h3>
				<p class="mb-6 text-sm text-gray-500 dark:text-gray-400">
					Revisa el resultado y ajústalo si es necesario antes de aplicarlo.
				</p>
				
				{#if isGenerating}
					<div class="flex items-center justify-center py-12">
						<div class="h-8 w-8 animate-spin rounded-full border-4 border-purple-500 border-t-transparent"></div>
						<span class="ml-3 text-gray-600 dark:text-gray-400">Generando rol...</span>
					</div>
				{:else}
					<div class="rounded-xl border border-gray-200 bg-white p-6 shadow-sm dark:border-gray-700 dark:bg-gray-800">
						<div class="prose prose-sm max-w-none dark:prose-invert">
							{@html generatedRole}
						</div>
					</div>
					
					<div class="mt-4 flex items-center gap-2 text-sm text-gray-500 dark:text-gray-400">
						<span>💡</span>
						<span>Puedes editar el rol directamente después de aplicarlo en el editor de texto.</span>
					</div>
				{/if}
			</div>
		{/if}
	</div>

	{#snippet footer()}
		<div class="flex w-full items-center justify-between">
			<div>
				{#if currentStep > 1}
					<Button color="light" onclick={prevStep}>
						← Anterior
					</Button>
				{/if}
			</div>
			<div class="flex gap-2">
				<Button color="alternative" onclick={resetAndClose}>
					Cancelar
				</Button>
				{#if currentStep < 3}
					<Button 
						color="purple" 
						onclick={nextStep}
						disabled={currentStep === 1 && !selectedArchetype}
					>
						Siguiente →
					</Button>
				{:else if currentStep === 3}
					<Button 
						color="purple" 
						onclick={generateRole}
					>
						✨ Generar Rol
					</Button>
				{:else}
					<Button color="green" onclick={applyRole}>
						✓ Aplicar Rol
					</Button>
				{/if}
			</div>
		</div>
	{/snippet}
</Modal>

<style>
	:global(.role-magician-modal) {
		--modal-max-width: 900px;
	}
</style>
