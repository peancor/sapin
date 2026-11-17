<script lang="ts">
	import { dialogs } from '$lib/stores/dialogs.svelte';

	const dialogId = $props.id();
	let dialogElement: HTMLDialogElement | null = $state(null);
	let inputValue = $state('');

	const request = $derived(dialogs.current);

	// <dialog> nativo abierto como modal: página inerte, foco contenido, Esc y devolución del
	// foco corren a cargo del navegador.
	$effect(() => {
		if (!dialogElement) return;
		if (request) {
			if (request.kind === 'prompt') inputValue = request.value ?? '';
			if (!dialogElement.open) dialogElement.showModal();
		} else if (dialogElement.open) {
			dialogElement.close();
		}
	});

	function handleClose() {
		if (!dialogElement) return;
		// Esc y otros cierres no fijan valor: '' significa «descartado sin elegir».
		const accepted = dialogElement.returnValue === 'confirm';
		dialogElement.returnValue = '';
		if (!dialogs.current) return;
		if (dialogs.current.kind === 'prompt') dialogs.settle(accepted ? inputValue : null);
		else dialogs.settle(accepted);
	}
</script>

<dialog
	bind:this={dialogElement}
	aria-labelledby="{dialogId}-title"
	aria-describedby={request?.kind === 'confirm' && request.message
		? `${dialogId}-message`
		: undefined}
	onclose={handleClose}
	class="app-dialog m-auto w-[calc(100%-2rem)] max-w-md rounded-2xl border border-gray-200 bg-white p-0 text-gray-900 shadow-2xl dark:border-gray-700 dark:bg-gray-900 dark:text-gray-100"
>
	{#if request}
		<form method="dialog" class="flex flex-col gap-4 p-6">
			<h2 id="{dialogId}-title" class="text-lg font-semibold">{request.title}</h2>

			{#if request.kind === 'confirm'}
				{#if request.message}
					<p id="{dialogId}-message" class="text-sm text-gray-600 dark:text-gray-300">
						{request.message}
					</p>
				{/if}
			{:else}
				<div class="flex flex-col gap-1.5">
					<label for="{dialogId}-input" class="text-sm font-medium">{request.label}</label>
					<!-- svelte-ignore a11y_autofocus -->
					<input
						id="{dialogId}-input"
						type={request.inputType ?? 'text'}
						bind:value={inputValue}
						autofocus
						autocomplete="off"
						class="rounded-lg border border-gray-300 bg-white px-3 py-2 text-base text-gray-900 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-100"
					/>
				</div>
			{/if}

			<div class="mt-2 flex justify-end gap-3">
				<!-- En acciones irreversibles el foco inicial va a la opción segura. -->
				<!-- svelte-ignore a11y_autofocus -->
				<button
					type="submit"
					value="cancel"
					formnovalidate
					autofocus={request.kind === 'confirm' && request.destructive === true}
					class="rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 dark:border-gray-600 dark:text-gray-200 dark:hover:bg-gray-800"
				>
					{request.cancelLabel ?? 'Cancelar'}
				</button>
				<!-- svelte-ignore a11y_autofocus -->
				<button
					type="submit"
					value="confirm"
					autofocus={request.kind === 'confirm' && request.destructive !== true}
					class="rounded-lg px-4 py-2 text-sm font-medium text-white {request.kind === 'confirm' &&
					request.destructive
						? 'bg-red-700 hover:bg-red-800'
						: 'bg-blue-700 hover:bg-blue-800'}"
				>
					{request.confirmLabel ?? 'Aceptar'}
				</button>
			</div>
		</form>
	{/if}
</dialog>

<style>
	.app-dialog::backdrop {
		background: rgb(0 0 0 / 0.5);
	}
</style>
