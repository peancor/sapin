/**
 * Diálogos de confirmación y de entrada de texto de la aplicación, en sustitución de
 * `window.confirm()` y `window.prompt()`. Los pinta `DialogHost` (layout raíz) con un
 * `<dialog>` nativo; aquí solo vive la petición en curso.
 */
export interface ConfirmOptions {
	title: string;
	message?: string;
	confirmLabel?: string;
	cancelLabel?: string;
	/** Acción irreversible: botón rojo y foco inicial en «Cancelar». */
	destructive?: boolean;
}

export interface PromptOptions {
	title: string;
	label: string;
	value?: string;
	confirmLabel?: string;
	cancelLabel?: string;
	inputType?: 'text' | 'url';
}

export type DialogRequest =
	| ({ kind: 'confirm'; resolve: (value: boolean) => void } & ConfirmOptions)
	| ({ kind: 'prompt'; resolve: (value: string | null) => void } & PromptOptions);

class DialogStore {
	current = $state<DialogRequest | null>(null);
	private queue: DialogRequest[] = [];

	open(request: DialogRequest): void {
		if (this.current) this.queue.push(request);
		else this.current = request;
	}

	/** Cierra la petición actual; `value` es `null` cuando se descarta sin elegir. */
	settle(value: boolean | string | null): void {
		const request = this.current;
		if (!request) return;
		this.current = this.queue.shift() ?? null;
		if (request.kind === 'confirm') request.resolve(value === true);
		else request.resolve(typeof value === 'string' ? value : null);
	}
}

export const dialogs = new DialogStore();

/** Pide confirmación. Resuelve `false` si se cancela o se cierra con Esc. */
export function confirmDialog(options: ConfirmOptions): Promise<boolean> {
	return new Promise((resolve) => dialogs.open({ kind: 'confirm', resolve, ...options }));
}

/** Pide un texto. Resuelve `null` si se cancela (igual que `window.prompt`). */
export function promptDialog(options: PromptOptions): Promise<string | null> {
	return new Promise((resolve) => dialogs.open({ kind: 'prompt', resolve, ...options }));
}

const confirmedForms = new WeakSet<HTMLFormElement>();

/**
 * Para `onsubmit` de un formulario: detiene el envío, pide confirmación y, si se acepta,
 * lo reenvía. Debe ser el manejador `onsubmit` del propio `<form>` para ejecutarse antes
 * que `use:enhance`.
 */
export function confirmSubmit(event: SubmitEvent, options: ConfirmOptions): void {
	const form = event.currentTarget as HTMLFormElement;
	if (confirmedForms.has(form)) {
		confirmedForms.delete(form);
		return;
	}

	event.preventDefault();
	event.stopImmediatePropagation();
	const submitter = event.submitter instanceof HTMLElement ? event.submitter : undefined;

	void confirmDialog(options).then((confirmed) => {
		if (!confirmed || !form.isConnected) return;
		confirmedForms.add(form);
		form.requestSubmit(submitter);
	});
}
