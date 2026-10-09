<script lang="ts">
	import { onMount } from 'svelte';
	import {
		Users,
		CheckCircle,
		ArrowRight,
		Shield,
		MessageSquare,
		BrainCircuit,
		FlaskConical,
		BarChart3,
		FileText,
		Lightbulb,
		Target,
		Microscope
	} from 'lucide-svelte';
	import { Button, GradientButton, Badge } from 'flowbite-svelte';
	import ParticlesBackground from '$lib/components/ParticlesBackground.svelte';
	import { fly, scale } from 'svelte/transition';

	let visible = $state(false);
	onMount(() => {
		visible = true;
	});
</script>

<svelte:head>
	<title>SAPIN | Plataforma de Investigación en Aprendizaje Conversacional con IA</title>
	<meta
		name="description"
		content="SAPIN es una plataforma experimental para diseñar y evaluar experiencias de aprendizaje conversacional con asistentes de IA. Analítica avanzada para investigación educativa."
	/>
	<meta
		name="keywords"
		content="aprendizaje conversacional, IA educativa, investigación educativa, learning analytics, tutores inteligentes, innovación docente"
	/>
	<meta property="og:title" content="SAPIN | Investigación en Aprendizaje Conversacional" />
	<meta
		property="og:description"
		content="Plataforma experimental para el diseño y evaluación de experiencias de aprendizaje basadas en conversación con IA."
	/>
	<meta property="og:image" content="/images/sapin_anime.webp" />
	<meta name="twitter:card" content="summary_large_image" />
</svelte:head>

<div
	class="relative -mt-4 overflow-hidden bg-white transition-colors duration-500 dark:bg-gray-900"
