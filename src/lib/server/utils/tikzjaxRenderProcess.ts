import { spawn } from 'node:child_process';

const CHILD_RENDER_PROCESS_CODE = String.raw`
const resolveTex2Svg = (module) => {
	const candidates = [module, module.default].filter(Boolean);

	for (const candidate of candidates) {
		if (typeof candidate === 'function') {
			return candidate;
		}

		if (typeof candidate.default === 'function') {
			return candidate.default;
		}
	}

	throw new Error('No se pudo resolver la función tex2svg de node-tikzjax.');
};

process.once('message', async (payload) => {
	try {
		if (!payload || typeof payload.source !== 'string' || !payload.source.trim()) {
			throw new Error('Pega una fuente TeX antes de renderizar.');
		}

		const module = await import('node-tikzjax');
		const tex2svg = resolveTex2Svg(module);
		const svg = await tex2svg(payload.source, payload.options ?? {});

		process.send?.({ type: 'success', svg });
		process.disconnect?.();
		setImmediate(() => process.exit(0));
	} catch (error) {
		const message = error instanceof Error ? error.message : 'No se pudo renderizar el diagrama.';
		const stack = error instanceof Error ? error.stack : undefined;

		process.send?.({ type: 'error', message, stack });
		process.disconnect?.();
		setImmediate(() => process.exit(1));
	}
});
`;

const DEFAULT_RENDER_TIMEOUT_MS = 30_000;
const OUTPUT_PREVIEW_LIMIT = 4_000;

export interface TikzjaxRenderOptions {
	embedFontCss?: boolean;
	fontCssUrl?: string;
	showConsole?: boolean;
	[key: string]: unknown;
}

interface RenderSuccessMessage {
	type: 'success';
	svg: string;
}

interface RenderErrorMessage {
	type: 'error';
	message: string;
	stack?: string;
}

type RenderMessage = RenderSuccessMessage | RenderErrorMessage;

export class TikzjaxRenderProcessError extends Error {
	status: number;
	code: 'render-error' | 'process-timeout' | 'process-failed';
	details?: string;

	constructor(
		message: string,
		{
			status,
			code,
			details
		}: {
			status: number;
			code: 'render-error' | 'process-timeout' | 'process-failed';
			details?: string;
		}
	) {
		super(message);
		this.name = 'TikzjaxRenderProcessError';
		this.status = status;
		this.code = code;
		this.details = details;
	}
}

function appendOutputPreview(current: string, chunk: string): string {
	const next = current ? `${current}\n${chunk}` : chunk;
	return next.slice(-OUTPUT_PREVIEW_LIMIT);
}

function getMessageDetails(stderr: string, stack?: string) {
	return [stderr.trim(), stack?.trim()].filter(Boolean).join('\n\n') || undefined;
}

function isRenderMessage(message: unknown): message is RenderMessage {
	if (!message || typeof message !== 'object') {
		return false;
	}

	const candidate = message as Partial<RenderMessage>;
	return candidate.type === 'success' || candidate.type === 'error';
}

export function renderTikzInSubprocess(
	source: string,
	options: TikzjaxRenderOptions = {},
	timeoutMs = DEFAULT_RENDER_TIMEOUT_MS
): Promise<string> {
	return new Promise((resolve, reject) => {
		const child = spawn(process.execPath, ['--input-type=module', '--eval', CHILD_RENDER_PROCESS_CODE], {
			stdio: ['ignore', 'ignore', 'pipe', 'ipc']
		});

		let settled = false;
		let stderrPreview = '';

		const finalizeError = (error: TikzjaxRenderProcessError) => {
			if (settled) {
				return;
			}

			settled = true;
			clearTimeout(timeoutId);
			child.removeAllListeners();
			child.stderr?.removeAllListeners();
			if (child.connected) {
				child.disconnect();
			}
			if (!child.killed) {
				child.kill('SIGKILL');
			}
			reject(error);
		};

		const finalizeSuccess = (svg: string) => {
			if (settled) {
				return;
			}

			settled = true;
			clearTimeout(timeoutId);
			child.removeAllListeners();
			child.stderr?.removeAllListeners();
			if (child.connected) {
				child.disconnect();
			}
			if (!child.killed) {
				child.kill();
			}
			resolve(svg);
		};

		const timeoutId = setTimeout(() => {
			finalizeError(
				new TikzjaxRenderProcessError(
					`El render tardó más de ${Math.ceil(timeoutMs / 1000)} segundos y se canceló.`,
					{
						status: 504,
						code: 'process-timeout',
						details: stderrPreview.trim() || undefined
					}
				)
			);
		}, timeoutMs);

		child.stderr?.on('data', (chunk: Buffer | string) => {
			stderrPreview = appendOutputPreview(stderrPreview, String(chunk).trim());
		});

		child.once('error', (error) => {
			finalizeError(
				new TikzjaxRenderProcessError('No se pudo iniciar el proceso aislado de TikZJax.', {
					status: 502,
					code: 'process-failed',
					details: getMessageDetails(stderrPreview, error.stack)
				})
			);
		});

		child.on('message', (message: unknown) => {
			if (!isRenderMessage(message)) {
				return;
			}

			if (message.type === 'success') {
				finalizeSuccess(message.svg);
				return;
			}

			finalizeError(
				new TikzjaxRenderProcessError(message.message, {
					status: 400,
					code: 'render-error',
					details: getMessageDetails(stderrPreview, message.stack)
				})
			);
		});

		child.once('exit', (code, signal) => {
			if (settled) {
				return;
			}

			finalizeError(
				new TikzjaxRenderProcessError('El proceso aislado de TikZJax terminó inesperadamente.', {
					status: 502,
					code: 'process-failed',
					details: getMessageDetails(
						stderrPreview,
						`exitCode=${code ?? 'null'} signal=${signal ?? 'null'}`
					)
				})
			);
		});

		child.send({ source, options });
	});
}