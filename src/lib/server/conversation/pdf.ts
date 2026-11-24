import { env } from '$env/dynamic/private';
import { dev } from '$app/environment';
import { error } from '@sveltejs/kit';
import { chromium, type Browser } from 'playwright-core';
import { filePermissionMiddleware } from '$lib/server/files/FilePermissionMiddleware';
import { fileStorageService } from '$lib/server/files/FileStorageService';
import { fetchPublicImage } from './publicImage';

async function isActivityImage(fileId: string, activityId: string) {
	const file = await fileStorageService.getFile(fileId);
	return (
		file?.entityId === activityId &&
		(file.entityType === 'interactive_learning_chat' ||
			file.entityType === 'interactive_learning') &&
		file.mimeType.startsWith('image/')
	);
}

let active = 0;
export async function renderConversationPdf(
	documentUrl: URL,
	load: typeof fetch,
	locale: string,
	activityId: string,
	reviewAsStudent?: string
) {
	if (active >= 2)
		error(503, 'Hay otras exportaciones en curso. Inténtalo de nuevo en unos segundos.');
	active++;
	let browser: Browser | undefined;
	let stage = 'chromium';
	const controller = new AbortController();
	const deadline = setTimeout(() => {
		controller.abort();
		void browser?.close().catch(() => {});
	}, 90000);
	try {
		// Only the configured local HTTP listener serves application assets. The browser
		// has no session cookie. Kit authorizes the document and file reads separately.
		const assetOrigin =
			'http://localhost:' + (env.PDF_APP_PORT || env.PORT || (dev ? '5173' : '3000'));
		browser = await chromium.launch({
			executablePath: env.PDF_CHROMIUM_PATH || undefined,
			timeout: 15000
		});
		const context = await browser.newContext({
			locale,
			colorScheme: 'light',
			serviceWorkers: 'block',
			viewport: { width: 710, height: 1000 }
		});
		await context.routeWebSocket('**/*', (socket) => socket.close());
		const page = await context.newPage();
		await context.route('**/*', async (route) => {
			const req = route.request();
			const url = new URL(req.url());
			const kind = req.resourceType();
			try {
				if (req.method() !== 'GET') return await route.abort();
				const sameOrigin = url.origin === documentUrl.origin;
				const fileId =
					kind === 'image' && /^https?:$/.test(url.protocol)
						? /^\/api\/files\/([\w-]+)(?:\/thumbnail)?$/.exec(url.pathname)?.[1]
						: undefined;
				// Saved messages can reference the activity's private images on a previous
				// installation. Read those locally through the same authorized file endpoint.
				if (!sameOrigin && !(fileId && (await isActivityImage(fileId, activityId)))) {
					if (kind !== 'image') return await route.abort();
					const image = await fetchPublicImage(
						url,
						AbortSignal.any([controller.signal, AbortSignal.timeout(10000)])
					);
					return await route.fulfill(image);
				}
				const doc =
					kind === 'document' && url.href === documentUrl.href && req.frame() === page.mainFrame();
				const asset =
					/^\/(?:_app\/immutable\/|vendor\/tikzjax-browser\/|images\/|favicon\.)/.test(
						url.pathname
					) ||
					(dev &&
						/^\/(?:@(?:vite|fs|id)\/|src\/|node_modules\/|\.svelte-kit\/)/.test(url.pathname));
				if (!doc && !fileId && (!asset || kind === 'document')) return await route.abort();
				if (fileId && reviewAsStudent) {
					const permission = await filePermissionMiddleware.checkPermission(
						fileId,
						reviewAsStudent,
						'read'
					);
					if (!permission.allowed) return await route.abort();
				}
				const path = sameOrigin ? url.pathname + url.search : url.pathname;
				const response =
					doc || fileId
						? await load(path, {
								redirect: 'manual',
								headers: { accept: doc ? 'text/html' : 'image/*' },
								signal: controller.signal
							})
						: await fetch(assetOrigin + path, { redirect: 'error', signal: controller.signal });
				if (!response.ok) return await route.abort();
				return await route.fulfill({
					contentType: response.headers.get('content-type') ?? 'application/octet-stream',
					body: Buffer.from(await response.arrayBuffer())
				});
			} catch {
				await route.abort().catch(() => {});
			}
		});
		stage = 'document';
		await page.emulateMedia({ media: 'print' });
		await page.goto(documentUrl.href, { waitUntil: 'domcontentloaded', timeout: 20000 });
		const root = page.locator('[data-conversation-transcript][data-hydrated="true"]');
		await root.waitFor({ timeout: 20000 });
		stage = 'figures';
		await root
			.locator('[data-transcript-resource="pending"]')
			.first()
			.waitFor({ state: 'detached', timeout: 45000 });
		if (await root.locator('[data-transcript-resource="error"]').count())
			throw Error('Unavailable figure');
		stage = 'images';
		await root.evaluate(async (transcript) => {
			const images = Array.from(transcript.querySelectorAll('img'));
			for (const img of images) img.loading = 'eager';
			await Promise.all(images.map((img) => img.decode()));
		});
		stage = 'fonts/layout';
		await root.evaluate(async (transcript) => {
			await document.fonts.ready;
			for (const block of transcript.querySelectorAll<HTMLElement>('.katex-display, table')) {
				const width = block.parentElement?.clientWidth;
				if (width && block.scrollWidth > width)
					block.style.zoom = String(width / block.scrollWidth);
			}
		});
		stage = 'pagination';
		return await page.pdf({
			format: 'A4',
			margin: { top: '14mm', bottom: '15mm', left: '14mm', right: '14mm' },
			printBackground: true,
			tagged: true
		});
	} catch {
		console.error('[conversation-pdf] Export failed at stage:', stage);
		error(
			503,
			'No se ha podido preparar la conversación completa para descargar. Puedes reintentar la exportación o imprimir la vista de repaso.'
		);
	} finally {
		clearTimeout(deadline);
		controller.abort();
		try {
			await browser?.close();
		} finally {
			active--;
		}
	}
}
