<!-- Footer component -->
<script lang="ts">
	import { m } from '$lib/paraglide/messages.js';
	import { Hr } from 'flowbite-svelte';
	import { Mail } from 'lucide-svelte';
	import { page } from '$app/state';

	const hasSidebarLayout = $derived(
		page.url.pathname.startsWith('/admin') ||
			/^\/course\/[^/]+\/admin(\/|$)/.test(page.url.pathname)
	);
</script>

<footer
	class={`mt-auto bg-linear-to-r from-gray-100 to-gray-200 dark:from-gray-800 dark:to-gray-900 ${hasSidebarLayout ? 'lg:ml-64' : ''}`}
>
	<div class="container mx-auto px-6 py-8">
		<div class="grid grid-cols-1 gap-8 md:grid-cols-3">
			<!-- Enlaces rápidos -->
			<div>
				<h2 class="mb-4 text-sm font-semibold text-gray-900 uppercase dark:text-white">
					Enlaces rápidos
				</h2>
				<ul class="space-y-3 text-gray-600 dark:text-gray-400">
					<li>
						<a href="/about" class="hover:text-blue-600 hover:underline dark:hover:text-blue-500">
							{m.about()}
						</a>
					</li>
					<li>
						<a
							href="/attributions"
							class="hover:text-blue-600 hover:underline dark:hover:text-blue-500"
						>
							{m.attributions()}
						</a>
					</li>
				</ul>
			</div>

			<!-- Políticas -->
			<div>
				<h2 class="mb-4 text-sm font-semibold text-gray-900 uppercase dark:text-white">Legal</h2>
				<ul class="space-y-3 text-gray-600 dark:text-gray-400">
					<li>
						<a href="/privacy" class="hover:text-blue-600 hover:underline dark:hover:text-blue-500">
							{m.privacyPolicy()}
						</a>
					</li>
					<li>
						<a href="/cookies" class="hover:text-blue-600 hover:underline dark:hover:text-blue-500">
							{m.cookiePolicy()}
						</a>
					</li>
				</ul>
			</div>

			<!-- Contacto -->
			<div>
				<h2 class="mb-4 text-sm font-semibold text-gray-900 uppercase dark:text-white">Contacto</h2>
				<div class="flex items-center">
					<Mail size={16} class="mr-2 text-gray-600 dark:text-gray-400" />
					<a
						href="/contact"
						class="text-gray-600 hover:text-blue-600 dark:text-gray-400 dark:hover:text-blue-500"
					>
						{m.contact()}
					</a>
				</div>
			</div>
		</div>

		<Hr class="my-5 border-gray-300 dark:border-gray-700" />

		<!-- Copyright -->
		<div class="text-center">
			<p class="text-sm text-gray-600 dark:text-gray-400">
				{new Date().getFullYear()} SAPIN. {m.allRightsReserved()}
			</p>
		</div>
	</div>
</footer>

<style>
	footer {
		box-shadow: 0 -2px 4px -1px rgba(0, 0, 0, 0.06);
	}
</style>
