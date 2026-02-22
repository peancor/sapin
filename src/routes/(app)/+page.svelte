<script lang="ts">
	import { onMount } from 'svelte';
	import type { PageData } from './$types';
	import {
		GraduationCap,
		BookOpen,
		Sparkles,
		Users,
		CheckCircle,
		ArrowRight,
		Shield,
		Zap,
		MessageSquare,
		BrainCircuit,
		Rocket,
		MonitorPlay,
		FlaskConical,
		BarChart3,
		FileText,
		Lightbulb,
		Target,
		Microscope
	} from 'lucide-svelte';
	import { Button, Card, GradientButton, Badge } from 'flowbite-svelte';
	import ParticlesBackground from '$lib/components/ParticlesBackground.svelte';
	import { fade, fly, scale, blur } from 'svelte/transition';

	let { data }: { data: PageData } = $props();

	let visible = $state(false);
	onMount(() => {
		visible = true;
	});
</script>

<svelte:head>
	<title>SAPIN | Plataforma de Investigación en Aprendizaje Conversacional con IA</title>
	<meta name="description" content="SAPIN es una plataforma experimental para diseñar y evaluar experiencias de aprendizaje conversacional con asistentes de IA. Analítica avanzada para investigación educativa." />
	<meta name="keywords" content="aprendizaje conversacional, IA educativa, investigación educativa, learning analytics, tutores inteligentes, innovación docente" />
	<meta property="og:title" content="SAPIN | Investigación en Aprendizaje Conversacional" />
	<meta property="og:description" content="Plataforma experimental para el diseño y evaluación de experiencias de aprendizaje basadas en conversación con IA." />
	<meta property="og:image" content="/images/sapin_anime.webp" />
	<meta name="twitter:card" content="summary_large_image" />
</svelte:head>

