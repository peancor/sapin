<script lang="ts">
	import { resolve } from '$app/paths';
	import { m } from '$lib/paraglide/messages.js';
	import { Shield, Database, Eye, Lock, UserCheck, Mail } from 'lucide-svelte';
</script>

<svelte:head>
	<title>Política de Privacidad | SAPIN</title>
	<meta
		name="description"
		content="Política de privacidad de SAPIN. Información sobre cómo recopilamos, usamos y protegemos tus datos."
	/>
</svelte:head>

<div
	class="min-h-screen bg-gradient-to-b from-slate-50 to-white dark:from-gray-900 dark:to-gray-900"
>
	<!-- Header -->
	<div class="bg-gradient-to-r from-emerald-600 to-teal-600 dark:from-emerald-800 dark:to-teal-800">
		<div class="container mx-auto px-4 py-16 md:py-20">
			<div class="max-w-3xl">
				<div class="mb-4 flex items-center gap-3">
					<div class="flex h-12 w-12 items-center justify-center rounded-xl bg-white/20">
						<Shield class="h-6 w-6 text-white" />
					</div>
				</div>
				<h1 class="mb-4 text-4xl font-bold text-white md:text-5xl">
					{m.privacyPolicy()}
				</h1>
				<p class="text-xl leading-relaxed text-emerald-100">
					Tu privacidad es importante. Aquí explicamos cómo tratamos tus datos.
				</p>
			</div>
		</div>
	</div>

	<div class="container mx-auto px-4 py-12">
		<div class="mx-auto max-w-3xl space-y-8">
			<!-- Recopilación -->
			<section
				class="rounded-2xl border border-slate-200 bg-white p-8 shadow-sm dark:border-slate-700 dark:bg-slate-800"
			>
				<div class="mb-4 flex items-center gap-3">
					<div
						class="flex h-10 w-10 items-center justify-center rounded-lg bg-blue-100 dark:bg-blue-900/40"
					>
						<Database class="h-5 w-5 text-blue-600 dark:text-blue-400" />
					</div>
					<h2 class="text-xl font-semibold text-slate-900 dark:text-white">
						Recopilación de Información
					</h2>
				</div>
				<p class="leading-relaxed text-slate-600 dark:text-slate-300">
					Recopilamos información necesaria para proporcionar y mejorar nuestros servicios
					educativos, incluyendo información de perfil, datos de uso, interacciones con los
					asistentes de IA y progreso académico.
				</p>
			</section>

			<!-- Uso -->
			<section
				class="rounded-2xl border border-slate-200 bg-white p-8 shadow-sm dark:border-slate-700 dark:bg-slate-800"
			>
				<div class="mb-4 flex items-center gap-3">
					<div
						class="flex h-10 w-10 items-center justify-center rounded-lg bg-indigo-100 dark:bg-indigo-900/40"
					>
						<Eye class="h-5 w-5 text-indigo-600 dark:text-indigo-400" />
					</div>
					<h2 class="text-xl font-semibold text-slate-900 dark:text-white">
						Uso de la Información
					</h2>
				</div>
				<p class="mb-4 text-slate-600 dark:text-slate-300">
					La información recopilada se utiliza para:
				</p>
				<ul class="space-y-2">
					<li class="flex items-center gap-3 text-slate-600 dark:text-slate-300">
						<span class="h-1.5 w-1.5 rounded-full bg-indigo-500"></span>
						Personalizar la experiencia de aprendizaje
					</li>
					<li class="flex items-center gap-3 text-slate-600 dark:text-slate-300">
						<span class="h-1.5 w-1.5 rounded-full bg-indigo-500"></span>
						Mejorar nuestros servicios educativos mediante análisis
					</li>
					<li class="flex items-center gap-3 text-slate-600 dark:text-slate-300">
						<span class="h-1.5 w-1.5 rounded-full bg-indigo-500"></span>
						Proporcionar soporte técnico
					</li>
					<li class="flex items-center gap-3 text-slate-600 dark:text-slate-300">
						<span class="h-1.5 w-1.5 rounded-full bg-indigo-500"></span>
						Facilitar la investigación educativa (datos anonimizados)
					</li>
				</ul>
			</section>

			<!-- Protección -->
			<section
				class="rounded-2xl border border-slate-200 bg-white p-8 shadow-sm dark:border-slate-700 dark:bg-slate-800"
			>
				<div class="mb-4 flex items-center gap-3">
					<div
						class="flex h-10 w-10 items-center justify-center rounded-lg bg-emerald-100 dark:bg-emerald-900/40"
					>
						<Lock class="h-5 w-5 text-emerald-600 dark:text-emerald-400" />
					</div>
					<h2 class="text-xl font-semibold text-slate-900 dark:text-white">Protección de Datos</h2>
				</div>
				<p class="leading-relaxed text-slate-600 dark:text-slate-300">
					Implementamos medidas de seguridad técnicas y organizativas para proteger tu información
					personal. Cumplimos con las regulaciones de protección de datos aplicables, incluyendo el
					RGPD.
				</p>
			</section>

			<!-- Derechos -->
			<section
				class="rounded-2xl border border-slate-200 bg-white p-8 shadow-sm dark:border-slate-700 dark:bg-slate-800"
			>
				<div class="mb-4 flex items-center gap-3">
					<div
						class="flex h-10 w-10 items-center justify-center rounded-lg bg-purple-100 dark:bg-purple-900/40"
					>
						<UserCheck class="h-5 w-5 text-purple-600 dark:text-purple-400" />
					</div>
					<h2 class="text-xl font-semibold text-slate-900 dark:text-white">Tus Derechos</h2>
				</div>
				<p class="leading-relaxed text-slate-600 dark:text-slate-300">
					Tienes derecho a acceder, rectificar, eliminar y portar tus datos personales. Puedes
					ejercer estos derechos contactándonos en cualquier momento.
				</p>
			</section>

			<!-- Contacto -->
			<section
				class="rounded-2xl border border-emerald-100 bg-gradient-to-br from-emerald-50 to-teal-50 p-8 dark:border-emerald-800 dark:from-emerald-900/20 dark:to-teal-900/20"
			>
				<div class="mb-4 flex items-center gap-3">
					<Mail class="h-5 w-5 text-emerald-600 dark:text-emerald-400" />
					<h2 class="text-lg font-semibold text-slate-900 dark:text-white">
						¿Preguntas sobre privacidad?
					</h2>
				</div>
				<p class="text-sm text-slate-700 dark:text-slate-300">
					Si tienes dudas sobre cómo tratamos tus datos, contacta con nosotros en
					<a
						href={resolve('/contact')}
						class="font-medium text-emerald-600 hover:underline dark:text-emerald-400"
						>nuestra página de contacto</a
					>.
				</p>
			</section>
		</div>
	</div>
</div>
