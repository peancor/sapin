<script lang="ts">
	import ImmersiveToolLauncherCard from '$lib/components/agent/ImmersiveToolLauncherCard.svelte';

	interface Props {
		title?: string;
		testType?: 'trail_making' | 'wcst';
		onopen?: () => void;
	}

	let { title, testType = 'trail_making', onopen }: Props = $props();

	const summaryItems = $derived(
		testType === 'wcst'
			? [
					{ label: 'Familia', value: 'WCST' },
					{ label: 'Estado', value: 'Preparado' },
					{ label: 'Motor', value: 'Roadmap' }
				]
			: [
					{ label: 'Familia', value: 'TMT' },
					{ label: 'Estado', value: 'Preparado' },
					{ label: 'Motor', value: 'Roadmap' }
				]
	);
</script>

<ImmersiveToolLauncherCard
	title={title ?? (testType === 'wcst' ? 'Wisconsin Card Sorting Test' : 'Trail Making Test')}
	description="Abre la ficha inmersiva de la familia de flexibilidad ejecutiva. Esta primera entrega deja lista la estructura y la UX base para TMT y WCST."
	badge="Funcion ejecutiva"
	completed={false}
	summaryItems={summaryItems}
	statusText="Pulsa para ver la estructura prevista y el alcance de la siguiente ola."
	actionLabel="Abrir roadmap"
	accentClass="from-lime-400 via-emerald-500 to-teal-600"
	onopen={onopen}
/>
