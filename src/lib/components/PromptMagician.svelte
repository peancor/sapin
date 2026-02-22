<script lang="ts">
	import { Modal, Button, Badge } from 'flowbite-svelte';
	import { fly, fade, scale } from 'svelte/transition';
	import { quintOut } from 'svelte/easing';

	interface Props {
		open: boolean;
		instructions: string;
		oninstructionsUpdate?: (instructions: string) => void;
		onclose?: () => void;
	}

	let { open = $bindable(), instructions, oninstructionsUpdate, onclose }: Props = $props();

	// Estados
	let currentStep = $state(1);
	let selectedStrategy = $state<LearningStrategy | null>(null);
	let selectedActivity = $state<ActivityType | null>(null);
	let customizations = $state({
		topic: '',
		learningObjective: '',
		duration: '30',
		difficulty: 'medium',
		feedbackStyle: 'progressive',
		assessmentType: 'formative',
		includeReflection: true,
		includeResources: false
	});
	let generatedPrompt = $state('');
	let isGenerating = $state(false);

	// Estrategias de aprendizaje basadas en investigación educativa
	interface LearningStrategy {
		id: string;
		name: string;
		icon: string;
		description: string;
		benefits: string[];
		researchBasis: string;
		color: string;
	}

	interface ActivityType {
		id: string;
		name: string;
		icon: string;
		description: string;
		structure: string[];
		bestWith: string[];
		engagementLevel: 'bajo' | 'medio' | 'alto';
	}

	const learningStrategies: LearningStrategy[] = [
		{
			id: 'inquiry-based',
			name: 'Aprendizaje por Indagación',
			icon: '🔍',
			description: 'Los estudiantes construyen conocimiento investigando preguntas auténticas',
			benefits: ['Pensamiento crítico', 'Autonomía', 'Curiosidad natural'],
			researchBasis: 'Constructivismo de Piaget y Vygotsky',
			color: 'blue'
		},
		{
			id: 'problem-based',
			name: 'Aprendizaje Basado en Problemas',
			icon: '🧩',
			description: 'Aprender resolviendo problemas del mundo real, relevantes y desafiantes',
			benefits: ['Aplicación práctica', 'Trabajo en equipo', 'Pensamiento analítico'],
			researchBasis: 'ABP - Howard Barrows (McMaster)',
			color: 'green'
		},
		{
			id: 'flipped',
			name: 'Aula Invertida',
			icon: '🔄',
			description: 'Contenido teórico previo, tiempo de clase para práctica guiada',
			benefits: ['Mayor tiempo de práctica', 'Aprendizaje personalizado', 'Interacción directa'],
			researchBasis: 'Bergmann & Sams - Flipped Classroom',
			color: 'purple'
		},
		{
			id: 'gamification',
			name: 'Gamificación',
			icon: '🎮',
			description: 'Mecánicas de juego para motivar y enganchar al estudiante',
			benefits: ['Alta motivación', 'Retroalimentación instantánea', 'Progresión visible'],
			researchBasis: 'Teoría de la Autodeterminación - Deci & Ryan',
			color: 'red'
		},
		{
			id: 'scaffolding',
			name: 'Andamiaje Cognitivo',
			icon: '🏗️',
			description: 'Apoyo estructurado que se retira gradualmente',
			benefits: ['Evita frustración', 'Construye confianza', 'Dominio progresivo'],
			researchBasis: 'Zona de Desarrollo Próximo - Vygotsky',
			color: 'amber'
		},
		{
			id: 'socratic',
			name: 'Diálogo Socrático',
			icon: '💭',
			description: 'Preguntas sucesivas que llevan al descubrimiento',
			benefits: ['Pensamiento profundo', 'Metacognición', 'Argumentación'],
			researchBasis: 'Método Socrático / Mayéutica',
			color: 'cyan'
		},
		{
			id: 'mastery',
			name: 'Aprendizaje por Dominio',
			icon: '🎯',
			description: 'Avanzar solo cuando se demuestra dominio completo',
			benefits: ['Sin lagunas', 'Confianza sólida', 'Fundamentos fuertes'],
			researchBasis: 'Mastery Learning - Benjamin Bloom',
			color: 'pink'
		},
		{
			id: 'collaborative',
			name: 'Aprendizaje Colaborativo',
			icon: '🤝',
			description: 'Construcción conjunta del conocimiento entre pares',
			benefits: ['Habilidades sociales', 'Perspectivas múltiples', 'Responsabilidad compartida'],
			researchBasis: 'Aprendizaje Social - Bandura',
			color: 'orange'
		}
	];

	const activityTypes: ActivityType[] = [
		{
			id: 'quiz-adaptive',
			name: 'Evaluación Adaptativa',
			icon: '📝',
			description: 'Preguntas que se ajustan al nivel del estudiante',
			structure: ['Pregunta inicial diagnóstica', 'Ajuste de dificultad', 'Feedback personalizado', 'Resumen de desempeño'],
			bestWith: ['Aprendizaje por Dominio', 'Andamiaje'],
			engagementLevel: 'medio'
		},
		{
			id: 'scenario-branching',
			name: 'Escenario con Bifurcaciones',
			icon: '🌳',
			description: 'Historia interactiva donde las decisiones cambian el resultado',
			structure: ['Situación inicial', 'Opciones de decisión', 'Consecuencias', 'Reflexión sobre alternativas'],
			bestWith: ['Gamificación', 'Aprendizaje Basado en Problemas'],
			engagementLevel: 'alto'
		},
		{
			id: 'guided-discovery',
			name: 'Descubrimiento Guiado',
			icon: '🔬',
			description: 'Exploración estructurada hacia un concepto clave',
			structure: ['Pregunta provocadora', 'Exploración con pistas', 'Descubrimiento', 'Consolidación'],
			bestWith: ['Aprendizaje por Indagación', 'Diálogo Socrático'],
			engagementLevel: 'alto'
		},
		{
			id: 'case-study',
			name: 'Estudio de Caso',
			icon: '📋',
			description: 'Análisis profundo de un caso real o simulado',
			structure: ['Presentación del caso', 'Análisis guiado', 'Propuesta de solución', 'Retroalimentación'],
			bestWith: ['Aprendizaje Basado en Problemas', 'Aprendizaje Colaborativo'],
			engagementLevel: 'medio'
		},
		{
			id: 'practice-drill',
			name: 'Práctica Deliberada',
			icon: '🔁',
			description: 'Ejercicios repetitivos con feedback inmediato',
			structure: ['Demostración', 'Práctica guiada', 'Práctica independiente', 'Feedback correctivo'],
			bestWith: ['Aprendizaje por Dominio', 'Andamiaje'],
			engagementLevel: 'medio'
		},
		{
			id: 'debate-simulation',
			name: 'Simulación de Debate',
			icon: '⚖️',
			description: 'Explorar múltiples perspectivas de un tema',
			structure: ['Presentación del tema', 'Asignación de posición', 'Argumentación', 'Síntesis'],
			bestWith: ['Diálogo Socrático', 'Aprendizaje Colaborativo'],
			engagementLevel: 'alto'
		},
		{
			id: 'project-mini',
			name: 'Mini-Proyecto',
			icon: '🚀',
			description: 'Crear algo aplicando los conceptos aprendidos',
			structure: ['Definición del proyecto', 'Planificación', 'Desarrollo guiado', 'Presentación y feedback'],
			bestWith: ['Aprendizaje Basado en Problemas', 'Aprendizaje Colaborativo'],
			engagementLevel: 'alto'
		},
		{
			id: 'reflection',
			name: 'Reflexión Metacognitiva',
			icon: '🪞',
			description: 'Pensar sobre el propio proceso de aprendizaje',
			structure: ['Pregunta reflexiva', 'Autoevaluación', 'Identificación de estrategias', 'Plan de mejora'],
			bestWith: ['Cualquier estrategia'],
			engagementLevel: 'bajo'
		}
	];

	const feedbackStyles = [
		{ id: 'immediate', label: 'Inmediato', description: 'Después de cada respuesta', icon: '⚡' },
		{ id: 'progressive', label: 'Progresivo', description: 'Acumulativo durante la actividad', icon: '📈' },
		{ id: 'final', label: 'Final', description: 'Resumen al terminar', icon: '🏁' },
		{ id: 'peer', label: 'Entre pares', description: 'Los estudiantes se evalúan mutuamente', icon: '👥' }
	];

	const assessmentTypes = [
		{ id: 'formative', label: 'Formativa', description: 'Para mejorar durante el proceso' },
		{ id: 'summative', label: 'Sumativa', description: 'Para evaluar al final' },
		{ id: 'diagnostic', label: 'Diagnóstica', description: 'Para identificar nivel inicial' }
	];

	const difficultyLevels = [
		{ id: 'easy', label: 'Básico', icon: '🌱', description: 'Conceptos fundamentales' },
		{ id: 'medium', label: 'Intermedio', icon: '🌿', description: 'Aplicación y análisis' },
		{ id: 'hard', label: 'Avanzado', icon: '🌳', description: 'Síntesis y evaluación' },
		{ id: 'adaptive', label: 'Adaptativo', icon: '🎯', description: 'Ajusta automáticamente' }
	];

	function selectStrategy(strategy: LearningStrategy) {
		selectedStrategy = strategy;
	}

	function selectActivity(activity: ActivityType) {
		selectedActivity = activity;
	}

	function generatePrompt() {
		if (!selectedStrategy || !selectedActivity) return;

		isGenerating = true;

		let prompt = '';

		// Título con el tema
		prompt += `<h2>📚 Actividad: ${customizations.topic || 'Sin especificar'}</h2>\n\n`;

		// Objetivo de aprendizaje
		if (customizations.learningObjective) {
			prompt += `<h3>🎯 Objetivo de Aprendizaje</h3>\n`;
			prompt += `<p>${customizations.learningObjective}</p>\n\n`;
		}

		// Información de la actividad
		prompt += `<h3>📋 Configuración de la Actividad</h3>\n`;
		prompt += `<ul>\n`;
		prompt += `<li><strong>Estrategia pedagógica:</strong> ${selectedStrategy.name} - ${selectedStrategy.description}</li>\n`;
		prompt += `<li><strong>Tipo de actividad:</strong> ${selectedActivity.name}</li>\n`;
		prompt += `<li><strong>Duración estimada:</strong> ${customizations.duration} minutos</li>\n`;
		prompt += `<li><strong>Nivel de dificultad:</strong> ${difficultyLevels.find(d => d.id === customizations.difficulty)?.label}</li>\n`;
		prompt += `</ul>\n\n`;

		// Instrucciones principales basadas en la estrategia
		prompt += `<h3>📖 Instrucciones para el Asistente</h3>\n\n`;
		
		// Instrucciones específicas según la estrategia
		switch (selectedStrategy.id) {
			case 'inquiry-based':
				prompt += `<p>Guía al estudiante a través de un proceso de investigación:</p>\n`;
				prompt += `<ol>\n`;
				prompt += `<li>Presenta una pregunta intrigante relacionada con el tema</li>\n`;
				prompt += `<li>Invita al estudiante a formular hipótesis</li>\n`;
				prompt += `<li>Proporciona recursos o pistas para investigar</li>\n`;
				prompt += `<li>Facilita el análisis de hallazgos</li>\n`;
				prompt += `<li>Ayuda a llegar a conclusiones basadas en evidencia</li>\n`;
				prompt += `</ol>\n\n`;
				break;
			case 'problem-based':
				prompt += `<p>Presenta un problema auténtico y guía su resolución:</p>\n`;
				prompt += `<ol>\n`;
				prompt += `<li>Plantea un problema del mundo real relevante para el estudiante</li>\n`;
				prompt += `<li>Ayuda a identificar qué información es necesaria</li>\n`;
				prompt += `<li>Guía la búsqueda y aplicación de conocimientos</li>\n`;
				prompt += `<li>Facilita la propuesta y evaluación de soluciones</li>\n`;
				prompt += `<li>Promueve la reflexión sobre el proceso de resolución</li>\n`;
				prompt += `</ol>\n\n`;
				break;
			case 'gamification':
				prompt += `<p>Convierte el aprendizaje en una experiencia gamificada:</p>\n`;
				prompt += `<ol>\n`;
				prompt += `<li>Establece un sistema de puntos o logros</li>\n`;
				prompt += `<li>Presenta desafíos con dificultad progresiva</li>\n`;
				prompt += `<li>Proporciona retroalimentación inmediata y positiva</li>\n`;
				prompt += `<li>Celebra los logros y el progreso</li>\n`;
				prompt += `<li>Ofrece oportunidades de "subir de nivel"</li>\n`;
				prompt += `</ol>\n\n`;
				break;
			case 'scaffolding':
				prompt += `<p>Proporciona apoyo estructurado que se reduce gradualmente:</p>\n`;
				prompt += `<ol>\n`;
				prompt += `<li>Comienza con mucho apoyo y ejemplos claros</li>\n`;
				prompt += `<li>Reduce gradualmente las pistas según el progreso</li>\n`;
				prompt += `<li>Ofrece ayuda adicional si el estudiante se atasca</li>\n`;
				prompt += `<li>Celebra cuando logra hacerlo de forma independiente</li>\n`;
				prompt += `<li>Ajusta el nivel de apoyo según las necesidades</li>\n`;
				prompt += `</ol>\n\n`;
				break;
			case 'socratic':
				prompt += `<p>Utiliza preguntas poderosas para guiar el descubrimiento:</p>\n`;
				prompt += `<ol>\n`;
				prompt += `<li>Nunca des la respuesta directamente</li>\n`;
				prompt += `<li>Formula preguntas que desafíen suposiciones</li>\n`;
				prompt += `<li>Pide clarificaciones y profundización</li>\n`;
				prompt += `<li>Guía hacia contradicciones productivas</li>\n`;
				prompt += `<li>Celebra cuando el estudiante llega a insights por sí mismo</li>\n`;
				prompt += `</ol>\n\n`;
				break;
			case 'mastery':
				prompt += `<p>Asegura el dominio completo antes de avanzar:</p>\n`;
				prompt += `<ol>\n`;
				prompt += `<li>Evalúa el nivel actual del estudiante</li>\n`;
				prompt += `<li>Presenta conceptos de forma secuencial</li>\n`;
				prompt += `<li>Verifica comprensión antes de continuar</li>\n`;
				prompt += `<li>Proporciona práctica hasta alcanzar dominio</li>\n`;
				prompt += `<li>Solo avanza cuando demuestra comprensión sólida</li>\n`;
				prompt += `</ol>\n\n`;
				break;
			case 'collaborative':
				prompt += `<p>Facilita la construcción conjunta de conocimiento:</p>\n`;
				prompt += `<ol>\n`;
				prompt += `<li>Propón actividades que requieran intercambio de ideas</li>\n`;
				prompt += `<li>Presenta múltiples perspectivas sobre el tema</li>\n`;
				prompt += `<li>Fomenta el debate respetuoso</li>\n`;
				prompt += `<li>Ayuda a sintetizar diferentes puntos de vista</li>\n`;
				prompt += `<li>Valora las contribuciones de todos</li>\n`;
				prompt += `</ol>\n\n`;
				break;
			case 'flipped':
				prompt += `<p>Maximiza el tiempo de práctica guiada:</p>\n`;
				prompt += `<ol>\n`;
				prompt += `<li>Asume que el estudiante ya revisó el material teórico</li>\n`;
				prompt += `<li>Enfócate en aplicación práctica de conceptos</li>\n`;
				prompt += `<li>Resuelve dudas específicas que surjan</li>\n`;
				prompt += `<li>Proporciona ejercicios de aplicación</li>\n`;
				prompt += `<li>Ofrece retroalimentación detallada</li>\n`;
				prompt += `</ol>\n\n`;
				break;
		}

		// Estructura de la actividad
		prompt += `<h3>🔄 Estructura de la Actividad (${selectedActivity.name})</h3>\n`;
		prompt += `<ol>\n`;
		selectedActivity.structure.forEach(step => {
			prompt += `<li>${step}</li>\n`;
		});
		prompt += `</ol>\n\n`;

		// Configuración de feedback
		const feedbackStyle = feedbackStyles.find(f => f.id === customizations.feedbackStyle);
		prompt += `<h3>💬 Estilo de Retroalimentación</h3>\n`;
		prompt += `<p><strong>${feedbackStyle?.label}:</strong> ${feedbackStyle?.description}.</p>\n\n`;

		// Evaluación
		const assessment = assessmentTypes.find(a => a.id === customizations.assessmentType);
		prompt += `<h3>📊 Evaluación</h3>\n`;
		prompt += `<p><strong>Tipo:</strong> ${assessment?.label} - ${assessment?.description}.</p>\n\n`;

		// Reflexión
		if (customizations.includeReflection) {
			prompt += `<h3>🪞 Reflexión Final</h3>\n`;
			prompt += `<p>Al terminar la actividad, invita al estudiante a reflexionar sobre:</p>\n`;
			prompt += `<ul>\n`;
			prompt += `<li>¿Qué aprendí nuevo hoy?</li>\n`;
			prompt += `<li>¿Qué fue lo más desafiante?</li>\n`;
			prompt += `<li>¿Cómo puedo aplicar esto en mi vida?</li>\n`;
			prompt += `</ul>\n\n`;
		}

		// Nota sobre fundamento pedagógico
		prompt += `<hr>\n`;
		prompt += `<p><em>📚 Fundamento pedagógico: ${selectedStrategy.researchBasis}</em></p>`;

		generatedPrompt = prompt;
		isGenerating = false;
		currentStep = 4;
	}

	function applyPrompt() {
		oninstructionsUpdate?.(generatedPrompt);
		resetAndClose();
	}

	function resetAndClose() {
		currentStep = 1;
		selectedStrategy = null;
		selectedActivity = null;
		customizations = {
			topic: '',
			learningObjective: '',
			duration: '30',
			difficulty: 'medium',
			feedbackStyle: 'progressive',
			assessmentType: 'formative',
			includeReflection: true,
			includeResources: false
		};
		generatedPrompt = '';
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

	function getEngagementBadge(level: string): { color: 'blue' | 'green' | 'purple' | 'pink' | 'red' | 'yellow' | 'indigo' | 'cyan' | 'amber' | 'orange'; label: string } {
		switch (level) {
			case 'alto': return { color: 'green', label: '🔥 Alto engagement' };
			case 'medio': return { color: 'yellow', label: '⚡ Engagement medio' };
			default: return { color: 'blue', label: '💡 Reflexivo' };
		}
	}
</script>

<Modal 
	bind:open 
	size="xl" 
	title=""
	class="prompt-magician-modal"
	outsideclose
>
	<div class="min-h-[70vh]">
		<!-- Header con progreso -->
		<div class="mb-6 border-b border-gray-200 pb-4 dark:border-gray-700">
			<div class="mb-4 flex items-center gap-3">
				<div class="flex h-12 w-12 items-center justify-center rounded-xl bg-gradient-to-br from-blue-500 to-cyan-500 text-2xl shadow-lg">
					✨
				</div>
				<div>
					<h2 class="text-xl font-bold text-gray-900 dark:text-white">Asistente de Instrucciones</h2>
					<p class="text-sm text-gray-500 dark:text-gray-400">Diseña actividades de aprendizaje efectivas y atractivas</p>
				</div>
			</div>
			
			<!-- Progress bar -->
			<div class="flex items-center gap-2">
				{#each [1, 2, 3, 4] as step}
					<div class="flex items-center">
						<button
							type="button"
							class="flex h-8 w-8 items-center justify-center rounded-full text-sm font-medium transition-all duration-300"
							class:bg-blue-600={currentStep >= step}
							class:text-white={currentStep >= step}
							class:bg-gray-200={currentStep < step}
							class:dark:bg-gray-700={currentStep < step}
							class:text-gray-600={currentStep < step}
							class:dark:text-gray-400={currentStep < step}
							class:ring-4={currentStep === step}
							class:ring-blue-200={currentStep === step}
							class:dark:ring-blue-800={currentStep === step}
							onclick={() => { if (step < currentStep) currentStep = step; }}
							disabled={step > currentStep}
						>
							{step}
						</button>
						{#if step < 4}
							<div 
								class="mx-2 h-1 w-8 rounded-full transition-all duration-300 sm:w-12"
								class:bg-blue-600={currentStep > step}
								class:bg-gray-200={currentStep <= step}
								class:dark:bg-gray-700={currentStep <= step}
							></div>
						{/if}
					</div>
				{/each}
				<span class="ml-2 text-xs text-gray-500 dark:text-gray-400 sm:ml-4 sm:text-sm">
					{#if currentStep === 1}Estrategia{:else if currentStep === 2}Actividad{:else if currentStep === 3}Detalles{:else}Resultado{/if}
				</span>
			</div>
		</div>

		<!-- Contenido por pasos -->
		{#if currentStep === 1}
			<div in:fly={{ x: 20, duration: 300, easing: quintOut }}>
				<h3 class="mb-2 text-lg font-semibold dark:text-white">¿Qué estrategia pedagógica quieres usar?</h3>
				<p class="mb-6 text-sm text-gray-500 dark:text-gray-400">
					Cada estrategia está respaldada por investigación educativa. Elige la que mejor se adapte a tu objetivo de aprendizaje.
				</p>
				
				<div class="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
					{#each learningStrategies as strategy}
						<button
							type="button"
							class="group relative rounded-xl border-2 p-4 text-left transition-all duration-200 hover:shadow-lg {selectedStrategy?.id === strategy.id ? getColorClass(strategy.color) + ' border-2' : 'border-gray-200 hover:border-gray-300 dark:border-gray-700 dark:hover:border-gray-600'}"
							onclick={() => selectStrategy(strategy)}
						>
							<div class="mb-3 text-3xl">{strategy.icon}</div>
							<h4 class="mb-1 font-semibold text-gray-900 dark:text-white">{strategy.name}</h4>
							<p class="mb-3 text-xs text-gray-600 dark:text-gray-400">{strategy.description}</p>
							<div class="flex flex-wrap gap-1">
								{#each strategy.benefits.slice(0, 2) as benefit}
									<Badge color={getBadgeColor(strategy.color)} class="text-xs">{benefit}</Badge>
								{/each}
							</div>
							{#if selectedStrategy?.id === strategy.id}
								<div class="absolute -right-1 -top-1 flex h-6 w-6 items-center justify-center rounded-full bg-blue-600 text-white">
									✓
								</div>
							{/if}
						</button>
					{/each}
				</div>
				
				{#if selectedStrategy}
					<div class="mt-4 rounded-lg border border-blue-200 bg-blue-50 p-4 dark:border-blue-800 dark:bg-blue-900/20" transition:fade>
						<div class="flex items-start gap-3">
							<span class="text-2xl">{selectedStrategy.icon}</span>
							<div>
								<div class="mb-2 flex flex-wrap gap-2">
									{#each selectedStrategy.benefits as benefit}
										<Badge color="blue">{benefit}</Badge>
									{/each}
								</div>
								<p class="text-xs text-blue-600 dark:text-blue-400">
									📖 Base científica: {selectedStrategy.researchBasis}
								</p>
							</div>
						</div>
					</div>
				{/if}
			</div>
		{:else if currentStep === 2}
			<div in:fly={{ x: 20, duration: 300, easing: quintOut }}>
				<h3 class="mb-2 text-lg font-semibold dark:text-white">¿Qué tipo de actividad quieres crear?</h3>
				<p class="mb-6 text-sm text-gray-500 dark:text-gray-400">
					Cada tipo de actividad tiene una estructura específica que guiará el aprendizaje.
				</p>
				
				<div class="grid gap-4 md:grid-cols-2">
					{#each activityTypes as activity}
						{@const engagement = getEngagementBadge(activity.engagementLevel)}
						<button
							type="button"
							class="rounded-xl border-2 p-5 text-left transition-all hover:shadow-md {selectedActivity?.id === activity.id ? 'border-blue-500 bg-blue-50 dark:bg-blue-900/20' : 'border-gray-200 dark:border-gray-700'}"
							onclick={() => selectActivity(activity)}
						>
							<div class="mb-3 flex items-center justify-between">
								<div class="flex items-center gap-3">
									<span class="text-2xl">{activity.icon}</span>
									<h4 class="font-semibold text-gray-900 dark:text-white">{activity.name}</h4>
								</div>
								<Badge color={engagement.color} class="text-xs">{engagement.label}</Badge>
							</div>
							<p class="mb-4 text-sm text-gray-600 dark:text-gray-400">{activity.description}</p>
							<div class="space-y-2">
								<span class="text-xs font-medium text-gray-500 dark:text-gray-400">Estructura:</span>
								<div class="flex flex-wrap gap-1">
									{#each activity.structure as step, i}
										<span class="inline-flex items-center rounded bg-gray-100 px-2 py-1 text-xs dark:bg-gray-700">
											{i + 1}. {step}
										</span>
									{/each}
								</div>
							</div>
						</button>
					{/each}
				</div>
			</div>
		{:else if currentStep === 3}
			<div in:fly={{ x: 20, duration: 300, easing: quintOut }}>
				<h3 class="mb-2 text-lg font-semibold dark:text-white">Personaliza tu actividad</h3>
				<p class="mb-6 text-sm text-gray-500 dark:text-gray-400">
					Ajusta los detalles para que la actividad se adapte perfectamente a tus necesidades.
				</p>
				
				<div class="space-y-6">
					<!-- Tema y objetivo -->
					<div class="grid gap-4 md:grid-cols-2">
						<div>
							<label for="topic" class="mb-2 block text-sm font-medium dark:text-white">
								Tema de la actividad *
							</label>
							<input
								type="text"
								id="topic"
								bind:value={customizations.topic}
								placeholder="Ej: Fracciones, La Revolución Francesa..."
								class="w-full rounded-lg border border-gray-300 p-3 dark:border-gray-600 dark:bg-gray-700 dark:text-white"
							/>
						</div>
						<div>
							<label for="objective" class="mb-2 block text-sm font-medium dark:text-white">
								Objetivo de aprendizaje
							</label>
							<input
								type="text"
								id="objective"
								bind:value={customizations.learningObjective}
								placeholder="Ej: El estudiante será capaz de..."
								class="w-full rounded-lg border border-gray-300 p-3 dark:border-gray-600 dark:bg-gray-700 dark:text-white"
							/>
						</div>
					</div>

					<!-- Duración y dificultad -->
					<div class="grid gap-4 md:grid-cols-2">
						<div>
							<label for="duration" class="mb-2 block text-sm font-medium dark:text-white">
								Duración estimada (minutos)
							</label>
							<input
								type="number"
								id="duration"
								bind:value={customizations.duration}
								min="5"
								max="120"
								class="w-full rounded-lg border border-gray-300 p-3 dark:border-gray-600 dark:bg-gray-700 dark:text-white"
							/>
						</div>
						<div>
							<span class="mb-2 block text-sm font-medium dark:text-white">Nivel de dificultad</span>
							<div class="flex flex-wrap gap-2">
								{#each difficultyLevels as level}
									<button
										type="button"
										class="flex items-center gap-2 rounded-lg border px-4 py-2 transition-all {customizations.difficulty === level.id ? 'border-blue-500 bg-blue-100 dark:bg-blue-900/30' : 'border-gray-300 dark:border-gray-600'}"
										onclick={() => customizations.difficulty = level.id}
									>
										<span>{level.icon}</span>
										<span class="text-sm dark:text-gray-300">{level.label}</span>
									</button>
								{/each}
							</div>
						</div>
					</div>

					<!-- Estilo de feedback -->
					<div>
						<span class="mb-2 block text-sm font-medium dark:text-white">Estilo de retroalimentación</span>
						<div class="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
							{#each feedbackStyles as style}
								<button
									type="button"
									class="rounded-lg border p-3 text-left transition-all {customizations.feedbackStyle === style.id ? 'border-blue-500 bg-blue-50 dark:bg-blue-900/20' : 'border-gray-200 hover:border-gray-300 dark:border-gray-700'}"
									onclick={() => customizations.feedbackStyle = style.id}
								>
									<div class="flex items-center gap-2">
										<span>{style.icon}</span>
										<span class="font-medium text-gray-900 dark:text-white">{style.label}</span>
									</div>
									<p class="mt-1 text-xs text-gray-500 dark:text-gray-400">{style.description}</p>
								</button>
							{/each}
						</div>
					</div>

					<!-- Tipo de evaluación -->
					<div>
						<span class="mb-2 block text-sm font-medium dark:text-white">Tipo de evaluación</span>
						<div class="flex flex-wrap gap-2">
							{#each assessmentTypes as type}
								<button
									type="button"
									class="rounded-lg border px-4 py-2 transition-all {customizations.assessmentType === type.id ? 'border-blue-500 bg-blue-100 dark:bg-blue-900/30' : 'border-gray-300 dark:border-gray-600'}"
									onclick={() => customizations.assessmentType = type.id}
								>
									<span class="text-sm font-medium dark:text-gray-300">{type.label}</span>
									<p class="text-xs text-gray-500 dark:text-gray-400">{type.description}</p>
								</button>
							{/each}
						</div>
					</div>

					<!-- Opciones adicionales -->
					<div class="flex flex-wrap gap-4">
						<label class="flex cursor-pointer items-center gap-2">
							<input
								type="checkbox"
								bind:checked={customizations.includeReflection}
								class="h-4 w-4 rounded border-gray-300 text-blue-600"
							/>
							<span class="text-sm dark:text-gray-300">🪞 Incluir reflexión metacognitiva</span>
						</label>
						<label class="flex cursor-pointer items-center gap-2">
							<input
								type="checkbox"
								bind:checked={customizations.includeResources}
								class="h-4 w-4 rounded border-gray-300 text-blue-600"
							/>
							<span class="text-sm dark:text-gray-300">📚 Sugerir recursos adicionales</span>
						</label>
					</div>
				</div>
			</div>
		{:else if currentStep === 4}
			<div in:fly={{ x: 20, duration: 300, easing: quintOut }}>
				<h3 class="mb-2 text-lg font-semibold dark:text-white">Tus instrucciones están listas 🎉</h3>
				<p class="mb-6 text-sm text-gray-500 dark:text-gray-400">
					Revisa el resultado y ajústalo si es necesario antes de aplicarlo.
				</p>
				
				{#if isGenerating}
					<div class="flex items-center justify-center py-12">
						<div class="h-8 w-8 animate-spin rounded-full border-4 border-blue-500 border-t-transparent"></div>
						<span class="ml-3 text-gray-600 dark:text-gray-400">Generando instrucciones...</span>
					</div>
				{:else}
					<div class="max-h-96 overflow-y-auto rounded-xl border border-gray-200 bg-white p-6 shadow-sm dark:border-gray-700 dark:bg-gray-800">
						<div class="prose prose-sm max-w-none dark:prose-invert">
							{@html generatedPrompt}
						</div>
					</div>
					
					<div class="mt-4 flex items-center gap-2 text-sm text-gray-500 dark:text-gray-400">
						<span>💡</span>
						<span>Puedes editar las instrucciones después de aplicarlas en el editor de texto.</span>
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
						color="blue" 
						onclick={nextStep}
						disabled={(currentStep === 1 && !selectedStrategy) || (currentStep === 2 && !selectedActivity)}
					>
						Siguiente →
					</Button>
				{:else if currentStep === 3}
					<Button 
						color="blue" 
						onclick={generatePrompt}
						disabled={!customizations.topic}
					>
						✨ Generar Instrucciones
					</Button>
				{:else}
					<Button color="green" onclick={applyPrompt}>
						✓ Aplicar Instrucciones
					</Button>
				{/if}
			</div>
		</div>
	{/snippet}
</Modal>

<style>
	:global(.prompt-magician-modal) {
		--modal-max-width: 900px;
	}
</style>
