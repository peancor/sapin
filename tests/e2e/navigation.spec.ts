import { test, expect, type Page } from '@playwright/test';

async function login(page: Page, user = 'student') {
	await page.goto('/login');
	await page.getByLabel(/correo electrónico/i).fill(`${user}@example.invalid`);
	await page.getByLabel('Contraseña', { exact: true }).fill('Sapin-e2e-2026!');
	await page.getByRole('button', { name: 'Iniciar sesión', exact: true }).click();
	await expect(page).not.toHaveURL(/\/login/);
}

test('public navigation keeps login, registration and footer destinations', async ({ page }) => {
	await page.goto('/login');
	await page.locator('a[href="/register"]').first().click();
	await expect(page).toHaveURL(/\/register$/);
	await page.locator('a[href="/login"]').first().click();
	await expect(page).toHaveURL(/\/login$/);
	await page.locator('footer a[href="/privacy"]').click();
	await expect(page).toHaveURL(/\/privacy$/);
	await page.locator('a[href="/contact"]').first().click();
	await expect(page).toHaveURL(/\/contact$/);
});

test('student follows course and agent links and returns to the activity', async ({ page }) => {
	await login(page);
	await page.goto('/student');
	await page.getByRole('link', { name: 'Continuar Aprendiendo' }).click();
	await expect(page).toHaveURL(/\/course\/course\/run$/);
	await page.goto('/agent-chat/agent');
	await page.locator('a[href="/agent-chat/agent/c/agent-chat"]').click();
	await expect(page).toHaveURL(/\/agent-chat\/agent\/c\/agent-chat$/);
	await page.getByRole('link', { name: 'Volver a la actividad', exact: true }).click();
	await expect(page).toHaveURL(/\/agent-chat\/agent$/);
});

test('notification navigation preserves filters after reload and back navigation', async ({
	page
}) => {
	await login(page);
	await page.goto('/notifications');
	await page.getByRole('combobox').selectOption('system');
	await page.getByRole('button', { name: 'Aplicar', exact: true }).click();
	await expect(page).toHaveURL(/\/notifications\?type=system&page=1$/);
	await page.reload();
	await expect(page.getByRole('combobox')).toHaveValue('system');
	await page.getByRole('combobox').selectOption('enrollment');
	await page.getByRole('button', { name: 'Aplicar', exact: true }).click();
	await expect(page).toHaveURL(/\/notifications\?type=enrollment&page=1$/);
	await page.goBack();
	await expect(page.getByRole('combobox')).toHaveValue('system');
});

test('admin navigation retains course and user identifiers and return query', async ({ page }) => {
	await login(page, 'admin');
	await page.goto('/admin/courses/course');
	await page.locator('a[href="/admin/courses/course/edit"]').first().click();
	await expect(page).toHaveURL(/\/admin\/courses\/course\/edit$/);
	await page.locator('a[href="/admin/courses/course/teachers"]').first().click();
	await expect(page).toHaveURL(/\/admin\/courses\/course\/teachers$/);
	await page.goto('/admin/users/student');
	await page.locator('a[href="/admin/users/student/edit"]').first().click();
	await expect(page).toHaveURL(/\/admin\/users\/student\/edit$/);
	await page.getByRole('link', { name: 'Cancelar', exact: true }).click();
	await expect(page).toHaveURL(/\/admin\/users$/);
	await page.goto('/admin/analytics/user/student');
	await page.locator('a[href="/admin/analytics?tab=users"]').click();
	await expect(page).toHaveURL(/\/admin\/analytics\?tab=users$/);
});

test('invitation breadcrumbs lead to the existing course overview and course list', async ({
	page
}) => {
	await login(page, 'admin');
	await page.goto('/course/course/admin/invites');
	const breadcrumbs = page.getByRole('navigation', { name: 'Breadcrumb', exact: true });
	await breadcrumbs.getByRole('link', { name: 'Clase', exact: true }).click();
	await expect(page).toHaveURL(/\/course\/course\/admin$/);
	await page.goto('/course/course/admin/invites');
	await breadcrumbs.getByRole('link', { name: 'Cursos', exact: true }).click();
	await expect(page).toHaveURL(/\/dashboard$/);
	await expect(page).toHaveTitle('Mi Espacio - SAPIN');
});

test('RAG links preserve file endpoints and external and legacy resource URLs', async ({
	page
}) => {
	await login(page, 'teacher');
	await page.goto('/course/course/admin/interactives/activity/chatedit');
	for (const href of [
		'/api/files/rag-fixture?download=1#page=2',
		'https://example.invalid/material.pdf?token=a%2Bb#page=3',
		'/uploads/legacy.pdf'
	]) {
		const link = page.locator(`a[href="${href}"]`);
		await expect(link).toHaveCount(1);
		await expect(link).toHaveAttribute('target', '_blank');
		await expect(link).toHaveAttribute('rel', /noreferrer/);
	}
});

test('invitation rows retain their identity when new codes are added and one is deactivated', async ({
	page
}) => {
	await login(page, 'admin');
	await page.goto('/course/course/admin/invites');
	await page.getByRole('button', { name: 'Generar', exact: true }).click();
	await page.getByLabel('Cantidad', { exact: true }).fill('2');
	await page.getByRole('button', { name: 'Generar 2 invitaciones', exact: true }).click();
	const dialog = page.getByRole('dialog');
	await expect(dialog).toBeVisible();
	await expect(dialog.locator('code')).toHaveCount(2);
	const codes = await dialog.locator('code').allTextContents();
	await page.keyboard.press('Escape');
	await expect(dialog).not.toBeVisible();
	const firstRow = page
		.getByRole('row')
		.filter({ has: page.locator('code', { hasText: codes[0] }) });
	const firstRowNode = await firstRow.elementHandle();
	if (!firstRowNode) throw new Error('The generated invitation row is missing.');
	await page.getByLabel('Cantidad', { exact: true }).fill('1');
	await page.getByRole('button', { name: 'Generar invitación', exact: true }).click();
	await expect(dialog).toBeVisible();
	await expect(dialog.locator('code')).toHaveCount(1);
	const newCode = await dialog.locator('code').innerText();
	expect(codes).not.toContain(newCode);
	await page.keyboard.press('Escape');
	await expect(dialog).not.toBeVisible();
	await expect(firstRow).toContainText('Disponible');
	expect(await firstRow.evaluate((node, original) => node === original, firstRowNode)).toBe(true);
	await firstRow.locator('form[action="?/deactivate"] button').click();
	await expect(firstRow).toContainText('Desactivada');
	for (const code of [codes[1], newCode]) {
		await expect(
			page.getByRole('row').filter({ has: page.locator('code', { hasText: code }) })
		).toContainText('Disponible');
	}
});