>
	<!-- Background Effects -->
	<div class="pointer-events-none absolute inset-0 z-0">
		<ParticlesBackground color="#4f46e5" opacity={0.12} particleCount={50} />
		<div
			class="absolute top-0 left-0 h-full w-full bg-[radial-gradient(circle_at_50%_20%,rgba(120,119,198,0.08),transparent)] dark:bg-[radial-gradient(circle_at_50%_20%,rgba(120,119,198,0.15),transparent)]"
		></div>
	</div>

	<!-- Hero Section -->
	<section class="relative flex items-center pt-8 pb-12">
		<div class="relative z-10 container mx-auto px-4">
			<div class="flex flex-col items-center gap-16 lg:flex-row">
				<!-- Text Content -->
				<div class="flex-1 text-center lg:text-left">
					{#if visible}
						<div in:fly={{ y: 20, duration: 800 }} class="mb-6 inline-block">
							<Badge
								color="gray"
								class="rounded-full bg-slate-100 px-4 py-1.5 text-sm font-medium tracking-wide text-slate-700 shadow-sm dark:bg-slate-800 dark:text-slate-300"
							>
								<FlaskConical class="mr-2 inline-block h-4 w-4" />
								Plataforma de Investigación Educativa
							</Badge>
						</div>

						<h1
							in:fly={{ y: 30, duration: 800, delay: 200 }}
							class="mb-8 text-5xl leading-[1.1] font-black md:text-6xl lg:text-7xl"
						>
							<span
								class="bg-gradient-to-r from-blue-600 via-indigo-600 to-purple-600 bg-clip-text text-transparent drop-shadow-sm dark:from-blue-400 dark:via-indigo-400 dark:to-purple-400"
							>
								SAPIN
							</span>
							<br />
							<span
								class="text-4xl font-bold text-slate-900 md:text-5xl lg:text-5xl dark:text-white"
							>
								Aprendizaje <span class="rounded-lg bg-indigo-100 px-2 dark:bg-indigo-900/30"
									>conversacional</span
								>
							</span>
						</h1>

						<p
							in:fly={{ y: 30, duration: 800, delay: 400 }}
							class="mx-auto mb-10 max-w-2xl text-xl leading-relaxed font-light text-slate-600 md:text-2xl lg:mx-0 dark:text-slate-300"
						>
							Diseña <span class="font-semibold text-indigo-600 dark:text-indigo-400"
								>experiencias de aprendizaje a medida</span
							> basadas en conversaciones con asistentes de IA. Gestiona cursos y obtén analítica detallada
							de las interacciones.
						</p>

						<div
							in:fly={{ y: 30, duration: 800, delay: 600 }}
							class="flex flex-col justify-center gap-5 sm:flex-row lg:justify-start"
						>
							<GradientButton
								href="/login"
								size="xl"
								color="purpleToBlue"
								class="transform px-10 py-4 text-lg font-bold shadow-xl shadow-blue-500/20 transition-all duration-300 hover:scale-105"
							>
								<span class="flex items-center gap-3">
									Acceder
									<ArrowRight class="h-5 w-5" />
								</span>
							</GradientButton>
							<Button
								href="/contact"
								size="xl"
								outline
								color="dark"
								class="transform border-2 px-10 py-4 text-lg font-bold transition-all duration-300 hover:scale-105 dark:border-slate-700 dark:text-white"
							>
								Contactar
							</Button>
						</div>
					{/if}
				</div>

				<!-- Logo/Image Container -->
				<div class="relative flex-1">
					{#if visible}
						<div in:scale={{ duration: 1000, start: 0.8, delay: 300 }} class="relative z-10">
							<!-- Animated Glow -->
							<div
								class="animate-pulse-slow absolute inset-0 rounded-full bg-blue-500/15 blur-[100px] dark:bg-blue-600/20"
							></div>

							<!-- Main Animated Logo -->
							<div class="group relative cursor-none">
								<img
									src="/images/sapin_anime.webp"
									alt="SAPIN Logo"
									class="animate-float-slow mx-auto w-full max-w-[500px] transform drop-shadow-[0_20px_50px_rgba(0,0,0,0.15)] filter transition-all duration-700 group-hover:scale-105 group-hover:rotate-2 dark:drop-shadow-[0_20px_50px_rgba(255,255,255,0.03)]"
								/>

								<!-- Floating Badges -->
								<div
									class="animate-bounce-slow absolute -top-8 -right-4 hidden rounded-xl border border-slate-100 bg-white p-3 shadow-lg sm:block dark:border-slate-700 dark:bg-slate-800"
								>
									<BrainCircuit class="mb-1 h-6 w-6 text-indigo-500" />
									<span class="text-xs font-medium text-slate-600 dark:text-slate-400"
										>Asistente IA</span
									>
								</div>

								<div
									class="animate-float absolute -bottom-8 -left-4 hidden rounded-xl border border-slate-100 bg-white p-3 shadow-lg sm:block dark:border-slate-700 dark:bg-slate-800"
									style="animation-delay: 1s;"
								>
									<BarChart3 class="mb-1 h-6 w-6 text-emerald-500" />
									<span class="text-xs font-medium text-slate-600 dark:text-slate-400"
										>Analítica</span
									>
								</div>
							</div>
						</div>
					{/if}
				</div>
			</div>
		</div>
	</section>

	<!-- Pilares de la Plataforma -->
	<section class="relative overflow-hidden bg-slate-50/80 py-16 dark:bg-slate-900/50">
		<div class="relative z-10 container mx-auto px-4">
			<div class="mx-auto mb-14 max-w-3xl text-center">
				<h2
					class="mb-4 text-sm font-semibold tracking-widest text-slate-500 uppercase dark:text-slate-400"
				>
					Arquitectura de la plataforma
				</h2>
				<h3
					class="mb-6 text-3xl leading-tight font-bold text-slate-900 md:text-4xl dark:text-white"
				>
					Un entorno completo para la <span class="text-indigo-600 dark:text-indigo-400"
						>investigación educativa</span
					>
				</h3>
				<p class="text-lg text-slate-600 dark:text-slate-400">
					SAPIN integra diseño instruccional, interacción conversacional con IA y herramientas de
					análisis en una única plataforma orientada a la investigación y mejora de la práctica
					docente.
				</p>
			</div>

			<div class="grid gap-8 md:grid-cols-3">
				<!-- Pilar 1: Diseño de Experiencias -->
				<div
					class="group rounded-2xl border border-slate-200 bg-white p-8 transition-all duration-300 hover:border-indigo-200 dark:border-slate-700/50 dark:bg-slate-800/50 dark:hover:border-indigo-800"
				>
					<div
						class="mb-6 flex h-14 w-14 items-center justify-center rounded-xl bg-indigo-100 dark:bg-indigo-900/40"
					>
						<Lightbulb class="h-7 w-7 text-indigo-600 dark:text-indigo-400" />
					</div>
					<h4 class="mb-3 text-xl font-semibold text-slate-900 dark:text-white">
						Diseño de Experiencias
					</h4>
					<p class="mb-4 text-sm leading-relaxed text-slate-600 dark:text-slate-400">
						Configura asistentes de IA con prompts específicos para cada actividad de aprendizaje.
						Define objetivos, materiales de referencia y criterios de evaluación.
					</p>
					<ul class="space-y-2 text-sm text-slate-500 dark:text-slate-400">
						<li class="flex items-center gap-2">
							<CheckCircle class="h-4 w-4 text-emerald-500" />
							<span>Prompts personalizables</span>
						</li>
						<li class="flex items-center gap-2">
							<CheckCircle class="h-4 w-4 text-emerald-500" />
							<span>Materiales de contexto (RAG)</span>
						</li>
						<li class="flex items-center gap-2">
							<CheckCircle class="h-4 w-4 text-emerald-500" />
							<span>Múltiples modelos de IA</span>
						</li>
					</ul>
				</div>

				<!-- Pilar 2: Interacción Conversacional -->
				<div
					class="group rounded-2xl border border-slate-200 bg-white p-8 transition-all duration-300 hover:border-blue-200 dark:border-slate-700/50 dark:bg-slate-800/50 dark:hover:border-blue-800"
				>
					<div
						class="mb-6 flex h-14 w-14 items-center justify-center rounded-xl bg-blue-100 dark:bg-blue-900/40"
					>
						<MessageSquare class="h-7 w-7 text-blue-600 dark:text-blue-400" />
					</div>
					<h4 class="mb-3 text-xl font-semibold text-slate-900 dark:text-white">
						Aprendizaje Conversacional
					</h4>
					<p class="mb-4 text-sm leading-relaxed text-slate-600 dark:text-slate-400">
						Los estudiantes interactúan con asistentes de IA especializados que guían su aprendizaje
						mediante diálogos estructurados y feedback contextualizado.
					</p>
					<ul class="space-y-2 text-sm text-slate-500 dark:text-slate-400">
						<li class="flex items-center gap-2">
							<CheckCircle class="h-4 w-4 text-emerald-500" />
							<span>Chat guiado por objetivos</span>
						</li>
						<li class="flex items-center gap-2">
							<CheckCircle class="h-4 w-4 text-emerald-500" />
							<span>Feedback formativo inmediato</span>
						</li>
						<li class="flex items-center gap-2">
							<CheckCircle class="h-4 w-4 text-emerald-500" />
							<span>Sesiones persistentes</span>
						</li>
					</ul>
				</div>

				<!-- Pilar 3: Analítica -->
				<div
					class="group rounded-2xl border border-slate-200 bg-white p-8 transition-all duration-300 hover:border-emerald-200 dark:border-slate-700/50 dark:bg-slate-800/50 dark:hover:border-emerald-800"
				>
					<div
						class="mb-6 flex h-14 w-14 items-center justify-center rounded-xl bg-emerald-100 dark:bg-emerald-900/40"
					>
						<BarChart3 class="h-7 w-7 text-emerald-600 dark:text-emerald-400" />
					</div>
					<h4 class="mb-3 text-xl font-semibold text-slate-900 dark:text-white">
						Analítica Avanzada
					</h4>
					<p class="mb-4 text-sm leading-relaxed text-slate-600 dark:text-slate-400">
						Accede a métricas detalladas de las interacciones: patrones de uso, calidad del diálogo,
						progresión en objetivos y exportación de datos para análisis externo.
					</p>
					<ul class="space-y-2 text-sm text-slate-500 dark:text-slate-400">
						<li class="flex items-center gap-2">
							<CheckCircle class="h-4 w-4 text-emerald-500" />
							<span>Historial completo de chats</span>
						</li>
						<li class="flex items-center gap-2">
							<CheckCircle class="h-4 w-4 text-emerald-500" />
							<span>Métricas de engagement</span>
						</li>
						<li class="flex items-center gap-2">
							<CheckCircle class="h-4 w-4 text-emerald-500" />
							<span>Exportación de datos</span>
						</li>
					</ul>
				</div>
			</div>
		</div>
	</section>

	<!-- Sección para Investigadores/Evaluadores -->
	<section class="relative bg-white py-16 dark:bg-gray-900">
		<div class="container mx-auto px-4">
			<div class="mx-auto max-w-4xl">
				<div class="mb-8 flex items-center justify-center gap-3">
					<div
						class="flex h-10 w-10 items-center justify-center rounded-lg bg-slate-100 dark:bg-slate-800"
					>
						<Microscope class="h-5 w-5 text-slate-600 dark:text-slate-400" />
					</div>
					<h2 class="text-2xl font-bold text-slate-900 dark:text-white">
						Para investigadores y evaluadores
					</h2>
				</div>

				<div
					class="rounded-2xl border border-slate-200 bg-gradient-to-br from-slate-50 to-indigo-50/50 p-8 md:p-10 dark:border-slate-700 dark:from-slate-800/50 dark:to-indigo-900/20"
				>
					<p class="mb-6 leading-relaxed text-slate-700 dark:text-slate-300">
						SAPIN nace como una herramienta de <strong>investigación aplicada</strong> en el ámbito del
						aprendizaje asistido por IA conversacional. La plataforma permite explorar cómo diferentes
						configuraciones de prompts, materiales de contexto y modelos de lenguaje influyen en la experiencia
						y resultados de aprendizaje.
					</p>

					<div class="mt-8 grid gap-6 md:grid-cols-2">
						<div class="flex gap-4">
							<div class="flex-shrink-0">
								<Target class="mt-1 h-5 w-5 text-indigo-600 dark:text-indigo-400" />
							</div>
							<div>
								<h4 class="mb-1 font-semibold text-slate-900 dark:text-white">
									Intervenciones controladas
								</h4>
								<p class="text-sm text-slate-600 dark:text-slate-400">
									Diseña y compara diferentes enfoques pedagógicos manteniendo constantes otras
									variables.
								</p>
							</div>
						</div>

						<div class="flex gap-4">
							<div class="flex-shrink-0">
								<FileText class="mt-1 h-5 w-5 text-indigo-600 dark:text-indigo-400" />
							</div>
							<div>
								<h4 class="mb-1 font-semibold text-slate-900 dark:text-white">
									Datos estructurados
								</h4>
								<p class="text-sm text-slate-600 dark:text-slate-400">
									Acceso completo a los logs de conversación y métricas de interacción para análisis
									cualitativo y cuantitativo.
								</p>
							</div>
						</div>

						<div class="flex gap-4">
							<div class="flex-shrink-0">
								<Users class="mt-1 h-5 w-5 text-indigo-600 dark:text-indigo-400" />
							</div>
							<div>
								<h4 class="mb-1 font-semibold text-slate-900 dark:text-white">
									Gestión de cohortes
								</h4>
								<p class="text-sm text-slate-600 dark:text-slate-400">
									Organiza estudiantes en grupos y cursos. Sistema flexible de permisos y roles.
								</p>
							</div>
						</div>

						<div class="flex gap-4">
							<div class="flex-shrink-0">
								<Shield class="mt-1 h-5 w-5 text-indigo-600 dark:text-indigo-400" />
							</div>
							<div>
								<h4 class="mb-1 font-semibold text-slate-900 dark:text-white">
									Privacidad y control
								</h4>
								<p class="text-sm text-slate-600 dark:text-slate-400">
									Los profesores mantienen control total sobre sus cursos y los datos de sus
									estudiantes.
								</p>
							</div>
						</div>
					</div>
				</div>
			</div>
		</div>
	</section>

	<!-- Footer minimalista -->
	<section
		class="border-t border-slate-200 bg-slate-50 py-10 dark:border-slate-800 dark:bg-slate-900/50"
	>
		<div class="container mx-auto px-4">
			<div class="flex flex-col items-center justify-between gap-6 md:flex-row">
				<div class="flex items-center gap-3">
					<span
						class="bg-gradient-to-r from-blue-600 to-indigo-600 bg-clip-text text-xl font-bold text-transparent"
						>SAPIN</span
					>
					<span class="text-slate-400 dark:text-slate-500">|</span>
					<span class="text-sm text-slate-500 dark:text-slate-400"
						>Plataforma experimental de aprendizaje conversacional</span
					>
				</div>
				<div class="flex items-center gap-4">
					<Button href="/login" size="sm" color="light" class="font-medium">Acceder</Button>
					<Button
						href="/contact"
						size="sm"
						outline
						color="dark"
						class="font-medium dark:border-slate-600 dark:text-white"
					>
						Contactar
					</Button>
				</div>
			</div>
		</div>
	</section>
</div>

<style>
	:global(body) {
		scroll-behavior: smooth;
	}

	@keyframes float-slow {
		0%,
		100% {
			transform: translateY(0);
		}
		50% {
			transform: translateY(-20px);
		}
	}

	@keyframes pulse-slow {
		0%,
		100% {
			opacity: 0.5;
			transform: scale(1);
		}
		50% {
			opacity: 0.8;
			transform: scale(1.05);
		}
	}

	@keyframes bounce-slow {
		0%,
		100% {
			transform: translateY(0);
		}
		50% {
			transform: translateY(-10px);
		}
	}

	.animate-float-slow {
		animation: float-slow 6s ease-in-out infinite;
	}

	.animate-pulse-slow {
		animation: pulse-slow 8s cubic-bezier(0.4, 0, 0.6, 1) infinite;
	}

	.animate-bounce-slow {
		animation: bounce-slow 4s ease-in-out infinite;
	}

	.animate-float {
		animation: float-slow 4s ease-in-out infinite;
	}
</style>
