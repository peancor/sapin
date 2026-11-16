import { test, expect, type Page } from '@playwright/test';

const PASSWORD = 'Sapin-e2e-2026!';
// Valor ficticio: solo comprueba que el servidor no lo devuelve al navegador
const SECRET = 'sk-e2e-fictitious-provider-key';

async function login(page: Page, user: string) {
	await page.goto('/login');
	await page.getByLabel(/correo electrónico/i).fill(`${user}@example.invalid`);
	await page.getByLabel('Contraseña', { exact: true }).fill(PASSWORD);
	await page.getByRole('button', { name: 'Iniciar sesión', exact: true }).click();
	await expect(page).not.toHaveURL(/\/login/);
}

test('AI provider API keys never reach the browser and an empty field keeps them', async ({
	page,
	baseURL
}) => {
	await login(page, 'admin');
	const updateProvider = (extra: Record<string, string>) =>
		page.request.post('/admin/ai-models?/updateProvider', {
			headers: { origin: baseURL ?? 'http://127.0.0.1:4187' },
			form: { id: 'provider', name: 'test', displayName: 'Test', isActive: 'on', ...extra },
			maxRedirects: 0
		});

	expect((await updateProvider({ apiKey: SECRET })).status()).toBe(200);

	await page.goto('/admin/ai-models');
	expect(await page.content()).not.toContain(SECRET);
	const payload = await (await page.request.get('/admin/ai-models/__data.json')).text();
	expect(payload).not.toContain(SECRET);
	expect(payload).not.toContain('passwordHash');

	await page.getByRole('tab', { name: 'Proveedores' }).click();
	await expect(page.getByText('Configurada', { exact: true })).toBeVisible();
	await page.getByRole('button', { name: 'Editar proveedor Test' }).click();
	const dialog = page.getByRole('dialog');
	const apiKey = dialog.getByLabel('API Key', { exact: true });
	await expect(apiKey).toHaveValue('');
	await expect(dialog.getByText(/Hay una API key guardada/)).toBeVisible();

	// Guardar sin escribir una clave nueva conserva la guardada
	await dialog.getByRole('button', { name: 'Guardar', exact: true }).click();
	await expect(dialog).toBeHidden();
	await expect(page.getByText('Configurada', { exact: true })).toBeVisible();

	// Solo la casilla explícita elimina la clave
	expect((await updateProvider({ clearApiKey: 'on' })).status()).toBe(200);
	await page.reload();
	await page.getByRole('tab', { name: 'Proveedores' }).click();
	await expect(page.getByText('No configurada', { exact: true })).toBeVisible();
});

test('AI quota form asks before discarding typed values', async ({ page }) => {
	await login(page, 'admin');
	await page.goto('/admin/ai-models');
	await page.getByRole('tab', { name: 'Cuotas' }).click();
	await page.getByRole('button', { name: /Nueva Cuota/ }).click();
	const dialog = page.getByRole('dialog');
	await dialog.locator('input[type="number"]').first().fill('1234');

	await page.keyboard.press('Escape');
	await expect(dialog).toBeVisible();
	await expect(dialog.getByText('Hay datos sin guardar')).toBeVisible();
	await dialog.getByRole('button', { name: 'Seguir editando', exact: true }).click();
	await page.mouse.click(5, 5);
	await expect(dialog).toBeVisible();
	await expect(dialog.locator('input[type="number"]').first()).toHaveValue('1234');

	await dialog.getByRole('button', { name: 'Cancelar', exact: true }).click();
	await dialog.getByRole('button', { name: 'Descartar y cerrar', exact: true }).click();
	await expect(dialog).toBeHidden();
});
