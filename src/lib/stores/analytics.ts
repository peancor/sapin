/**
 * Analytics Store - Cliente
 *
 * Maneja el tracking de eventos de usuario en el navegador.
 * Los eventos se acumulan y envían en batch al servidor.
 */

import { browser } from '$app/environment';

// ============================================
// TIPOS
// ============================================

interface AnalyticsConfig {
	enabled: boolean;
	trackPageViews: boolean;
	trackSessions: boolean;
}

interface AnalyticsEvent {
	type: string;
	name: string;
	path?: string;
	title?: string;
	referrer?: string;
	duration?: number;
	metadata?: Record<string, unknown>;
	timestamp: number;
}

interface AnalyticsState {
	initialized: boolean;
	enabled: boolean;
	visitorId: string;
	sessionId: string;
	userId?: string;
	currentPath: string;
	pageEnteredAt: number;
	eventQueue: AnalyticsEvent[];
	flushInterval: ReturnType<typeof setInterval> | null;
}

// ============================================
// CONSTANTES
// ============================================

const VISITOR_ID_KEY = 'sapin_visitor_id';
const SESSION_ID_KEY = 'sapin_session_id';
const SESSION_TIMESTAMP_KEY = 'sapin_session_ts';
const SESSION_TIMEOUT = 30 * 60 * 1000; // 30 minutos
const FLUSH_INTERVAL = 30 * 1000; // 30 segundos
const MAX_QUEUE_SIZE = 50;

// ============================================
// ESTADO
// ============================================

const state: AnalyticsState = {
	initialized: false,
	enabled: false,
	visitorId: '',
	sessionId: '',
	userId: undefined,
	currentPath: '',
	pageEnteredAt: 0,
	eventQueue: [],
	flushInterval: null
};

// ============================================
// UTILIDADES
// ============================================

function generateId(): string {
	return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
		const r = (Math.random() * 16) | 0;
		const v = c === 'x' ? r : (r & 0x3) | 0x8;
		return v.toString(16);
	});
}

function getVisitorId(): string {
	if (!browser) return '';

	let visitorId = localStorage.getItem(VISITOR_ID_KEY);
	if (!visitorId) {
		visitorId = generateId();
		localStorage.setItem(VISITOR_ID_KEY, visitorId);
	}
	return visitorId;
}

function getSessionId(): string {
	if (!browser) return '';

	const storedSessionId = sessionStorage.getItem(SESSION_ID_KEY);
	const lastTimestamp = sessionStorage.getItem(SESSION_TIMESTAMP_KEY);
	const now = Date.now();

	// Verificar si la sesión expiró
	if (storedSessionId && lastTimestamp) {
		const elapsed = now - parseInt(lastTimestamp, 10);
		if (elapsed < SESSION_TIMEOUT) {
			sessionStorage.setItem(SESSION_TIMESTAMP_KEY, String(now));
			return storedSessionId;
		}
	}

	// Crear nueva sesión
	const newSessionId = generateId();
	sessionStorage.setItem(SESSION_ID_KEY, newSessionId);
	sessionStorage.setItem(SESSION_TIMESTAMP_KEY, String(now));
	return newSessionId;
}

function getDeviceInfo(): {
	device: string;
	browser: string;
	os: string;
	screenResolution: string;
	language: string;
} {
	if (!browser) {
		return {
			device: 'unknown',
			browser: 'unknown',
			os: 'unknown',
			screenResolution: '',
			language: ''
		};
	}

	const ua = navigator.userAgent;

	// Detectar dispositivo
	let device = 'desktop';
	if (/Mobi|Android/i.test(ua)) {
		device = /Tablet|iPad/i.test(ua) ? 'tablet' : 'mobile';
	}

	// Detectar navegador
	let browserName = 'unknown';
	if (ua.includes('Firefox')) browserName = 'Firefox';
	else if (ua.includes('Edg')) browserName = 'Edge';
	else if (ua.includes('Chrome')) browserName = 'Chrome';
	else if (ua.includes('Safari')) browserName = 'Safari';
	else if (ua.includes('Opera') || ua.includes('OPR')) browserName = 'Opera';

	// Detectar OS
	let os = 'unknown';
	if (ua.includes('Windows')) os = 'Windows';
	else if (ua.includes('Mac')) os = 'macOS';
	else if (ua.includes('Linux')) os = 'Linux';
	else if (ua.includes('Android')) os = 'Android';
	else if (ua.includes('iOS') || ua.includes('iPhone') || ua.includes('iPad')) os = 'iOS';

	return {
		device,
		browser: browserName,
		os,
		screenResolution: `${window.screen.width}x${window.screen.height}`,
		language: navigator.language || ''
	};
}