<div class="relative overflow-hidden bg-white dark:bg-gray-900 transition-colors duration-500 -mt-4">
	<!-- Background Effects -->
	<div class="absolute inset-0 z-0 pointer-events-none">
		<ParticlesBackground color="#4f46e5" opacity={0.12} particleCount={50} />
		<div class="absolute top-0 left-0 w-full h-full bg-[radial-gradient(circle_at_50%_20%,rgba(120,119,198,0.08),transparent)] dark:bg-[radial-gradient(circle_at_50%_20%,rgba(120,119,198,0.15),transparent)]"></div>
	</div>

	<!-- Hero Section -->
	<section class="relative flex items-center pt-8 pb-12">
		<div class="container mx-auto px-4 relative z-10">
			<div class="flex flex-col lg:flex-row items-center gap-16">
				<!-- Text Content -->
				<div class="flex-1 text-center lg:text-left">
					{#if visible}
						<div in:fly={{ y: 20, duration: 800 }} class="inline-block mb-6">
							<Badge color="gray" class="px-4 py-1.5 rounded-full text-sm font-medium tracking-wide shadow-sm bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300">
								<FlaskConical class="w-4 h-4 mr-2 inline-block" />
								Plataforma de Investigación Educativa
							</Badge>
						</div>

						<h1 in:fly={{ y: 30, duration: 800, delay: 200 }} class="text-5xl md:text-6xl lg:text-7xl font-black mb-8 leading-[1.1]">
							<span class="bg-gradient-to-r from-blue-600 via-indigo-600 to-purple-600 bg-clip-text text-transparent dark:from-blue-400 dark:via-indigo-400 dark:to-purple-400 drop-shadow-sm">
								SAPIN
							</span>
							<br />
							<span class="text-slate-900 dark:text-white text-4xl md:text-5xl lg:text-5xl font-bold">
								Aprendizaje <span class="bg-indigo-100 dark:bg-indigo-900/30 px-2 rounded-lg">conversacional</span>
							</span>
						</h1>

						<p in:fly={{ y: 30, duration: 800, delay: 400 }} class="text-xl md:text-2xl text-slate-600 dark:text-slate-300 mb-10 max-w-2xl mx-auto lg:mx-0 leading-relaxed font-light">
							Diseña <span class="font-semibold text-indigo-600 dark:text-indigo-400">experiencias de aprendizaje a medida</span> basadas en conversaciones con asistentes de IA. Gestiona cursos y obtén analítica detallada de las interacciones.
						</p>

						<div in:fly={{ y: 30, duration: 800, delay: 600 }} class="flex flex-col sm:flex-row gap-5 justify-center lg:justify-start">
							<GradientButton
								href="/login"
								size="xl"
								color="purpleToBlue"
								class="px-10 py-4 text-lg font-bold shadow-xl shadow-blue-500/20 transform hover:scale-105 transition-all duration-300"
							>
								<span class="flex items-center gap-3">
									Acceder
									<ArrowRight class="w-5 h-5" />
								</span>
							</GradientButton>
							<Button
								href="/contact"
								size="xl"
								outline
								color="dark"
								class="px-10 py-4 text-lg font-bold border-2 transform hover:scale-105 transition-all duration-300 dark:border-slate-700 dark:text-white"
							>
								Contactar
							</Button>
						</div>
					{/if}
				</div>

				<!-- Logo/Image Container -->
				<div class="flex-1 relative">
					{#if visible}
						<div in:scale={{ duration: 1000, start: 0.8, delay: 300 }} class="relative z-10">
							<!-- Animated Glow -->
							<div class="absolute inset-0 bg-blue-500/15 dark:bg-blue-600/20 blur-[100px] rounded-full animate-pulse-slow"></div>
							
							<!-- Main Animated Logo -->
							<div class="relative group cursor-none">
								<img 
									src="/images/sapin_anime.webp" 
									alt="SAPIN Logo"
									class="w-full max-w-[500px] mx-auto filter drop-shadow-[0_20px_50px_rgba(0,0,0,0.15)] dark:drop-shadow-[0_20px_50px_rgba(255,255,255,0.03)] transform group-hover:rotate-2 group-hover:scale-105 transition-all duration-700 animate-float-slow"
								/>
								
								<!-- Floating Badges -->
								<div class="absolute -top-8 -right-4 bg-white dark:bg-slate-800 p-3 rounded-xl shadow-lg animate-bounce-slow hidden sm:block border border-slate-100 dark:border-slate-700">
									<BrainCircuit class="w-6 h-6 text-indigo-500 mb-1" />
									<span class="text-xs font-medium text-slate-600 dark:text-slate-400">Asistente IA</span>
								</div>
								
								<div class="absolute -bottom-8 -left-4 bg-white dark:bg-slate-800 p-3 rounded-xl shadow-lg animate-float hidden sm:block border border-slate-100 dark:border-slate-700" style="animation-delay: 1s;">
									<BarChart3 class="w-6 h-6 text-emerald-500 mb-1" />
									<span class="text-xs font-medium text-slate-600 dark:text-slate-400">Analítica</span>
								</div>
							</div>
						</div>
					{/if}
				</div>
			</div>
		</div>
	</section>

	<!-- Pilares de la Plataforma -->
	<section class="py-16 bg-slate-50/80 dark:bg-slate-900/50 relative overflow-hidden">
		<div class="container mx-auto px-4 relative z-10">
			<div class="text-center max-w-3xl mx-auto mb-14">
				<h2 class="text-sm font-semibold text-slate-500 dark:text-slate-400 tracking-widest uppercase mb-4">Arquitectura de la plataforma</h2>
				<h3 class="text-3xl md:text-4xl font-bold text-slate-900 dark:text-white mb-6 leading-tight">
					Un entorno completo para la <span class="text-indigo-600 dark:text-indigo-400">investigación educativa</span>
				</h3>
				<p class="text-lg text-slate-600 dark:text-slate-400">
					SAPIN integra diseño instruccional, interacción conversacional con IA y herramientas de análisis 
					en una única plataforma orientada a la investigación y mejora de la práctica docente.
				</p>
			</div>

			<div class="grid md:grid-cols-3 gap-8">
				<!-- Pilar 1: Diseño de Experiencias -->
				<div class="group p-8 bg-white dark:bg-slate-800/50 rounded-2xl border border-slate-200 dark:border-slate-700/50 hover:border-indigo-200 dark:hover:border-indigo-800 transition-all duration-300">
					<div class="w-14 h-14 bg-indigo-100 dark:bg-indigo-900/40 rounded-xl flex items-center justify-center mb-6">
						<Lightbulb class="w-7 h-7 text-indigo-600 dark:text-indigo-400" />
					</div>
					<h4 class="text-xl font-semibold text-slate-900 dark:text-white mb-3">Diseño de Experiencias</h4>
					<p class="text-slate-600 dark:text-slate-400 leading-relaxed text-sm mb-4">
						Configura asistentes de IA con prompts específicos para cada actividad de aprendizaje. 
						Define objetivos, materiales de referencia y criterios de evaluación.
					</p>
					<ul class="space-y-2 text-sm text-slate-500 dark:text-slate-400">
						<li class="flex items-center gap-2">
							<CheckCircle class="w-4 h-4 text-emerald-500" />
							<span>Prompts personalizables</span>
						</li>
						<li class="flex items-center gap-2">
							<CheckCircle class="w-4 h-4 text-emerald-500" />
							<span>Materiales de contexto (RAG)</span>
						</li>
						<li class="flex items-center gap-2">
							<CheckCircle class="w-4 h-4 text-emerald-500" />
							<span>Múltiples modelos de IA</span>
						</li>
					</ul>
				</div>

				<!-- Pilar 2: Interacción Conversacional -->
				<div class="group p-8 bg-white dark:bg-slate-800/50 rounded-2xl border border-slate-200 dark:border-slate-700/50 hover:border-blue-200 dark:hover:border-blue-800 transition-all duration-300">
					<div class="w-14 h-14 bg-blue-100 dark:bg-blue-900/40 rounded-xl flex items-center justify-center mb-6">
						<MessageSquare class="w-7 h-7 text-blue-600 dark:text-blue-400" />
					</div>
					<h4 class="text-xl font-semibold text-slate-900 dark:text-white mb-3">Aprendizaje Conversacional</h4>
					<p class="text-slate-600 dark:text-slate-400 leading-relaxed text-sm mb-4">
						Los estudiantes interactúan con asistentes de IA especializados que guían su aprendizaje 
						mediante diálogos estructurados y feedback contextualizado.
					</p>
					<ul class="space-y-2 text-sm text-slate-500 dark:text-slate-400">
						<li class="flex items-center gap-2">
							<CheckCircle class="w-4 h-4 text-emerald-500" />
							<span>Chat guiado por objetivos</span>
						</li>
						<li class="flex items-center gap-2">
							<CheckCircle class="w-4 h-4 text-emerald-500" />
							<span>Feedback formativo inmediato</span>
						</li>
						<li class="flex items-center gap-2">
							<CheckCircle class="w-4 h-4 text-emerald-500" />
							<span>Sesiones persistentes</span>
						</li>
					</ul>
				</div>

				<!-- Pilar 3: Analítica -->
				<div class="group p-8 bg-white dark:bg-slate-800/50 rounded-2xl border border-slate-200 dark:border-slate-700/50 hover:border-emerald-200 dark:hover:border-emerald-800 transition-all duration-300">
					<div class="w-14 h-14 bg-emerald-100 dark:bg-emerald-900/40 rounded-xl flex items-center justify-center mb-6">
						<BarChart3 class="w-7 h-7 text-emerald-600 dark:text-emerald-400" />
					</div>
					<h4 class="text-xl font-semibold text-slate-900 dark:text-white mb-3">Analítica Avanzada</h4>
					<p class="text-slate-600 dark:text-slate-400 leading-relaxed text-sm mb-4">
						Accede a métricas detalladas de las interacciones: patrones de uso, calidad del diálogo, 
						progresión en objetivos y exportación de datos para análisis externo.
					</p>
					<ul class="space-y-2 text-sm text-slate-500 dark:text-slate-400">
						<li class="flex items-center gap-2">
							<CheckCircle class="w-4 h-4 text-emerald-500" />
							<span>Historial completo de chats</span>
						</li>
						<li class="flex items-center gap-2">
							<CheckCircle class="w-4 h-4 text-emerald-500" />
							<span>Métricas de engagement</span>
						</li>
						<li class="flex items-center gap-2">
							<CheckCircle class="w-4 h-4 text-emerald-500" />
							<span>Exportación de datos</span>
						</li>
					</ul>
				</div>
			</div>
		</div>
	</section>

	<!-- Sección para Investigadores/Evaluadores -->
	<section class="py-16 bg-white dark:bg-gray-900 relative">
		<div class="container mx-auto px-4">
			<div class="max-w-4xl mx-auto">
				<div class="flex items-center gap-3 mb-8 justify-center">
					<div class="w-10 h-10 bg-slate-100 dark:bg-slate-800 rounded-lg flex items-center justify-center">
						<Microscope class="w-5 h-5 text-slate-600 dark:text-slate-400" />
					</div>
					<h2 class="text-2xl font-bold text-slate-900 dark:text-white">Para investigadores y evaluadores</h2>
				</div>
				
				<div class="bg-gradient-to-br from-slate-50 to-indigo-50/50 dark:from-slate-800/50 dark:to-indigo-900/20 rounded-2xl p-8 md:p-10 border border-slate-200 dark:border-slate-700">
					<p class="text-slate-700 dark:text-slate-300 leading-relaxed mb-6">
						SAPIN nace como una herramienta de <strong>investigación aplicada</strong> en el ámbito del aprendizaje 
						asistido por IA conversacional. La plataforma permite explorar cómo diferentes configuraciones de prompts, 
						materiales de contexto y modelos de lenguaje influyen en la experiencia y resultados de aprendizaje.
					</p>
					
					<div class="grid md:grid-cols-2 gap-6 mt-8">
						<div class="flex gap-4">
							<div class="flex-shrink-0">
								<Target class="w-5 h-5 text-indigo-600 dark:text-indigo-400 mt-1" />
							</div>
							<div>
								<h4 class="font-semibold text-slate-900 dark:text-white mb-1">Intervenciones controladas</h4>
								<p class="text-sm text-slate-600 dark:text-slate-400">
									Diseña y compara diferentes enfoques pedagógicos manteniendo constantes otras variables.
								</p>
							</div>
						</div>
						
						<div class="flex gap-4">
							<div class="flex-shrink-0">
								<FileText class="w-5 h-5 text-indigo-600 dark:text-indigo-400 mt-1" />
							</div>
							<div>
								<h4 class="font-semibold text-slate-900 dark:text-white mb-1">Datos estructurados</h4>
								<p class="text-sm text-slate-600 dark:text-slate-400">
									Acceso completo a los logs de conversación y métricas de interacción para análisis cualitativo y cuantitativo.
								</p>
							</div>
						</div>
						
						<div class="flex gap-4">
							<div class="flex-shrink-0">
								<Users class="w-5 h-5 text-indigo-600 dark:text-indigo-400 mt-1" />
							</div>
							<div>
								<h4 class="font-semibold text-slate-900 dark:text-white mb-1">Gestión de cohortes</h4>
								<p class="text-sm text-slate-600 dark:text-slate-400">
									Organiza estudiantes en grupos y cursos. Sistema flexible de permisos y roles.
								</p>
							</div>
						</div>
						
						<div class="flex gap-4">
							<div class="flex-shrink-0">
								<Shield class="w-5 h-5 text-indigo-600 dark:text-indigo-400 mt-1" />
							</div>
							<div>
								<h4 class="font-semibold text-slate-900 dark:text-white mb-1">Privacidad y control</h4>
								<p class="text-sm text-slate-600 dark:text-slate-400">
									Los profesores mantienen control total sobre sus cursos y los datos de sus estudiantes.
								</p>
							</div>
						</div>
					</div>
				</div>
			</div>
		</div>
	</section>

	<!-- Footer minimalista -->
	<section class="py-10 bg-slate-50 dark:bg-slate-900/50 border-t border-slate-200 dark:border-slate-800">
		<div class="container mx-auto px-4">
			<div class="flex flex-col md:flex-row items-center justify-between gap-6">
				<div class="flex items-center gap-3">
					<span class="text-xl font-bold bg-gradient-to-r from-blue-600 to-indigo-600 bg-clip-text text-transparent">SAPIN</span>
					<span class="text-slate-400 dark:text-slate-500">|</span>
					<span class="text-sm text-slate-500 dark:text-slate-400">Plataforma experimental de aprendizaje conversacional</span>
				</div>
				<div class="flex items-center gap-4">
					<Button href="/login" size="sm" color="light" class="font-medium">
						Acceder
					</Button>
					<Button href="/contact" size="sm" outline color="dark" class="font-medium dark:text-white dark:border-slate-600">
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
		0%, 100% { transform: translateY(0); }
		50% { transform: translateY(-20px); }
	}

	@keyframes pulse-slow {
		0%, 100% { opacity: 0.5; transform: scale(1); }
		50% { opacity: 0.8; transform: scale(1.05); }
	}

	@keyframes bounce-slow {
		0%, 100% { transform: translateY(0); }
		50% { transform: translateY(-10px); }
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
