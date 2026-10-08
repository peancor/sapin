<script lang="ts">
	import { m } from '$lib/paraglide/messages.js';
	import { Lightbulb, MessageSquare, BarChart3, Users, Target, FlaskConical } from 'lucide-svelte';
</script>

<svelte:head>
	<title>Acerca de SAPIN | Plataforma de Aprendizaje Conversacional</title>
	<meta
		name="description"
		content="SAPIN es una plataforma experimental para diseñar experiencias de aprendizaje conversacional con asistentes de IA."
	/>
</svelte:head>

<div
	class="min-h-screen bg-gradient-to-b from-slate-50 to-white dark:from-gray-900 dark:to-gray-900"
>
	<!-- Header -->
	<div
		class="bg-gradient-to-r from-indigo-600 to-purple-600 dark:from-indigo-800 dark:to-purple-800"
	>
		<div class="container mx-auto px-4 py-16 md:py-20">
			<div class="max-w-3xl">
				<div class="mb-4 flex items-center gap-3">
					<div class="flex h-12 w-12 items-center justify-center rounded-xl bg-white/20">
						<FlaskConical class="h-6 w-6 text-white" />
					</div>
					<span class="font-medium text-indigo-200">Plataforma Experimental</span>
				</div>
				<h1 class="mb-4 text-4xl font-bold text-white md:text-5xl">
					{m.about()}
				</h1>
				<p class="text-xl leading-relaxed text-indigo-100">
					SAPIN es una plataforma de investigación para diseñar y evaluar experiencias de
					aprendizaje basadas en conversación con asistentes de IA.
				</p>
			</div>
		</div>
	</div>

	<div class="container mx-auto px-4 py-12">
		<div class="mx-auto max-w-4xl">
			<!-- Qué es SAPIN -->
			<section class="mb-12">
				<div
					class="rounded-2xl border border-slate-200 bg-white p-8 shadow-sm dark:border-slate-700 dark:bg-slate-800"
				>
					<h2 class="mb-4 text-2xl font-bold text-slate-900 dark:text-white">¿Qué es SAPIN?</h2>
					<p class="mb-4 leading-relaxed text-slate-600 dark:text-slate-300">
						SAPIN (<strong>S</strong>istema de <strong>A</strong>prendizaje
						<strong>P</strong>ersonalizado e <strong>IN</strong>teractivo) es una plataforma
						experimental que permite a docentes e investigadores diseñar experiencias de aprendizaje
						basadas en conversaciones guiadas con asistentes de inteligencia artificial.
					</p>
					<p class="leading-relaxed text-slate-600 dark:text-slate-300">
						A diferencia de los chatbots genéricos, SAPIN permite configurar asistentes
						especializados para cada actividad de aprendizaje, con objetivos definidos, materiales
						de contexto y criterios específicos.
					</p>
				</div>
			</section>

			<!-- Características principales -->
			<section class="mb-12">
				<h2 class="mb-6 text-xl font-semibold text-slate-900 dark:text-white">
					Capacidades de la plataforma
				</h2>
				<div class="grid gap-4 md:grid-cols-2">
					<div
						class="rounded-xl border border-slate-200 bg-white p-6 dark:border-slate-700 dark:bg-slate-800"
					>
						<div
							class="mb-4 flex h-10 w-10 items-center justify-center rounded-lg bg-indigo-100 dark:bg-indigo-900/40"
						>
							<Lightbulb class="h-5 w-5 text-indigo-600 dark:text-indigo-400" />
						</div>
						<h3 class="mb-2 font-semibold text-slate-900 dark:text-white">
							Diseño de experiencias
						</h3>
						<p class="text-sm text-slate-600 dark:text-slate-400">
							Configura asistentes con prompts específicos, materiales de referencia y múltiples
							modelos de IA.
						</p>
					</div>

					<div
						class="rounded-xl border border-slate-200 bg-white p-6 dark:border-slate-700 dark:bg-slate-800"
					>
						<div
							class="mb-4 flex h-10 w-10 items-center justify-center rounded-lg bg-blue-100 dark:bg-blue-900/40"
						>
							<MessageSquare class="h-5 w-5 text-blue-600 dark:text-blue-400" />
						</div>
						<h3 class="mb-2 font-semibold text-slate-900 dark:text-white">
							Aprendizaje conversacional
						</h3>
						<p class="text-sm text-slate-600 dark:text-slate-400">
							Los estudiantes interactúan con asistentes especializados que guían su aprendizaje.
						</p>
					</div>

					<div
						class="rounded-xl border border-slate-200 bg-white p-6 dark:border-slate-700 dark:bg-slate-800"
					>
						<div
							class="mb-4 flex h-10 w-10 items-center justify-center rounded-lg bg-emerald-100 dark:bg-emerald-900/40"
						>
							<BarChart3 class="h-5 w-5 text-emerald-600 dark:text-emerald-400" />
						</div>
						<h3 class="mb-2 font-semibold text-slate-900 dark:text-white">Analítica detallada</h3>
						<p class="text-sm text-slate-600 dark:text-slate-400">
							Acceso completo a los logs de conversación y métricas de interacción.
						</p>
					</div>

					<div
						class="rounded-xl border border-slate-200 bg-white p-6 dark:border-slate-700 dark:bg-slate-800"
					>
						<div
							class="mb-4 flex h-10 w-10 items-center justify-center rounded-lg bg-purple-100 dark:bg-purple-900/40"
						>
							<Users class="h-5 w-5 text-purple-600 dark:text-purple-400" />
						</div>
						<h3 class="mb-2 font-semibold text-slate-900 dark:text-white">Gestión de cursos</h3>
						<p class="text-sm text-slate-600 dark:text-slate-400">
							Organiza estudiantes en grupos y cursos con sistema flexible de permisos.
						</p>
					</div>
				</div>
			</section>

			<!-- Enfoque -->
			<section>
				<div
					class="rounded-2xl border border-indigo-100 bg-gradient-to-br from-indigo-50 to-purple-50 p-8 dark:border-indigo-800 dark:from-indigo-900/20 dark:to-purple-900/20"
				>
					<div class="mb-4 flex items-center gap-3">
						<Target class="h-6 w-6 text-indigo-600 dark:text-indigo-400" />
						<h2 class="text-xl font-semibold text-slate-900 dark:text-white">Nuestro enfoque</h2>
					</div>
					<p class="leading-relaxed text-slate-700 dark:text-slate-300">
						SAPIN nace como una herramienta de investigación aplicada en el ámbito del aprendizaje
						asistido por IA conversacional. Creemos que el futuro de la educación pasa por
						experiencias personalizadas y adaptativas, y esta plataforma es nuestro laboratorio para
						explorar esas posibilidades.
					</p>
				</div>
			</section>
		</div>
	</div>
</div>