function getUTMParams(): { utmSource?: string; utmMedium?: string; utmCampaign?: string } {
	if (!browser) return {};

	const params = new URLSearchParams(window.location.search);
	return {
		utmSource: params.get('utm_source') || undefined,
		utmMedium: params.get('utm_medium') || undefined,
		utmCampaign: params.get('utm_campaign') || undefined
	};
}

// ============================================
// API
// ============================================

async function fetchConfig(): Promise<AnalyticsConfig> {
	try {
		const response = await fetch('/api/analytics/config');
		if (response.ok) {
			return await response.json();
		}
	} catch (e) {
		console.warn('[Analytics] Error fetching config:', e);
	}
	return { enabled: false, trackPageViews: true, trackSessions: true };
}

async function sendEvents(events: AnalyticsEvent[]): Promise<boolean> {
	if (events.length === 0) return true;

	try {
		const payload = {
			sessionId: state.sessionId,
			visitorId: state.visitorId,
			userId: state.userId,
			events: events.map((e) => ({
				type: e.type,
				name: e.name,
				path: e.path,
				title: e.title,
				referrer: e.referrer,
				duration: e.duration,
				metadata: e.metadata
			}))
		};

		const response = await fetch('/api/analytics/events', {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify(payload)
		});

		return response.ok;
	} catch (e) {
		console.warn('[Analytics] Error sending events:', e);
		return false;
	}
}

async function createServerSession(): Promise<string> {
	try {
		const deviceInfo = getDeviceInfo();
		const utmParams = getUTMParams();

		const response = await fetch('/api/analytics/session', {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({
				visitorId: state.visitorId,
				userId: state.userId,
				...deviceInfo,
				referrer: document.referrer || undefined,
				...utmParams
			})
		});

		if (response.ok) {
			const data = await response.json();
			return data.sessionId || '';
		}
	} catch (e) {
		console.warn('[Analytics] Error creating session:', e);
	}
	return '';
}

// ============================================
// FUNCIONES PÚBLICAS
// ============================================

/**
 * Inicializa el sistema de analytics
 */
export async function initAnalytics(userId?: string): Promise<void> {
	if (!browser || state.initialized) return;

	// Obtener configuración del servidor
	const config = await fetchConfig();

	if (!config.enabled) {
		state.initialized = true;
		state.enabled = false;
		return;
	}

	state.enabled = true;
	state.visitorId = getVisitorId();
	state.sessionId = getSessionId();
	state.userId = userId;
	state.pageEnteredAt = Date.now();
	state.currentPath = window.location.pathname;

	// Crear sesión en el servidor
	if (config.trackSessions) {
		const serverSessionId = await createServerSession();
		if (serverSessionId) {
			state.sessionId = serverSessionId;
			sessionStorage.setItem(SESSION_ID_KEY, serverSessionId);
		}
	}

	// Configurar flush periódico
	state.flushInterval = setInterval(flush, FLUSH_INTERVAL);

	// Flush al cerrar la página
	window.addEventListener('beforeunload', handleBeforeUnload);
	window.addEventListener('visibilitychange', handleVisibilityChange);

	state.initialized = true;

	// Track página inicial
	if (config.trackPageViews) {
		trackPageView(window.location.pathname, document.title);
	}
}

/**
 * Destruye el sistema de analytics
 */
