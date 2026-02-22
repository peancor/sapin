<script lang="ts">
	import { m } from '$lib/paraglide/messages.js';
	import { Cookie, Shield, Settings, Info } from 'lucide-svelte';
</script>

<svelte:head>
	<title>Política de Cookies | SAPIN</title>
	<meta name="description" content="Información sobre las cookies que utiliza SAPIN y cómo gestionarlas." />
</svelte:head>

<div class="min-h-screen bg-gradient-to-b from-slate-50 to-white dark:from-gray-900 dark:to-gray-900">
	<!-- Header -->
	<div class="bg-gradient-to-r from-amber-500 to-orange-500 dark:from-amber-700 dark:to-orange-700">
		<div class="container mx-auto px-4 py-16 md:py-20">
			<div class="max-w-3xl">
				<div class="flex items-center gap-3 mb-4">
					<div class="w-12 h-12 bg-white/20 rounded-xl flex items-center justify-center">
						<Cookie class="w-6 h-6 text-white" />
					</div>
				</div>
				<h1 class="text-4xl md:text-5xl font-bold text-white mb-4">
					{m.cookiePolicy()}
				</h1>
				<p class="text-xl text-amber-100 leading-relaxed">
					Información sobre las cookies que utilizamos y cómo puedes gestionarlas.
				</p>
			</div>
		</div>
	</div>

	<div class="container mx-auto px-4 py-12">
		<div class="max-w-3xl mx-auto space-y-8">
			<!-- Qué son -->
			<section class="bg-white dark:bg-slate-800 rounded-2xl p-8 border border-slate-200 dark:border-slate-700 shadow-sm">
				<div class="flex items-center gap-3 mb-4">
					<div class="w-10 h-10 bg-amber-100 dark:bg-amber-900/40 rounded-lg flex items-center justify-center">
						<Info class="w-5 h-5 text-amber-600 dark:text-amber-400" />
					</div>
					<h2 class="text-xl font-semibold text-slate-900 dark:text-white">¿Qué son las cookies?</h2>
				</div>
				<p class="text-slate-600 dark:text-slate-300 leading-relaxed">
					Las cookies son pequeños archivos de texto que se almacenan en tu dispositivo cuando visitas nuestro sitio web. 
					Nos ayudan a recordar tus preferencias y a mejorar tu experiencia de uso.
				</p>
			</section>

			<!-- Tipos -->
			<section class="bg-white dark:bg-slate-800 rounded-2xl p-8 border border-slate-200 dark:border-slate-700 shadow-sm">
				<div class="flex items-center gap-3 mb-6">
					<div class="w-10 h-10 bg-blue-100 dark:bg-blue-900/40 rounded-lg flex items-center justify-center">
						<Shield class="w-5 h-5 text-blue-600 dark:text-blue-400" />
					</div>
					<h2 class="text-xl font-semibold text-slate-900 dark:text-white">Tipos de Cookies que Utilizamos</h2>
				</div>
				
				<div class="space-y-4">
					<div class="bg-slate-50 dark:bg-slate-900/50 rounded-xl p-5 border border-slate-100 dark:border-slate-700">
						<h3 class="font-semibold text-slate-900 dark:text-white mb-2">Cookies Esenciales</h3>
						<p class="text-sm text-slate-600 dark:text-slate-400">
							Necesarias para el funcionamiento básico del sitio. Incluyen la gestión de sesión 
							y la autenticación de usuarios. No se pueden desactivar.
						</p>
					</div>

					<div class="bg-slate-50 dark:bg-slate-900/50 rounded-xl p-5 border border-slate-100 dark:border-slate-700">
						<h3 class="font-semibold text-slate-900 dark:text-white mb-2">Cookies de Funcionalidad</h3>
						<p class="text-sm text-slate-600 dark:text-slate-400">
							Permiten recordar tus preferencias, como el idioma o el tema visual (claro/oscuro).
						</p>
					</div>
				</div>
			</section>

			<!-- Gestión -->
			<section class="bg-white dark:bg-slate-800 rounded-2xl p-8 border border-slate-200 dark:border-slate-700 shadow-sm">
				<div class="flex items-center gap-3 mb-4">
					<div class="w-10 h-10 bg-emerald-100 dark:bg-emerald-900/40 rounded-lg flex items-center justify-center">
						<Settings class="w-5 h-5 text-emerald-600 dark:text-emerald-400" />
					</div>
					<h2 class="text-xl font-semibold text-slate-900 dark:text-white">Gestión de Cookies</h2>
				</div>
				<p class="text-slate-600 dark:text-slate-300 leading-relaxed">
					Puedes gestionar las cookies a través de la configuración de tu navegador. 
					Ten en cuenta que deshabilitar ciertas cookies puede afectar la funcionalidad del sitio 
					y tu experiencia de uso.
				</p>
			</section>

			<!-- Nota -->
			<section class="bg-gradient-to-br from-amber-50 to-orange-50 dark:from-amber-900/20 dark:to-orange-900/20 rounded-2xl p-6 border border-amber-100 dark:border-amber-800">
				<p class="text-sm text-amber-800 dark:text-amber-200">
					<strong>Nota:</strong> SAPIN no utiliza cookies de seguimiento ni de publicidad. 
					Solo empleamos las cookies estrictamente necesarias para el funcionamiento de la plataforma.
				</p>
			</section>
		</div>
	</div>
</div>