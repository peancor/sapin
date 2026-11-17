import { writable, get } from 'svelte/store';
import { browser } from '$app/environment';

export type ColorScheme = 'light' | 'dark';

/**
 * Tres estados: sin valor guardado se sigue al sistema; `light` o `dark` fijan el esquema.
 * La fuente de verdad en el documento es `<meta name="color-scheme">` (`light dark`, `light`
 * o `dark`), que `app.css` traslada a la propiedad `color-scheme` para controles nativos y
 * barras de desplazamiento. La clase `.dark` se mantiene sincronizada porque Tailwind y
 * Flowbite la usan para sus variantes.
 *
 * El script en línea de `app.html` aplica lo mismo antes del primer pintado.
 */
const STORAGE_KEY = 'theme';

function isScheme(value: unknown): value is ColorScheme {
	return value === 'light' || value === 'dark';
}

function systemScheme(): ColorScheme {
	return browser && window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
}

function readStored(): ColorScheme | null {
	if (!browser) return null;
	try {
		const stored = localStorage.getItem(STORAGE_KEY);
		return isScheme(stored) ? stored : null;
	} catch {
		return null;
	}
}

function writeStored(value: ColorScheme | null): void {
	try {
		if (value) localStorage.setItem(STORAGE_KEY, value);
		else localStorage.removeItem(STORAGE_KEY);
	} catch {
		// Sin almacenamiento el tema se aplica igualmente, solo que no se recuerda.
	}
}

/** Refleja el esquema en el documento y devuelve el que queda pintado. */
function applyScheme(override: ColorScheme | null): ColorScheme {
	const rendered = override ?? systemScheme();
	if (browser) {
		document
			.querySelector('meta[name="color-scheme"]')
			?.setAttribute('content', override ?? 'light dark');
		document.documentElement.classList.toggle('dark', rendered === 'dark');
	}
	return rendered;
}

// Sobrescritura vigente; se guarda en memoria para que funcione aunque falle el almacenamiento.
let override: ColorScheme | null = readStored();

const rendered = writable<ColorScheme>(browser ? applyScheme(override) : 'light');

/**
 * Elige el esquema que se quiere ver. Si coincide con el del sistema se borra la preferencia
 * (se vuelve a seguir al sistema) en lugar de fijarla contra cambios futuros.
 */
function choose(target: ColorScheme): void {
	override = target === systemScheme() ? null : target;
	writeStored(override);
	rendered.set(applyScheme(override));
}

/** Esquema pintado actualmente. Asignarlo (`$theme = 'dark'`) equivale a elegirlo. */
export const theme = {
	subscribe: rendered.subscribe,
	set: choose,
	update(updater: (current: ColorScheme) => ColorScheme) {
		choose(updater(get(rendered)));
	},
	toggle() {
		choose(get(rendered) === 'dark' ? 'light' : 'dark');
	}
};

if (browser) {
	// Otra pestaña cambió la preferencia.
	window.addEventListener('storage', (event) => {
		if (event.key !== STORAGE_KEY && event.key !== null) return;
		override = readStored();
		rendered.set(applyScheme(override));
	});

	// El sistema cambió de esquema: solo afecta si no hay una preferencia fijada. Nunca se
	// borra la preferencia guardada por coincidir con el sistema.
	window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => {
		if (override === null) rendered.set(applyScheme(null));
	});
}