export function destroyAnalytics(): void {
	if (!browser || !state.initialized) return;

	// Enviar eventos pendientes
	flush();

	// Limpiar intervalo
	if (state.flushInterval) {
		clearInterval(state.flushInterval);
		state.flushInterval = null;
	}

	// Remover listeners
	window.removeEventListener('beforeunload', handleBeforeUnload);
	window.removeEventListener('visibilitychange', handleVisibilityChange);

	state.initialized = false;
}

/**
 * Trackea una vista de página
 */
export function trackPageView(path: string, title?: string): void {
	if (!state.enabled) return;

	// Calcular duración de la página anterior
	const now = Date.now();
	if (state.currentPath && state.pageEnteredAt > 0) {
		const duration = Math.round((now - state.pageEnteredAt) / 1000);

		// Registrar salida de página anterior (si hay duración significativa)
		if (duration > 0) {
			queueEvent({
				type: 'page_exit',
				name: `Exit: ${state.currentPath}`,
				path: state.currentPath,
				duration,
				timestamp: now
			});
		}
	}

	// Actualizar estado
	state.currentPath = path;
	state.pageEnteredAt = now;

	// Registrar nueva página
	queueEvent({
		type: 'page_view',
		name: `View: ${path}`,
		path,
		title: title || document.title,
		referrer: document.referrer || undefined,
		timestamp: now
	});
}

/**
 * Trackea un evento personalizado
 */
export function trackEvent(
	name: string,
	type: string = 'action',
	metadata?: Record<string, unknown>
): void {
	if (!state.enabled) return;

	queueEvent({
		type,
		name,
		path: state.currentPath,
		metadata,
		timestamp: Date.now()
	});
}

/**
 * Actualiza el ID de usuario (cuando se autentica)
 */
export function setUserId(userId: string | undefined): void {
	state.userId = userId;
}

/**
 * Obtiene el estado actual (para debugging)
 */
export function getAnalyticsState(): Readonly<AnalyticsState> {
	return { ...state };
}

/**
 * Fuerza el envío de eventos pendientes
 */
export async function flush(): Promise<void> {
	if (state.eventQueue.length === 0) return;

	const eventsToSend = [...state.eventQueue];
	state.eventQueue = [];

	const success = await sendEvents(eventsToSend);

	// Si falla, volver a encolar (hasta cierto límite)
	if (!success && state.eventQueue.length < MAX_QUEUE_SIZE) {
		state.eventQueue = [...eventsToSend, ...state.eventQueue].slice(0, MAX_QUEUE_SIZE);
	}
}

// ============================================
// FUNCIONES INTERNAS
// ============================================

function queueEvent(event: AnalyticsEvent): void {
	state.eventQueue.push(event);

	// Flush automático si hay muchos eventos
	if (state.eventQueue.length >= MAX_QUEUE_SIZE) {
		flush();
	}
}

function handleBeforeUnload(): void {
	// Usar sendBeacon para envío garantizado
	if (state.eventQueue.length > 0 && navigator.sendBeacon) {
		// Añadir evento de salida de página actual
		const now = Date.now();
		if (state.currentPath && state.pageEnteredAt > 0) {
			const duration = Math.round((now - state.pageEnteredAt) / 1000);
			state.eventQueue.push({
				type: 'page_exit',
				name: `Exit: ${state.currentPath}`,
				path: state.currentPath,
				duration,
				timestamp: now
			});
		}

		const payload = JSON.stringify({
			sessionId: state.sessionId,
			visitorId: state.visitorId,
			userId: state.userId,
			events: state.eventQueue
		});

		navigator.sendBeacon('/api/analytics/events', payload);
		state.eventQueue = [];
	}
}

function handleVisibilityChange(): void {
	if (document.visibilityState === 'hidden') {
		flush();
	}
}

// ============================================
// EXPORTS
// ============================================

export default {
	init: initAnalytics,
	destroy: destroyAnalytics,
	trackPageView,
	trackEvent,
	setUserId,
	flush,
	getState: getAnalyticsState
};
