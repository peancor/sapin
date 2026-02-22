<script lang="ts">
	import { m } from '$lib/paraglide/messages.js';
	import { Heart, Code, Database, Palette, Globe, Brain, FileText, Shield, Wrench, Image } from 'lucide-svelte';
</script>

<svelte:head>
	<title>Atribuciones | SAPIN</title>
	<meta name="description" content="Tecnologías, frameworks y recursos utilizados en el desarrollo de SAPIN." />
</svelte:head>

<div class="min-h-screen bg-gradient-to-b from-slate-50 to-white dark:from-gray-900 dark:to-gray-900">
	<!-- Header -->
	<div class="bg-gradient-to-r from-pink-600 to-rose-600 dark:from-pink-800 dark:to-rose-800">
		<div class="container mx-auto px-4 py-16 md:py-20">
			<div class="max-w-3xl">
				<div class="flex items-center gap-3 mb-4">
					<div class="w-12 h-12 bg-white/20 rounded-xl flex items-center justify-center">
						<Heart class="w-6 h-6 text-white" />
					</div>
				</div>
				<h1 class="text-4xl md:text-5xl font-bold text-white mb-4">
					{m.attributions()}
				</h1>
				<p class="text-xl text-pink-100 leading-relaxed">
					SAPIN está construido sobre los hombros de gigantes. Gracias a todas las 
					comunidades open source que hacen posible este proyecto.
				</p>
			</div>
		</div>
	</div>

	<div class="container mx-auto px-4 py-12">
		<div class="max-w-4xl mx-auto space-y-8">
			<!-- Frameworks Core -->
			<section class="bg-white dark:bg-slate-800 rounded-2xl p-8 border border-slate-200 dark:border-slate-700 shadow-sm">
				<div class="flex items-center gap-3 mb-6">
					<div class="w-10 h-10 bg-orange-100 dark:bg-orange-900/40 rounded-lg flex items-center justify-center">
						<Code class="w-5 h-5 text-orange-600 dark:text-orange-400" />
					</div>
					<h2 class="text-xl font-semibold text-slate-900 dark:text-white">Frameworks y Bibliotecas Core</h2>
				</div>
				<div class="grid sm:grid-cols-2 gap-3">
					{#each [
						{ name: 'SvelteKit', desc: 'Framework web moderno' },
						{ name: 'Svelte 5', desc: 'Framework de componentes reactivos' },
						{ name: 'Vite', desc: 'Herramienta de compilación' },
						{ name: 'Node.js', desc: 'Entorno de ejecución JavaScript' },
						{ name: 'TypeScript', desc: 'Superconjunto tipado de JavaScript' },
						{ name: 'Express', desc: 'Framework minimalista para Node.js' }
					] as item}
						<div class="flex items-center gap-3 p-3 bg-slate-50 dark:bg-slate-900/50 rounded-lg">
							<span class="w-2 h-2 bg-orange-500 rounded-full"></span>
							<div>
								<span class="font-medium text-slate-900 dark:text-white text-sm">{item.name}</span>
								<span class="text-slate-500 dark:text-slate-400 text-sm"> — {item.desc}</span>
							</div>
						</div>
					{/each}
				</div>
			</section>

			<!-- Base de datos -->
			<section class="bg-white dark:bg-slate-800 rounded-2xl p-8 border border-slate-200 dark:border-slate-700 shadow-sm">
				<div class="flex items-center gap-3 mb-6">
					<div class="w-10 h-10 bg-blue-100 dark:bg-blue-900/40 rounded-lg flex items-center justify-center">
						<Database class="w-5 h-5 text-blue-600 dark:text-blue-400" />
					</div>
					<h2 class="text-xl font-semibold text-slate-900 dark:text-white">Base de Datos y ORM</h2>
				</div>
				<div class="grid sm:grid-cols-2 gap-3">
					{#each [
						{ name: 'SQLite', desc: 'Motor de base de datos SQL ligero' },
						{ name: 'Drizzle ORM', desc: 'ORM TypeScript para SQL' },
						{ name: 'Drizzle Kit', desc: 'CLI para migraciones' }
					] as item}
						<div class="flex items-center gap-3 p-3 bg-slate-50 dark:bg-slate-900/50 rounded-lg">
							<span class="w-2 h-2 bg-blue-500 rounded-full"></span>
							<div>
								<span class="font-medium text-slate-900 dark:text-white text-sm">{item.name}</span>
								<span class="text-slate-500 dark:text-slate-400 text-sm"> — {item.desc}</span>
							</div>
						</div>
					{/each}
				</div>
			</section>

			<!-- UI y Estilos -->
			<section class="bg-white dark:bg-slate-800 rounded-2xl p-8 border border-slate-200 dark:border-slate-700 shadow-sm">
				<div class="flex items-center gap-3 mb-6">
					<div class="w-10 h-10 bg-purple-100 dark:bg-purple-900/40 rounded-lg flex items-center justify-center">
						<Palette class="w-5 h-5 text-purple-600 dark:text-purple-400" />
					</div>
					<h2 class="text-xl font-semibold text-slate-900 dark:text-white">UI y Estilos</h2>
				</div>
				<div class="grid sm:grid-cols-2 gap-3">
					{#each [
						{ name: 'Tailwind CSS', desc: 'Framework de utilidades CSS' },
						{ name: 'Flowbite', desc: 'Biblioteca de componentes UI' },
						{ name: 'Flowbite-Svelte', desc: 'Componentes Svelte' },
						{ name: 'Lucide Icons', desc: 'Iconos open source' },
						{ name: 'PostCSS', desc: 'Transformador de CSS' }
					] as item}
						<div class="flex items-center gap-3 p-3 bg-slate-50 dark:bg-slate-900/50 rounded-lg">
							<span class="w-2 h-2 bg-purple-500 rounded-full"></span>
							<div>
								<span class="font-medium text-slate-900 dark:text-white text-sm">{item.name}</span>
								<span class="text-slate-500 dark:text-slate-400 text-sm"> — {item.desc}</span>
							</div>
						</div>
					{/each}
				</div>
			</section>

			<!-- IA -->
			<section class="bg-white dark:bg-slate-800 rounded-2xl p-8 border border-slate-200 dark:border-slate-700 shadow-sm">
				<div class="flex items-center gap-3 mb-6">
					<div class="w-10 h-10 bg-emerald-100 dark:bg-emerald-900/40 rounded-lg flex items-center justify-center">
						<Brain class="w-5 h-5 text-emerald-600 dark:text-emerald-400" />
					</div>
					<h2 class="text-xl font-semibold text-slate-900 dark:text-white">IA y Procesamiento de Lenguaje</h2>
				</div>
				<div class="grid sm:grid-cols-2 gap-3">
					{#each [
						{ name: 'LangChain', desc: 'Framework para aplicaciones LLM' },
						{ name: 'OpenAI SDK', desc: 'API de OpenAI' },
						{ name: 'Ollama', desc: 'Modelos de IA locales' }
					] as item}
						<div class="flex items-center gap-3 p-3 bg-slate-50 dark:bg-slate-900/50 rounded-lg">
							<span class="w-2 h-2 bg-emerald-500 rounded-full"></span>
							<div>
								<span class="font-medium text-slate-900 dark:text-white text-sm">{item.name}</span>
								<span class="text-slate-500 dark:text-slate-400 text-sm"> — {item.desc}</span>
							</div>
						</div>
					{/each}
				</div>
			</section>

			<!-- Más secciones en formato compacto -->
			<div class="grid md:grid-cols-2 gap-6">
				<!-- Internacionalización -->
				<section class="bg-white dark:bg-slate-800 rounded-2xl p-6 border border-slate-200 dark:border-slate-700 shadow-sm">
					<div class="flex items-center gap-3 mb-4">
						<div class="w-8 h-8 bg-cyan-100 dark:bg-cyan-900/40 rounded-lg flex items-center justify-center">
							<Globe class="w-4 h-4 text-cyan-600 dark:text-cyan-400" />
						</div>
						<h2 class="text-lg font-semibold text-slate-900 dark:text-white">Internacionalización</h2>
					</div>
					<p class="text-sm text-slate-600 dark:text-slate-400">
						<strong>Inlang Paraglide</strong> — Sistema i18n para SvelteKit
					</p>
				</section>

				<!-- Procesamiento de Contenido -->
				<section class="bg-white dark:bg-slate-800 rounded-2xl p-6 border border-slate-200 dark:border-slate-700 shadow-sm">
					<div class="flex items-center gap-3 mb-4">
						<div class="w-8 h-8 bg-indigo-100 dark:bg-indigo-900/40 rounded-lg flex items-center justify-center">
							<FileText class="w-4 h-4 text-indigo-600 dark:text-indigo-400" />
						</div>
						<h2 class="text-lg font-semibold text-slate-900 dark:text-white">Contenido</h2>
					</div>
					<p class="text-sm text-slate-600 dark:text-slate-400">
						Marked, KaTeX, MDsveX, Handlebars
					</p>
				</section>

				<!-- Seguridad -->
				<section class="bg-white dark:bg-slate-800 rounded-2xl p-6 border border-slate-200 dark:border-slate-700 shadow-sm">
					<div class="flex items-center gap-3 mb-4">
						<div class="w-8 h-8 bg-red-100 dark:bg-red-900/40 rounded-lg flex items-center justify-center">
							<Shield class="w-4 h-4 text-red-600 dark:text-red-400" />
						</div>
						<h2 class="text-lg font-semibold text-slate-900 dark:text-white">Seguridad</h2>
					</div>
					<p class="text-sm text-slate-600 dark:text-slate-400">
						Bcrypt, Argon2 — Hashing seguro de contraseñas
					</p>
				</section>

				<!-- Utilidades -->
				<section class="bg-white dark:bg-slate-800 rounded-2xl p-6 border border-slate-200 dark:border-slate-700 shadow-sm">
					<div class="flex items-center gap-3 mb-4">
						<div class="w-8 h-8 bg-amber-100 dark:bg-amber-900/40 rounded-lg flex items-center justify-center">
							<Wrench class="w-4 h-4 text-amber-600 dark:text-amber-400" />
						</div>
						<h2 class="text-lg font-semibold text-slate-900 dark:text-white">Utilidades</h2>
					</div>
					<p class="text-sm text-slate-600 dark:text-slate-400">
						Nodemailer, CSV-Parse, ESLint, Prettier
					</p>
				</section>
			</div>

			<!-- Recursos Gráficos -->
			<section class="bg-gradient-to-br from-pink-50 to-rose-50 dark:from-pink-900/20 dark:to-rose-900/20 rounded-2xl p-8 border border-pink-100 dark:border-pink-800">
				<div class="flex items-center gap-3 mb-4">
					<Image class="w-5 h-5 text-pink-600 dark:text-pink-400" />
					<h2 class="text-lg font-semibold text-slate-900 dark:text-white">Recursos Gráficos</h2>
				</div>
				<p class="text-slate-700 dark:text-slate-300 text-sm mb-2">
					<a href="https://game-icons.net/tags/creature.html" target="_blank" rel="noopener noreferrer" class="text-pink-600 dark:text-pink-400 hover:underline font-medium">
						Game-icons.net
					</a> — Iconos de criaturas bajo licencia 
					<a href="https://creativecommons.org/licenses/by/3.0/" target="_blank" rel="noopener noreferrer" class="text-pink-600 dark:text-pink-400 hover:underline">CC BY 3.0</a>
				</p>
				<p class="text-slate-600 dark:text-slate-400 text-sm">
					Los logos e imágenes de SAPIN son propiedad intelectual del proyecto y sus colaboradores.
				</p>
			</section>
		</div>
	</div>
</div>