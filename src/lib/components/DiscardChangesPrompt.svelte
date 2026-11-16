<script lang="ts">
	import { Button } from 'flowbite-svelte';
	import type { DiscardGuard } from '$lib/utils/discardGuard.svelte';

	interface Props {
		guard: DiscardGuard;
		/** Cierra el modal y limpia el formulario. */
		ondiscard: () => void;
		message?: string;
	}

	let {
		guard,
		ondiscard,
		message = 'Hay datos sin guardar. ¿Quieres descartarlos y cerrar?'
	}: Props = $props();

	const uid = $props.id();

	function discard() {
		guard.reset();
		ondiscard();
	}
</script>

<!-- La región de estado existe siempre para que los lectores de pantalla anuncien el aviso. -->
<div role="status" id={`${uid}-discard`}>
	{#if guard.confirmDiscard}
		<div
			class="flex flex-wrap items-center justify-between gap-3 rounded-lg bg-yellow-50 p-3 text-sm text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-300"
		>
			<span>{message}</span>
			<div class="flex gap-2">
				<Button
					type="button"
					size="xs"
					color="red"
					outline
					aria-describedby={`${uid}-discard`}
					onclick={discard}
				>
					Descartar y cerrar
				</Button>
				<Button type="button" size="xs" color="alternative" onclick={guard.keepEditing}>
					Seguir editando
				</Button>
			</div>
		</div>
	{/if}
</div>
