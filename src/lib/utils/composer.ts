/**
 * Utilidades compartidas por los compositores de chat (textarea + Enter para enviar) y por el
 * renderizado de respuestas en streaming.
 */

/**
 * Indica si un `keydown` de Enter pertenece a una composición IME (japonés, chino, coreano…),
 * donde Enter confirma el candidato en lugar de enviar. `isComposing` no basta en Safari, que
 * entrega `compositionend` antes del `keydown`; ahí el evento llega con `keyCode` 229.
 */
export function isImeComposing(event: Pick<KeyboardEvent, 'isComposing' | 'keyCode'>): boolean {
	return event.isComposing || event.keyCode === 229;
}

/**
 * Texto para el anuncio a lectores de pantalla de una respuesta terminada: quita la sintaxis
 * de Markdown más ruidosa (almohadillas, énfasis, comillas invertidas, citas) y compacta
 * espacios, para que no se lean símbolos sueltos.
 */
export function toAnnouncementText(markdown: string): string {
	const text = markdown
		.replace(/\[\[[^\]]*\]\]/g, ' ')
		.replace(/!?\[([^\]]*)\]\([^)]*\)/g, '$1')
		.replace(/^\s{0,3}(#{1,6}|>|[-*+])\s+/gm, '')
		.replace(/[*_`~]+/g, '')
		.replace(/\s+/g, ' ')
		.trim();
	return text ? `Respuesta del asistente: ${text}` : '';
}

let fieldSizingSupported: boolean | undefined;

function supportsFieldSizing(): boolean {
	if (fieldSizingSupported === undefined) {
		fieldSizingSupported =
			typeof CSS !== 'undefined' &&
			typeof CSS.supports === 'function' &&
			CSS.supports('field-sizing', 'content');
	}
	return fieldSizingSupported;
}

/**
 * Ajusta la altura de un textarea a su contenido en navegadores sin `field-sizing: content`.
 * Donde la propiedad existe (clase `field-sizing-content`) no hace nada: una altura en línea
 * anularía el ajuste nativo.
 */
export function autosizeTextarea(
	textarea: HTMLTextAreaElement | null | undefined,
	maxHeight = 120
) {
	if (!textarea || supportsFieldSizing()) return;
	textarea.style.height = '0';
	textarea.style.height = `${Math.min(textarea.scrollHeight, maxHeight)}px`;
}

/** Devuelve el textarea a su altura inicial tras enviar (solo relevante en el fallback). */
export function resetTextareaSize(textarea: HTMLTextAreaElement | null | undefined) {
	if (textarea) textarea.style.height = '';
}

export interface FrameBatcher {
	/** Pide un volcado en el siguiente frame; varias llamadas en el mismo frame se agrupan. */
	schedule(): void;
	/** Vuelca ahora mismo lo pendiente (fin de stream, cambio de tipo de evento). */
	flushNow(): void;
	/** Descarta el volcado pendiente sin ejecutarlo. */
	cancel(): void;
}

type FrameScheduler = {
	request: (callback: () => void) => number;
	cancel: (handle: number) => void;
};

const defaultScheduler: FrameScheduler = {
	request: (callback) =>
		typeof requestAnimationFrame === 'function'
			? requestAnimationFrame(callback)
			: (setTimeout(callback, 16) as unknown as number),
	cancel: (handle) =>
		typeof cancelAnimationFrame === 'function' ? cancelAnimationFrame(handle) : clearTimeout(handle)
};

/**
 * Agrupa actualizaciones frecuentes (un evento por token) en una por frame, para no reparsear
 * Markdown/KaTeX ni forzar layout con cada token recibido.
 */
export function createFrameBatcher(
	flush: () => void,
	scheduler: FrameScheduler = defaultScheduler
): FrameBatcher {
	let handle: number | null = null;

	return {
		schedule() {
			if (handle !== null) return;
			handle = scheduler.request(() => {
				handle = null;
				flush();
			});
		},
		flushNow() {
			if (handle !== null) {
				scheduler.cancel(handle);
				handle = null;
			}
			flush();
		},
		cancel() {
			if (handle === null) return;
			scheduler.cancel(handle);
			handle = null;
		}
	};
}
