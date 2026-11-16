/**
 * Estado compartido para modales con formulario: evita que Esc, el botón de cierre
 * o un clic accidental descarten datos escritos sin pedir confirmación.
 *
 * Uso (junto a `<Modal outsideclose={false} oncancel={guard.handleCancel}>`):
 * - Marca cambios con `oninput`/`onchange={guard.markDirty}` en el formulario, o pasa
 *   `isDirty` al constructor cuando el estado ya lo indica (selección, fichero elegido).
 * - Muestra `<DiscardChangesPrompt {guard} ondiscard={...} />` antes del pie del modal.
 * - Llama a `guard.reset()` al guardar o al cerrar de forma deliberada.
 *
 * Mismo comportamiento que `UserForm.svelte`: el primer intento de cerrar con datos
 * pendientes muestra el aviso; descartar exige un botón explícito.
 */
export class DiscardGuard {
	dirty = $state(false);
	confirmDiscard = $state(false);
	busy = $state(false);

	private readonly isDirtyCheck: (() => boolean) | undefined;

	/**
	 * @param isDirty Comprobación opcional del estado (p. ej. elementos seleccionados o un
	 * fichero elegido) para formularios cuyos cambios no siempre emiten `input`.
	 */
	constructor(isDirty?: () => boolean) {
		this.isDirtyCheck = isDirty;
	}

	get hasChanges(): boolean {
		return this.dirty || (this.isDirtyCheck?.() ?? false);
	}

	markDirty = () => {
		this.dirty = true;
		this.confirmDiscard = false;
	};

	reset = () => {
		this.dirty = false;
		this.confirmDiscard = false;
		this.busy = false;
	};

	keepEditing = () => {
		this.confirmDiscard = false;
	};

	/** Handler para `oncancel` del `<dialog>`: cancela el cierre si hay cambios. */
	handleCancel = (event: Event) => {
		if (this.busy || (this.hasChanges && !this.confirmDiscard)) {
			event.preventDefault();
			if (!this.busy) this.confirmDiscard = true;
			return;
		}
		this.reset();
	};

	/**
	 * Para botones "Cancelar" propios: devuelve `true` si el modal puede cerrarse ya.
	 * Con cambios pendientes muestra el aviso y devuelve `false`.
	 */
	requestClose = (): boolean => {
		const event = new Event('cancel', { cancelable: true });
		this.handleCancel(event);
		return !event.defaultPrevented;
	};
}
