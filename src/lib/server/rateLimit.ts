/**
 * Limitador de intentos en memoria con ventana fija. Vale para un único proceso Node, que es
 * como se despliega Sapin; no se comparte entre réplicas ni sobrevive a un reinicio.
 */
interface Bucket {
	count: number;
	resetAt: number;
}

export interface RateLimitStatus {
	limited: boolean;
	/** Segundos hasta que se pueda volver a intentar (0 si no está limitado). */
	retryAfterSeconds: number;
}

export class AttemptLimiter {
	private readonly buckets = new Map<string, Bucket>();
	private readonly maxAttempts: number;
	private readonly windowMs: number;
	private readonly maxKeys: number;

	constructor(maxAttempts: number, windowMs: number, maxKeys = 10_000) {
		this.maxAttempts = maxAttempts;
		this.windowMs = windowMs;
		this.maxKeys = maxKeys;
	}

	check(key: string, now = Date.now()): RateLimitStatus {
		const bucket = this.buckets.get(key);
		if (!bucket || bucket.resetAt <= now || bucket.count < this.maxAttempts) {
			return { limited: false, retryAfterSeconds: 0 };
		}
		return { limited: true, retryAfterSeconds: Math.ceil((bucket.resetAt - now) / 1000) };
	}

	/** Registra un intento fallido. */
	hit(key: string, now = Date.now()): void {
		const bucket = this.buckets.get(key);
		if (bucket && bucket.resetAt > now) {
			bucket.count += 1;
			return;
		}
		this.buckets.delete(key);
		if (this.buckets.size >= this.maxKeys) this.prune(now);
		this.buckets.set(key, { count: 1, resetAt: now + this.windowMs });
	}

	reset(key: string): void {
		this.buckets.delete(key);
	}

	private prune(now: number): void {
		for (const [key, bucket] of this.buckets) {
			if (bucket.resetAt <= now) this.buckets.delete(key);
		}
		// Si sigue lleno, se descartan las entradas más antiguas (orden de inserción).
		for (const key of this.buckets.keys()) {
			if (this.buckets.size < this.maxKeys) break;
			this.buckets.delete(key);
		}
	}
}
