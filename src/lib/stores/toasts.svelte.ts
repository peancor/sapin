/**
 * Avisos transitorios de toda la aplicación. Se muestran siempre en el mismo sitio
 * (`ToastRegion`, montado en el layout raíz), apilados y con botón de cierre.
 *
 * - Los errores permanecen hasta que se cierran: nadie debe perderse un fallo por no mirar.
 * - Los avisos de éxito o informativos se retiran solos pasados unos segundos; son
 *   confirmaciones de algo que ya se ve reflejado en la página.
 */
export type ToastKind = 'success' | 'error' | 'info';

export interface ToastItem {
	id: number;
	message: string;
	kind: ToastKind;
}

/** Milisegundos que permanece un aviso no crítico. */
export const TOAST_AUTO_DISMISS_MS = 6000;

const MAX_VISIBLE = 5;

class ToastStore {
	items = $state<ToastItem[]>([]);
	private nextId = 1;

	show(message: string, kind: ToastKind = 'success'): number {
		const text = message.trim();
		if (!text) return -1;
		const id = this.nextId++;
		// Si se acumulan demasiados se descartan los más antiguos que no sean errores.
		const overflow = this.items.length + 1 - MAX_VISIBLE;
		let items = this.items;
		if (overflow > 0) {
			let toDrop = overflow;
			items = items.filter((item) => item.kind === 'error' || toDrop-- <= 0);
		}
		this.items = [...items, { id, message: text, kind }];
		return id;
	}

	dismiss(id: number): void {
		this.items = this.items.filter((item) => item.id !== id);
	}

	clear(): void {
		this.items = [];
	}
}

export const toasts = new ToastStore();

/** Muestra un aviso. Firma compatible con los antiguos `showToastMessage(message, type)`. */
export function notify(message: string, kind: ToastKind = 'success'): void {
	toasts.show(message, kind);
}
