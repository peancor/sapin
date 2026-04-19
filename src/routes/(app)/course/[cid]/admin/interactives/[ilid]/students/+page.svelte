<script lang="ts">
	import { page } from '$app/state';
	import type { PageProps } from './$types';
	import StudentsPageHeader from './_components/StudentsPageHeader.svelte';
	import AgentStudentsView from './_views/AgentStudentsView.svelte';
	import ChatStudentsView from './_views/ChatStudentsView.svelte';
	import LessonStudentsView from './_views/LessonStudentsView.svelte';

	let { data }: PageProps = $props();

	const courseId = $derived(page.params.cid ?? '');
	const interactiveId = $derived(page.params.ilid ?? '');

	const heading = $derived.by(() => {
		switch (data.view) {
			case 'lesson':
				return `Alumnado: ${data.interactive.name}`;
			case 'agent':
				return `Estudiantes del agente: ${data.interactive.name}`;
			case 'chat':
				return `Estudiantes del chat: ${data.interactive.name}`;
		}
	});

	const subtitle = $derived.by(() => {
		switch (data.view) {
			case 'lesson':
				return 'Seguimiento del alumnado por intentos, estado y progreso de lesson.';
			case 'agent':
				return 'Seguimiento de participación y finalización en la actividad agéntica.';
			case 'chat':
				return 'Seguimiento de participación y finalización en la actividad de chat.';
		}
	});

	const documentTitle = $derived.by(() => {
		switch (data.view) {
			case 'lesson':
				return `Estudiantes de lesson · ${data.interactive.name}`;
			case 'agent':
				return `Estudiantes del agente · ${data.interactive.name}`;
			case 'chat':
				return `Estudiantes del chat · ${data.interactive.name}`;
		}
	});
</script>

<svelte:head>
	<title>{documentTitle}</title>
</svelte:head>

<div class="min-h-screen bg-gray-50 dark:bg-gray-900">
	<StudentsPageHeader
		{courseId}
		{interactiveId}
		title={heading}
		subtitle={subtitle}
	/>

	<div class="container mx-auto max-w-screen-xl px-4 py-6">
		{#if data.view === 'lesson'}
			<LessonStudentsView
				data={data}
				{courseId}
				{interactiveId}
			/>
		{:else if data.view === 'agent'}
			<AgentStudentsView data={data} />
		{:else}
			<ChatStudentsView data={data} />
		{/if}
	</div>
</div>
