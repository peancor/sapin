<script lang="ts">
	import { goto } from '$app/navigation';
    import { onMount } from 'svelte';
    import type { PageData } from './$types';

    let { data }: { data: PageData } = $props();
    let msg: string = $state("");

	onMount(() => {
		if (data.chatId) {
			msg = "redirigiendo a la actividad...";
			console.log('Chat ID:', data.chatId);
			setTimeout(() => {
				// redirigimos a la pagina de chat
				goto(`/course/${data.course.id}/run/chat/${data.chatId}`);
			}, 1000);
		} else if (data.error) {
			msg = "Error: " + data.error;
			console.error('Error:', data.error);
		}
	});
</script>

<p>{msg}</p>

