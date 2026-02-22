<script lang="ts">
	import { m } from '$lib/paraglide/messages.js';
	import { Lightbulb, MessageSquare, BarChart3, Users, Target, FlaskConical } from 'lucide-svelte';
</script>

<svelte:head>
	<title>Acerca de SAPIN | Plataforma de Aprendizaje Conversacional</title>
	<meta name="description" content="SAPIN es una plataforma experimental para diseñar experiencias de aprendizaje conversacional con asistentes de IA." />
</svelte:head>

<div class="min-h-screen bg-gradient-to-b from-slate-50 to-white dark:from-gray-900 dark:to-gray-900">
	<!-- Header -->
	<div class="bg-gradient-to-r from-indigo-600 to-purple-600 dark:from-indigo-800 dark:to-purple-800">
		<div class="container mx-auto px-4 py-16 md:py-20">
			<div class="max-w-3xl">
				<div class="flex items-center gap-3 mb-4">
					<div class="w-12 h-12 bg-white/20 rounded-xl flex items-center justify-center">
						<FlaskConical class="w-6 h-6 text-white" />
					</div>
					<span class="text-indigo-200 font-medium">Plataforma Experimental</span>
				</div>
				<h1 class="text-4xl md:text-5xl font-bold text-white mb-4">
					{m.about()}
				</h1>
				<p class="text-xl text-indigo-100 leading-relaxed">
					SAPIN es una plataforma de investigación para diseñar y evaluar experiencias 
					de aprendizaje basadas en conversación con asistentes de IA.
				</p>
			</div>
		</div>
	</div>

	<div class="container mx-auto px-4 py-12">
		<div class="max-w-4xl mx-auto">
			<!-- Qué es SAPIN -->
			<section class="mb-12">
				<div class="bg-white dark:bg-slate-800 rounded-2xl p-8 border border-slate-200 dark:border-slate-700 shadow-sm">
					<h2 class="text-2xl font-bold text-slate-900 dark:text-white mb-4">¿Qué es SAPIN?</h2>
					<p class="text-slate-600 dark:text-slate-300 leading-relaxed mb-4">
						SAPIN (<strong>S</strong>istema de <strong>A</strong>prendizaje <strong>P</strong>ersonalizado e <strong>IN</strong>teractivo) 
						es una plataforma experimental que permite a docentes e investigadores diseñar experiencias de aprendizaje 
						basadas en conversaciones guiadas con asistentes de inteligencia artificial.
					</p>
					<p class="text-slate-600 dark:text-slate-300 leading-relaxed">
						A diferencia de los chatbots genéricos, SAPIN permite configurar asistentes especializados para cada 
						actividad de aprendizaje, con objetivos definidos, materiales de contexto y criterios específicos.
					</p>
				</div>
			</section>

			<!-- Características principales -->
			<section class="mb-12">
				<h2 class="text-xl font-semibold text-slate-900 dark:text-white mb-6">Capacidades de la plataforma</h2>
				<div class="grid md:grid-cols-2 gap-4">
					<div class="bg-white dark:bg-slate-800 rounded-xl p-6 border border-slate-200 dark:border-slate-700">
						<div class="w-10 h-10 bg-indigo-100 dark:bg-indigo-900/40 rounded-lg flex items-center justify-center mb-4">
							<Lightbulb class="w-5 h-5 text-indigo-600 dark:text-indigo-400" />
						</div>
						<h3 class="font-semibold text-slate-900 dark:text-white mb-2">Diseño de experiencias</h3>
						<p class="text-sm text-slate-600 dark:text-slate-400">
							Configura asistentes con prompts específicos, materiales de referencia y múltiples modelos de IA.
						</p>
					</div>

					<div class="bg-white dark:bg-slate-800 rounded-xl p-6 border border-slate-200 dark:border-slate-700">
						<div class="w-10 h-10 bg-blue-100 dark:bg-blue-900/40 rounded-lg flex items-center justify-center mb-4">
							<MessageSquare class="w-5 h-5 text-blue-600 dark:text-blue-400" />
						</div>
						<h3 class="font-semibold text-slate-900 dark:text-white mb-2">Aprendizaje conversacional</h3>
						<p class="text-sm text-slate-600 dark:text-slate-400">
							Los estudiantes interactúan con asistentes especializados que guían su aprendizaje.
						</p>
					</div>

					<div class="bg-white dark:bg-slate-800 rounded-xl p-6 border border-slate-200 dark:border-slate-700">
						<div class="w-10 h-10 bg-emerald-100 dark:bg-emerald-900/40 rounded-lg flex items-center justify-center mb-4">
							<BarChart3 class="w-5 h-5 text-emerald-600 dark:text-emerald-400" />
						</div>
						<h3 class="font-semibold text-slate-900 dark:text-white mb-2">Analítica detallada</h3>
						<p class="text-sm text-slate-600 dark:text-slate-400">
							Acceso completo a los logs de conversación y métricas de interacción.
						</p>
					</div>

					<div class="bg-white dark:bg-slate-800 rounded-xl p-6 border border-slate-200 dark:border-slate-700">
						<div class="w-10 h-10 bg-purple-100 dark:bg-purple-900/40 rounded-lg flex items-center justify-center mb-4">
							<Users class="w-5 h-5 text-purple-600 dark:text-purple-400" />
						</div>
						<h3 class="font-semibold text-slate-900 dark:text-white mb-2">Gestión de cursos</h3>
						<p class="text-sm text-slate-600 dark:text-slate-400">
							Organiza estudiantes en grupos y cursos con sistema flexible de permisos.
						</p>
					</div>
				</div>
			</section>

			<!-- Enfoque -->
			<section>
				<div class="bg-gradient-to-br from-indigo-50 to-purple-50 dark:from-indigo-900/20 dark:to-purple-900/20 rounded-2xl p-8 border border-indigo-100 dark:border-indigo-800">
					<div class="flex items-center gap-3 mb-4">
						<Target class="w-6 h-6 text-indigo-600 dark:text-indigo-400" />
						<h2 class="text-xl font-semibold text-slate-900 dark:text-white">Nuestro enfoque</h2>
					</div>
					<p class="text-slate-700 dark:text-slate-300 leading-relaxed">
						SAPIN nace como una herramienta de investigación aplicada en el ámbito del aprendizaje 
						asistido por IA conversacional. Creemos que el futuro de la educación pasa por experiencias 
						personalizadas y adaptativas, y esta plataforma es nuestro laboratorio para explorar esas posibilidades.
					</p>
				</div>
			</section>
		</div>
	</div>
</div>