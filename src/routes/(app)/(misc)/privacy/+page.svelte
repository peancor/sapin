<script lang="ts">
	import { m } from '$lib/paraglide/messages.js';
	import { Shield, Database, Eye, Lock, UserCheck, Mail } from 'lucide-svelte';
</script>

<svelte:head>
	<title>Política de Privacidad | SAPIN</title>
	<meta name="description" content="Política de privacidad de SAPIN. Información sobre cómo recopilamos, usamos y protegemos tus datos." />
</svelte:head>

<div class="min-h-screen bg-gradient-to-b from-slate-50 to-white dark:from-gray-900 dark:to-gray-900">
	<!-- Header -->
	<div class="bg-gradient-to-r from-emerald-600 to-teal-600 dark:from-emerald-800 dark:to-teal-800">
		<div class="container mx-auto px-4 py-16 md:py-20">
			<div class="max-w-3xl">
				<div class="flex items-center gap-3 mb-4">
					<div class="w-12 h-12 bg-white/20 rounded-xl flex items-center justify-center">
						<Shield class="w-6 h-6 text-white" />
					</div>
				</div>
				<h1 class="text-4xl md:text-5xl font-bold text-white mb-4">
					{m.privacyPolicy()}
				</h1>
				<p class="text-xl text-emerald-100 leading-relaxed">
					Tu privacidad es importante. Aquí explicamos cómo tratamos tus datos.
				</p>
			</div>
		</div>
	</div>

	<div class="container mx-auto px-4 py-12">
		<div class="max-w-3xl mx-auto space-y-8">
			<!-- Recopilación -->
			<section class="bg-white dark:bg-slate-800 rounded-2xl p-8 border border-slate-200 dark:border-slate-700 shadow-sm">
				<div class="flex items-center gap-3 mb-4">
					<div class="w-10 h-10 bg-blue-100 dark:bg-blue-900/40 rounded-lg flex items-center justify-center">
						<Database class="w-5 h-5 text-blue-600 dark:text-blue-400" />
					</div>
					<h2 class="text-xl font-semibold text-slate-900 dark:text-white">Recopilación de Información</h2>
				</div>
				<p class="text-slate-600 dark:text-slate-300 leading-relaxed">
					Recopilamos información necesaria para proporcionar y mejorar nuestros servicios educativos, 
					incluyendo información de perfil, datos de uso, interacciones con los asistentes de IA y progreso académico.
				</p>
			</section>

			<!-- Uso -->
			<section class="bg-white dark:bg-slate-800 rounded-2xl p-8 border border-slate-200 dark:border-slate-700 shadow-sm">
				<div class="flex items-center gap-3 mb-4">
					<div class="w-10 h-10 bg-indigo-100 dark:bg-indigo-900/40 rounded-lg flex items-center justify-center">
						<Eye class="w-5 h-5 text-indigo-600 dark:text-indigo-400" />
					</div>
					<h2 class="text-xl font-semibold text-slate-900 dark:text-white">Uso de la Información</h2>
				</div>
				<p class="text-slate-600 dark:text-slate-300 mb-4">La información recopilada se utiliza para:</p>
				<ul class="space-y-2">
					<li class="flex items-center gap-3 text-slate-600 dark:text-slate-300">
						<span class="w-1.5 h-1.5 bg-indigo-500 rounded-full"></span>
						Personalizar la experiencia de aprendizaje
					</li>
					<li class="flex items-center gap-3 text-slate-600 dark:text-slate-300">
						<span class="w-1.5 h-1.5 bg-indigo-500 rounded-full"></span>
						Mejorar nuestros servicios educativos mediante análisis
					</li>
					<li class="flex items-center gap-3 text-slate-600 dark:text-slate-300">
						<span class="w-1.5 h-1.5 bg-indigo-500 rounded-full"></span>
						Proporcionar soporte técnico
					</li>
					<li class="flex items-center gap-3 text-slate-600 dark:text-slate-300">
						<span class="w-1.5 h-1.5 bg-indigo-500 rounded-full"></span>
						Facilitar la investigación educativa (datos anonimizados)
					</li>
				</ul>
			</section>

			<!-- Protección -->
			<section class="bg-white dark:bg-slate-800 rounded-2xl p-8 border border-slate-200 dark:border-slate-700 shadow-sm">
				<div class="flex items-center gap-3 mb-4">
					<div class="w-10 h-10 bg-emerald-100 dark:bg-emerald-900/40 rounded-lg flex items-center justify-center">
						<Lock class="w-5 h-5 text-emerald-600 dark:text-emerald-400" />
					</div>
					<h2 class="text-xl font-semibold text-slate-900 dark:text-white">Protección de Datos</h2>
				</div>
				<p class="text-slate-600 dark:text-slate-300 leading-relaxed">
					Implementamos medidas de seguridad técnicas y organizativas para proteger tu información personal. 
					Cumplimos con las regulaciones de protección de datos aplicables, incluyendo el RGPD.
				</p>
			</section>

			<!-- Derechos -->
			<section class="bg-white dark:bg-slate-800 rounded-2xl p-8 border border-slate-200 dark:border-slate-700 shadow-sm">
				<div class="flex items-center gap-3 mb-4">
					<div class="w-10 h-10 bg-purple-100 dark:bg-purple-900/40 rounded-lg flex items-center justify-center">
						<UserCheck class="w-5 h-5 text-purple-600 dark:text-purple-400" />
					</div>
					<h2 class="text-xl font-semibold text-slate-900 dark:text-white">Tus Derechos</h2>
				</div>
				<p class="text-slate-600 dark:text-slate-300 leading-relaxed">
					Tienes derecho a acceder, rectificar, eliminar y portar tus datos personales. 
					Puedes ejercer estos derechos contactándonos en cualquier momento.
				</p>
			</section>

			<!-- Contacto -->
			<section class="bg-gradient-to-br from-emerald-50 to-teal-50 dark:from-emerald-900/20 dark:to-teal-900/20 rounded-2xl p-8 border border-emerald-100 dark:border-emerald-800">
				<div class="flex items-center gap-3 mb-4">
					<Mail class="w-5 h-5 text-emerald-600 dark:text-emerald-400" />
					<h2 class="text-lg font-semibold text-slate-900 dark:text-white">¿Preguntas sobre privacidad?</h2>
				</div>
				<p class="text-slate-700 dark:text-slate-300 text-sm">
					Si tienes dudas sobre cómo tratamos tus datos, contacta con nosotros en 
					<a href="/contact" class="text-emerald-600 dark:text-emerald-400 hover:underline font-medium">nuestra página de contacto</a>.
				</p>
			</section>
		</div>
	</div>
</div>