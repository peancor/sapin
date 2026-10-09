<script lang="ts">
	import { m } from '$lib/paraglide/messages.js';
	import {
		Heart,
		Code,
		Database,
		Palette,
		Globe,
		Brain,
		FileText,
		Shield,
		Wrench,
		Image
	} from 'lucide-svelte';
</script>

<svelte:head>
	<title>Atribuciones | SAPIN</title>
	<meta
		name="description"
		content="Tecnologías, frameworks y recursos utilizados en el desarrollo de SAPIN."
	/>
</svelte:head>

<div
	class="min-h-screen bg-gradient-to-b from-slate-50 to-white dark:from-gray-900 dark:to-gray-900"
>
	<!-- Header -->
	<div class="bg-gradient-to-r from-pink-600 to-rose-600 dark:from-pink-800 dark:to-rose-800">
		<div class="container mx-auto px-4 py-16 md:py-20">
			<div class="max-w-3xl">
				<div class="mb-4 flex items-center gap-3">
					<div class="flex h-12 w-12 items-center justify-center rounded-xl bg-white/20">
						<Heart class="h-6 w-6 text-white" />
					</div>
				</div>
				<h1 class="mb-4 text-4xl font-bold text-white md:text-5xl">
					{m.attributions()}
				</h1>
				<p class="text-xl leading-relaxed text-pink-100">
					SAPIN está construido sobre los hombros de gigantes. Gracias a todas las comunidades open
					source que hacen posible este proyecto.
				</p>
			</div>
		</div>
	</div>

	<div class="container mx-auto px-4 py-12">
		<div class="mx-auto max-w-4xl space-y-8">
			<!-- Frameworks Core -->
			<section
				class="rounded-2xl border border-slate-200 bg-white p-8 shadow-sm dark:border-slate-700 dark:bg-slate-800"
			>
				<div class="mb-6 flex items-center gap-3">
					<div
						class="flex h-10 w-10 items-center justify-center rounded-lg bg-orange-100 dark:bg-orange-900/40"
					>
						<Code class="h-5 w-5 text-orange-600 dark:text-orange-400" />
					</div>
					<h2 class="text-xl font-semibold text-slate-900 dark:text-white">
						Frameworks y Bibliotecas Core
					</h2>
				</div>
				<div class="grid gap-3 sm:grid-cols-2">
					{#each [{ name: 'SvelteKit', desc: 'Framework web moderno' }, { name: 'Svelte 5', desc: 'Framework de componentes reactivos' }, { name: 'Vite', desc: 'Herramienta de compilación' }, { name: 'Node.js', desc: 'Entorno de ejecución JavaScript' }, { name: 'TypeScript', desc: 'Superconjunto tipado de JavaScript' }, { name: 'Express', desc: 'Framework minimalista para Node.js' }] as item (item.name)}
						<div class="flex items-center gap-3 rounded-lg bg-slate-50 p-3 dark:bg-slate-900/50">
							<span class="h-2 w-2 rounded-full bg-orange-500"></span>
							<div>
								<span class="text-sm font-medium text-slate-900 dark:text-white">{item.name}</span>
								<span class="text-sm text-slate-500 dark:text-slate-400"> — {item.desc}</span>
							</div>
						</div>
					{/each}
				</div>
			</section>

			<!-- Base de datos -->
			<section
				class="rounded-2xl border border-slate-200 bg-white p-8 shadow-sm dark:border-slate-700 dark:bg-slate-800"
			>
				<div class="mb-6 flex items-center gap-3">
					<div
						class="flex h-10 w-10 items-center justify-center rounded-lg bg-blue-100 dark:bg-blue-900/40"
					>
						<Database class="h-5 w-5 text-blue-600 dark:text-blue-400" />
					</div>
					<h2 class="text-xl font-semibold text-slate-900 dark:text-white">Base de Datos y ORM</h2>
				</div>
				<div class="grid gap-3 sm:grid-cols-2">
					{#each [{ name: 'SQLite', desc: 'Motor de base de datos SQL ligero' }, { name: 'Drizzle ORM', desc: 'ORM TypeScript para SQL' }, { name: 'Drizzle Kit', desc: 'CLI para migraciones' }] as item (item.name)}
						<div class="flex items-center gap-3 rounded-lg bg-slate-50 p-3 dark:bg-slate-900/50">
							<span class="h-2 w-2 rounded-full bg-blue-500"></span>
							<div>
								<span class="text-sm font-medium text-slate-900 dark:text-white">{item.name}</span>
								<span class="text-sm text-slate-500 dark:text-slate-400"> — {item.desc}</span>
							</div>
						</div>
					{/each}
				</div>
			</section>

			<!-- UI y Estilos -->
			<section
				class="rounded-2xl border border-slate-200 bg-white p-8 shadow-sm dark:border-slate-700 dark:bg-slate-800"
			>
				<div class="mb-6 flex items-center gap-3">
					<div
						class="flex h-10 w-10 items-center justify-center rounded-lg bg-purple-100 dark:bg-purple-900/40"
					>
						<Palette class="h-5 w-5 text-purple-600 dark:text-purple-400" />
					</div>
					<h2 class="text-xl font-semibold text-slate-900 dark:text-white">UI y Estilos</h2>
				</div>
				<div class="grid gap-3 sm:grid-cols-2">
					{#each [{ name: 'Tailwind CSS', desc: 'Framework de utilidades CSS' }, { name: 'Flowbite', desc: 'Biblioteca de componentes UI' }, { name: 'Flowbite-Svelte', desc: 'Componentes Svelte' }, { name: 'Lucide Icons', desc: 'Iconos open source' }, { name: 'PostCSS', desc: 'Transformador de CSS' }] as item (item.name)}
						<div class="flex items-center gap-3 rounded-lg bg-slate-50 p-3 dark:bg-slate-900/50">
							<span class="h-2 w-2 rounded-full bg-purple-500"></span>
							<div>
								<span class="text-sm font-medium text-slate-900 dark:text-white">{item.name}</span>
								<span class="text-sm text-slate-500 dark:text-slate-400"> — {item.desc}</span>
							</div>
						</div>
					{/each}
				</div>
			</section>

			<!-- IA -->
			<section
				class="rounded-2xl border border-slate-200 bg-white p-8 shadow-sm dark:border-slate-700 dark:bg-slate-800"
			>
				<div class="mb-6 flex items-center gap-3">
					<div
						class="flex h-10 w-10 items-center justify-center rounded-lg bg-emerald-100 dark:bg-emerald-900/40"
					>
						<Brain class="h-5 w-5 text-emerald-600 dark:text-emerald-400" />
					</div>
					<h2 class="text-xl font-semibold text-slate-900 dark:text-white">
						IA y Procesamiento de Lenguaje
					</h2>
				</div>
				<div class="grid gap-3 sm:grid-cols-2">
					{#each [{ name: 'LangChain', desc: 'Framework para aplicaciones LLM' }, { name: 'OpenAI SDK', desc: 'API de OpenAI' }, { name: 'Ollama', desc: 'Modelos de IA locales' }] as item (item.name)}
						<div class="flex items-center gap-3 rounded-lg bg-slate-50 p-3 dark:bg-slate-900/50">
							<span class="h-2 w-2 rounded-full bg-emerald-500"></span>
							<div>
								<span class="text-sm font-medium text-slate-900 dark:text-white">{item.name}</span>
								<span class="text-sm text-slate-500 dark:text-slate-400"> — {item.desc}</span>
							</div>
						</div>
					{/each}
				</div>
			</section>

			<!-- Más secciones en formato compacto -->
			<div class="grid gap-6 md:grid-cols-2">
				<!-- Internacionalización -->
				<section
					class="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm dark:border-slate-700 dark:bg-slate-800"
				>
					<div class="mb-4 flex items-center gap-3">
						<div
							class="flex h-8 w-8 items-center justify-center rounded-lg bg-cyan-100 dark:bg-cyan-900/40"
						>
							<Globe class="h-4 w-4 text-cyan-600 dark:text-cyan-400" />
						</div>
						<h2 class="text-lg font-semibold text-slate-900 dark:text-white">
							Internacionalización
						</h2>
					</div>
					<p class="text-sm text-slate-600 dark:text-slate-400">
						<strong>Inlang Paraglide</strong> — Sistema i18n para SvelteKit
					</p>
				</section>

				<!-- Procesamiento de Contenido -->
				<section
					class="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm dark:border-slate-700 dark:bg-slate-800"
				>
					<div class="mb-4 flex items-center gap-3">
						<div
							class="flex h-8 w-8 items-center justify-center rounded-lg bg-indigo-100 dark:bg-indigo-900/40"
						>
							<FileText class="h-4 w-4 text-indigo-600 dark:text-indigo-400" />
						</div>
						<h2 class="text-lg font-semibold text-slate-900 dark:text-white">Contenido</h2>
					</div>
					<p class="text-sm text-slate-600 dark:text-slate-400">
						Marked, KaTeX, MDsveX, Handlebars
					</p>
				</section>

				<!-- Seguridad -->
				<section
					class="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm dark:border-slate-700 dark:bg-slate-800"
				>
					<div class="mb-4 flex items-center gap-3">
						<div
							class="flex h-8 w-8 items-center justify-center rounded-lg bg-red-100 dark:bg-red-900/40"
						>
							<Shield class="h-4 w-4 text-red-600 dark:text-red-400" />
						</div>
						<h2 class="text-lg font-semibold text-slate-900 dark:text-white">Seguridad</h2>
					</div>
					<p class="text-sm text-slate-600 dark:text-slate-400">
						Bcrypt, Argon2 — Hashing seguro de contraseñas
					</p>
				</section>

				<!-- Utilidades -->
				<section
					class="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm dark:border-slate-700 dark:bg-slate-800"
				>
					<div class="mb-4 flex items-center gap-3">
						<div
							class="flex h-8 w-8 items-center justify-center rounded-lg bg-amber-100 dark:bg-amber-900/40"
						>
							<Wrench class="h-4 w-4 text-amber-600 dark:text-amber-400" />
						</div>
						<h2 class="text-lg font-semibold text-slate-900 dark:text-white">Utilidades</h2>
					</div>
					<p class="text-sm text-slate-600 dark:text-slate-400">
						Nodemailer, CSV-Parse, ESLint, Prettier
					</p>
				</section>
			</div>

			<!-- Recursos Gráficos -->
			<section
				class="rounded-2xl border border-pink-100 bg-gradient-to-br from-pink-50 to-rose-50 p-8 dark:border-pink-800 dark:from-pink-900/20 dark:to-rose-900/20"
			>
				<div class="mb-4 flex items-center gap-3">
					<Image class="h-5 w-5 text-pink-600 dark:text-pink-400" />
					<h2 class="text-lg font-semibold text-slate-900 dark:text-white">Recursos Gráficos</h2>
				</div>
				<p class="mb-2 text-sm text-slate-700 dark:text-slate-300">
					<a
						href="https://game-icons.net/tags/creature.html"
						target="_blank"
						rel="noopener noreferrer"
						class="font-medium text-pink-600 hover:underline dark:text-pink-400"
					>
						Game-icons.net
					</a>
					— Iconos de criaturas bajo licencia
					<a
						href="https://creativecommons.org/licenses/by/3.0/"
						target="_blank"
						rel="noopener noreferrer"
						class="text-pink-600 hover:underline dark:text-pink-400">CC BY 3.0</a
					>
				</p>
				<p class="text-sm text-slate-600 dark:text-slate-400">
					Los logos e imágenes de SAPIN son propiedad intelectual del proyecto y sus colaboradores.
				</p>
			</section>
		</div>
	</div>
</div>
