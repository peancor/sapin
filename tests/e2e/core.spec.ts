import { test, expect, type Page } from '@playwright/test';
import sharp from 'sharp';

async function login(page: Page, user = 'teacher') {
	await page.goto('/login');
	await page.getByLabel(/correo electrónico/i).fill(`${user}@example.invalid`);
	await page.getByLabel('Contraseña', { exact: true }).fill('Sapin-e2e-2026!');
	await page.getByRole('button', { name: 'Iniciar sesión', exact: true }).click();
	await expect(page).not.toHaveURL(/\/login/);
}

test('login rejects an invalid password', async ({ page }) => {
	await page.goto('/login');
	await page.getByLabel(/correo electrónico/i).fill('teacher@example.invalid');
	await page.getByLabel('Contraseña', { exact: true }).fill('incorrecta');
	const response = page.waitForResponse(
		(r) => r.request().method() === 'POST' && r.url().includes('/login')
	);
	await page.getByRole('button', { name: 'Iniciar sesión', exact: true }).click();
	const result = await response;
	if (result.headers()['content-type']?.includes('application/json')) {
		expect(await result.json()).toMatchObject({ type: 'failure', status: 400 });
	} else {
		expect(result.status()).toBe(400);
	}
	await expect(page).toHaveURL(/\/login/);
	expect((await page.context().cookies()).some((cookie) => cookie.name === 'auth-session')).toBe(
		false
	);
});

test('teacher saves TipTap formatting and reads it after reload', async ({ page }) => {
	await login(page);
	await page.goto('/course/course/admin/interactives/activity/chatedit');
	const editor = page.locator('[contenteditable="true"]').first();
	await editor.fill('Texto de prueba persistente');
	await editor.press('ControlOrMeta+a');
	await editor.press('ControlOrMeta+b');
	await page.getByRole('button', { name: /guardar/i }).click();
	await expect(page.getByText('Actividad actualizada correctamente')).toBeVisible();
	await page.reload();
	await expect(editor.locator('strong')).toHaveText('Texto de prueba persistente');
});

test('student completes a published lesson and keeps progress on reload', async ({ page }) => {
	await login(page, 'student');
	await page.goto('/course/course/run/new-lesson/lesson');
	await expect(page.getByText('Contenido ficticio para la prueba.')).toBeVisible();
	await page.getByRole('button', { name: /continuar|siguiente/i }).click();
	await expect(page.getByText('Has completado la prueba.')).toBeVisible();
	await page.reload();
	await expect(page.getByText('Has completado la prueba.')).toBeVisible();
});

test('image upload sanitizes to WebP and rejects an unauthenticated request', async ({
	page,
	playwright
}) => {
	const endpoint = '/api/agent-chat/agent/chat/agent-chat/attachments';
	const guest = await playwright.request.newContext({ baseURL: 'http://127.0.0.1:4187' });
	try {
		expect((await guest.post(endpoint)).status()).toBe(401);
	} finally {
		await guest.dispose();
	}
	await login(page, 'student');
	const buffer = await sharp({
		create: { width: 32, height: 32, channels: 3, background: '#00ff00' }
	})
		.png()
		.toBuffer();
	const response = await page.request.post(endpoint, {
		headers: { Origin: 'http://127.0.0.1:4187' },
		multipart: { file: { name: 'ficticia.png', mimeType: 'image/png', buffer } }
	});
	expect(response.status()).toBe(200);
	const { attachments } = await response.json();
	expect(attachments).toHaveLength(1);
	expect(attachments[0].mimeType).toBe('image/webp');
	const download = await page.request.get(attachments[0].url);
	expect(download.status()).toBe(200);
	expect(download.headers()['content-type']).toContain('image/webp');
	const metadata = await sharp(await download.body()).metadata();
	expect(metadata.format).toBe('webp');
	expect(metadata.width).toBe(32);
	expect(metadata.height).toBe(32);
});

test('real tool confirmation enforces chat scope, executes once and records rejection', async ({
	page
}) => {
	await login(page, 'student');
	const endpoint = '/api/agent-chat/agent/chat/agent-chat/confirm-tool';
	const send = (toolCallId: string, approved: boolean) =>
		page.request.post(endpoint, { data: { toolCallId, approved } });
	const foreign = await send('foreign-call', false);
	expect(foreign.status()).toBe(404);
	const approved = await send('approve-call', true);
	expect(approved.status()).toBe(200);
	expect(await approved.json()).toMatchObject({ success: true, result: { result: 5 } });
	expect((await send('approve-call', true)).status()).toBe(409);
	const rejected = await send('reject-call', false);
	expect(await rejected.json()).toMatchObject({ success: true, rejected: true });
	expect((await send('reject-call', true)).status()).toBe(409);
});

for (const approved of [true, false])
	test(`agent confirmation sends ${approved ? 'approval' : 'rejection'}`, async ({ page }) => {
		await login(page, 'student');
		// Deterministic transport contract; no external model or side effect is invoked.
		let resumed = false;
		await page.route('**/api/agent-chat/**/ask?*', async (route) => {
			const part = resumed
				? { type: 'text-delta', text: 'Decisión recibida.' }
				: {
						type: 'tool-confirm-required',
						toolCallId: 'test-tool',
						toolName: 'test_action',
						toolDisplayName: 'Acción ficticia',
						args: { value: 1 },
						riskLevel: 'low',
						confirmationMessage: 'Confirmar acción de prueba'
					};
			await route.fulfill({
				contentType: 'text/event-stream',
				body: `data: ${JSON.stringify(part)}\n\ndata: [DONE]\n\n`
			});
		});
		let decision: unknown;
		await page.route('**/confirm-tool', async (route) => {
			decision = route.request().postDataJSON();
			resumed = true;
			await route.fulfill({ json: { success: true } });
		});
		await page.goto('/agent-chat/agent/c/agent-chat');
		await page.getByPlaceholder('Escribe un mensaje...').fill('Solicita la acción ficticia');
		await page.getByRole('button', { name: 'Enviar mensaje' }).click();
		await expect(page.getByRole('dialog')).toBeVisible();
		await page
			.getByRole('button', { name: approved ? 'Autorizar' : 'Rechazar', exact: true })
			.click();
		await expect(page.getByRole('dialog')).not.toBeVisible();
		expect(decision).toEqual({ toolCallId: 'test-tool', approved });
	});
