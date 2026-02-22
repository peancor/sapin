<script lang="ts">
	import { onMount, onDestroy } from 'svelte';
	import { page } from '$app/state';
	import { beforeNavigate, afterNavigate } from '$app/navigation';
	import TopbarMenu from '$lib/components/TopbarMenu.svelte';
	import Footer from '$lib/components/Footer.svelte';
	import { initAnalytics, destroyAnalytics, trackPageView, setUserId } from '$lib/stores/analytics';

	let { children, data } = $props();
	let isMobileMenuOpen = $state(false);

	function handleMenuToggle() {
		isMobileMenuOpen = !isMobileMenuOpen;
	}

	// Inicializar analytics
	onMount(async () => {
		await initAnalytics(data.user?.id);
	});

	onDestroy(() => {
		destroyAnalytics();
	});

	// Actualizar userId cuando cambie el usuario
	$effect(() => {
		setUserId(data.user?.id);
	});

	// Trackear navegación
	afterNavigate(({ to }) => {
		if (to?.url) {
			trackPageView(to.url.pathname, document.title);
		}
	});
</script>

<div class="flex min-h-screen flex-col bg-white dark:bg-gray-900">
	<TopbarMenu user={data.user} {isMobileMenuOpen} onMenuToggle={handleMenuToggle} />

	<main class="flex-1 bg-gray-50 pt-16 md:pt-[4.5rem] dark:bg-gray-800">
		<div class="container mx-auto px-4 py-4">
			{@render children()}
		</div>
	</main>

	<Footer />
</div>

<style>
</style>
