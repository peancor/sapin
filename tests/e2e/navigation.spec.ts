import { test, expect, type Page } from '@playwright/test';

test('analytics preserves distinct groups with identical displayed paths and titles', async ({
	page
}) => {
	const errors: string[] = [];
	page.on('pageerror', (error) => errors.push(error.message));
	await login(page, 'admin');
	await page.goto('/admin/analytics/user/student');
	const topPages = page
		.getByRole('heading', { name: 'Páginas Más Visitadas', exact: true })
		.locator('../..');
	await expect(topPages.getByText('/', { exact: true })).toHaveCount(2);
	await page.reload();
	await expect(topPages.getByText('/', { exact: true })).toHaveCount(2);
	await page.goto('/admin/analytics/realtime');
	await expect(page.getByText('/', { exact: true })).toHaveCount(3);
	// A second real SSE update must preserve all three rows without duplicate keys.
	await page.waitForTimeout(5500);
	await expect(page.getByText('/', { exact: true })).toHaveCount(3);
	expect(errors).toEqual([]);
});

async function login(page: Page, user = 'student') {
	await page.goto('/login');
	await page.getByLabel(/correo electrónico/i).fill(`${user}@example.invalid`);
	await page.getByLabel('Contraseña', { exact: true }).fill('Sapin-e2e-2026!');
	await page.getByRole('button', { name: 'Iniciar sesión', exact: true }).click();
	await expect(page).not.toHaveURL(/\/login/);
}

test('global tutor is unavailable and absent from navigation', async ({ page }) => {
	await login(page);
	await page.goto('/dashboard');
	await expect(page.locator('header a[href="/dashboard"]').first()).toBeVisible();
	await expect(page.locator('a[href^="/tutor"]')).toHaveCount(0);
	await page.setViewportSize({ width: 390, height: 844 });
	await page.getByRole('button', { name: 'Menu', exact: true }).click();
	await expect(page.getByText('Navegación', { exact: true })).toBeVisible();
	await expect(page.locator('a[href^="/tutor"]')).toHaveCount(0);
	for (const path of ['/tutor', '/tutor/c/retired-chat']) {
		const response = await page.request.get(path);
		expect(response.status()).toBe(404);
	}
	const response = await page.request.post('/api/tutor/chat');
	expect(response.status()).toBe(404);
});

test('registration prefills the invitation and retains edits after validation fails', async ({
	page
}) => {
	await page.goto('/register?invite=URL-INVITATION');
	const invitation = page.locator('input[name="inviteCode"]');
	await expect(invitation).toHaveValue('URL-INVITATION');
	await invitation.fill('EDITED-INVALID-CODE');
	await page.locator('input[name="email"]').fill('unused@example.invalid');
	await page.locator('input[name="password"]').fill('Sapin-e2e-2026!');
	await page.locator('form button[type="submit"]').click();
	await expect(page.getByText('Código de invitación inválido', { exact: true })).toBeVisible();
	await expect(invitation).toHaveValue('EDITED-INVALID-CODE');
	await page.reload();
	await expect(invitation).toHaveValue('URL-INVITATION');
});

test('course sidebar opens, closes with Escape and reopens on mobile', async ({ page }) => {
	await page.setViewportSize({ width: 390, height: 844 });
	await login(page, 'admin');
	await page.goto('/admin/courses/course');
	const courseLink = page.locator('#context-sidebar a[href="/admin/courses/course/edit"]');
	await expect(courseLink).toBeHidden();
	await page.getByRole('button', { name: 'Open sidebar', exact: true }).last().click();
	await expect(courseLink).toBeVisible();
	await page.keyboard.press('Escape');
	await expect(courseLink).toBeHidden();
	await page.getByRole('button', { name: 'Open sidebar', exact: true }).last().click();
	await expect(courseLink).toBeVisible();
	await courseLink.click();
	await expect(page).toHaveURL(/\/admin\/courses\/course\/edit$/);
});

test('administration sidebars remain accessible across tablet and desktop sizes', async ({
	page
}, testInfo) => {
	await login(page, 'admin');
	for (const path of [
		'/admin',
		'/admin/courses/course',
		'/course/course/admin',
		'/course/course/admin/interactives/activity/chatedit'
	]) {
		await page.setViewportSize({ width: 900, height: 800 });
		await page.goto(path);
		const toggle = page.getByRole('button', { name: 'Open sidebar', exact: true });
		await expect(toggle).toBeVisible();
		await expect(page.locator('aside:visible')).toHaveCount(0);
		await toggle.click();
		await expect(page.locator('aside:visible')).toHaveCount(1);
		await expect
			.poll(async () => (await page.locator('#context-sidebar').boundingBox())?.x)
			.toBe(0);
		if (path === '/admin/courses/course') {
			await page.screenshot({ path: testInfo.outputPath('course-sidebar-tablet.png') });
		}
		await page.setViewportSize({ width: 1280, height: 800 });
		await expect(toggle).toBeHidden();
		await expect(page.locator('aside:visible')).toHaveCount(1);
		await expect(page.locator('#context-sidebar-desktop')).toBeVisible();
		if (path === '/admin/courses/course') {
			await page.screenshot({ path: testInfo.outputPath('course-sidebar-desktop.png') });
			const activeCourseLink = page.locator('#context-sidebar-desktop a[aria-current="page"]');
			const lightBackground = await activeCourseLink.evaluate(
				(element) => getComputedStyle(element).backgroundColor
			);
			await page.getByRole('button', { name: 'Activar tema oscuro', exact: true }).click();
			await expect(activeCourseLink).not.toHaveCSS('background-color', lightBackground);
			await page.screenshot({
				path: testInfo.outputPath('course-sidebar-desktop-dark.png'),
				animations: 'disabled'
			});
			await page.getByRole('button', { name: 'Activar tema claro', exact: true }).click();
			await page.setViewportSize({ width: 390, height: 844 });
			await toggle.click();
			await expect
				.poll(async () => (await page.locator('#context-sidebar').boundingBox())?.x)
				.toBe(0);
			await expect(
				page.locator('#context-sidebar').getByText('Vista estudiante', { exact: true })
			).toBeVisible();
			await page.screenshot({ path: testInfo.outputPath('course-sidebar-mobile.png') });
			await page.keyboard.press('Escape');
		}
		await page.setViewportSize({ width: 900, height: 800 });
		await expect(page.locator('aside:visible')).toHaveCount(0);
		await toggle.click();
		await page.keyboard.press('Escape');
		await expect(page.locator('aside:visible')).toHaveCount(0);
		const response = await page.request.get(path);
		expect(await response.text()).toContain('id="context-sidebar-desktop"');
		await expect(page).not.toHaveTitle('Mi Espacio - SAPIN');
	}
});

test('mobile global menu occupies the viewport and closes on Escape and navigation', async ({
	page
}, testInfo) => {
	await login(page, 'admin');
	await page.goto('/admin');
	await page.setViewportSize({ width: 390, height: 844 });
	const toggle = page.getByRole('button', { name: 'Menu', exact: true });
	const menu = page.locator('#mobile-navigation');
	await toggle.click();
	await expect(toggle).toHaveAttribute('aria-expanded', 'true');
	await expect(menu).toBeVisible();
	await expect.poll(async () => (await menu.boundingBox())?.height ?? 0).toBeGreaterThan(700);
	await page.screenshot({ path: testInfo.outputPath('mobile-navigation.png') });
	await page.keyboard.press('Escape');
	await expect(menu).toBeHidden();
	await toggle.click();
	await menu.locator('a[href="/dashboard"]').click();
	await expect(page).toHaveURL(/\/dashboard$/);
	await expect(menu).toBeHidden();
	await expect(toggle).toHaveAttribute('aria-expanded', 'false');
});

test('opening notifications preserves the total unread count and fetches the list once', async ({
	page
}) => {
	let listRequests = 0;
	await page.route('**/api/notifications/unread-count', (route) =>
		route.fulfill({ json: { count: 25 } })
	);
	await page.route('**/api/notifications?limit=10', (route) => {
		listRequests++;
		return route.fulfill({ json: { notifications: [] } });
	});
	await login(page, 'admin');
	const bell = page.getByRole('button', { name: 'Notificaciones: 25 sin leer', exact: true });
	await bell.click();
	await expect(bell).toHaveAttribute('aria-expanded', 'true');
	await expect(page.getByText('No tienes notificaciones', { exact: true })).toBeVisible();
	await expect(bell).toBeVisible();
	expect(listRequests).toBe(1);
});

test('file processing displays the failed count returned by the batch service', async ({
	page
}) => {
	const actions: string[] = [];
	await login(page, 'admin');
	await page.route('**/api/admin/files/process', async (route) => {
		if (route.request().method() !== 'POST') return route.continue();
		const { action } = route.request().postDataJSON();
		actions.push(action);
		await route.fulfill({
			json:
				action === 'requeue-failed'
					? { success: true, requeuedCount: 2 }
					: { success: true, result: { processed: 5, succeeded: 3, failed: 2, errors: [] } }
		});
	});
	await page.goto('/admin/files');
	await page.getByRole('button', { name: 'Procesamiento', exact: true }).click();
	await page.getByRole('button', { name: 'Procesar Lote (5 archivos)', exact: true }).click();
	await expect(page.getByText('Fallidos: 2', { exact: true })).toBeVisible();
	await page.getByRole('button', { name: 'Reencolar Fallidos', exact: true }).click();
	await expect(page.getByText('Reencolados: 2', { exact: true })).toBeVisible();
	expect(actions).toEqual(['process-batch', 'requeue-failed']);
});

test('debugger navigation preserves query filters and session identity', async ({ page }) => {
	const errors: string[] = [];
	page.on('pageerror', (error) => errors.push(error.message));
	await login(page, 'admin');
	await page.goto('/admin/activity-debugger/activities/agent?tab=sessions&search=student');
	await page.getByRole('link', { name: 'Configuracion', exact: true }).click();
	await expect(page).toHaveURL(/activities\/agent\?tab=config&search=student$/);
	await page.getByRole('link', { name: 'Sesiones', exact: true }).click();
	await page.getByRole('link', { name: 'Limpiar', exact: true }).click();
	await expect(page).toHaveURL(/activities\/agent\?tab=sessions$/);
	await page
		.locator('a[href="/admin/activity-debugger/activities/agent/sessions/agent-chat?tab=timeline"]')
		.click();
	await page.getByRole('link', { name: 'Compact', exact: true }).click();
	await expect(page).toHaveURL(/sessions\/agent-chat\?tab=timeline&density=compact$/);
	await page.getByRole('link', { name: 'Raw JSON', exact: true }).click();
	await expect(page).toHaveURL(/sessions\/agent-chat\?tab=raw&density=compact$/);
	await page.reload();
	await expect(page.getByRole('link', { name: 'Timeline', exact: true })).toBeVisible();
	expect(errors).toEqual([]);
});

test('creating an activity follows the form redirect without an unsaved changes prompt', async ({
	page
}) => {
	const dialogs: string[] = [];
	page.on('dialog', async (dialog) => {
		dialogs.push(dialog.message());
		await dialog.dismiss();
	});
	await login(page, 'teacher');
	await page.goto('/course/course/admin/interactives/new');
	await page.locator('input[name="name"]').fill('Actividad de navegación');
	await page.getByRole('button', { name: 'Crear y configurar', exact: true }).click();
	await expect(page).toHaveURL(/\/course\/course\/admin\/interactives\/[^/]+\/chatedit$/);
	await expect(page.locator('input[name="name"]')).toHaveValue('Actividad de navegación');
	expect(dialogs).toEqual([]);
});

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

test('course lists preserve distinct active role assignments without duplicate keys', async ({
	page
}) => {
	const pageErrors: string[] = [];
	page.on('pageerror', (error) => pageErrors.push(error.message));
	await login(page, 'teacher');
	await page.goto('/dashboard');
	await expect(page.getByRole('link', { name: 'Gestionar', exact: true })).toHaveCount(3);
	await expect(page.getByRole('link', { name: 'Continuar', exact: true })).toHaveCount(2);
	await page.getByRole('link', { name: 'Gestionar', exact: true }).first().click();
	await expect(page).toHaveURL(/\/course\/course\/admin$/);
	await page.goto('/teacher');
	await expect(page.getByRole('link', { name: 'Administrar curso', exact: true })).toHaveCount(3);
	await page.reload();
	await expect(page.getByRole('link', { name: 'Administrar curso', exact: true })).toHaveCount(3);
	await page.goto('/student');
	await expect(page.getByRole('link', { name: 'Continuar Aprendiendo', exact: true })).toHaveCount(
		5
	);
	await page.getByRole('link', { name: 'Continuar Aprendiendo', exact: true }).first().click();
	await expect(page).toHaveURL(/\/course\/course\/run$/);
	expect(pageErrors).toEqual([]);
});

test('student course navigation does not grant course administration access', async ({ page }) => {
	await login(page);
	await page.goto('/dashboard');
	await expect(page.getByRole('link', { name: 'Gestionar', exact: true })).toHaveCount(0);
	await expect(page.getByRole('link', { name: 'Continuar', exact: true })).toHaveCount(1);
	const adminResponse = await page.request.get('/course/course/admin', { maxRedirects: 0 });
	expect(adminResponse.status()).toBe(303);
	expect(adminResponse.headers().location).toBe('/');
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
	const pageErrors: string[] = [];
	page.on('pageerror', (error) => pageErrors.push(error.message));
	await login(page, 'admin');
	await page.goto('/admin/courses/course');
	await page.locator('a[href="/admin/courses/course/edit"]').first().click();
	await expect(page).toHaveURL(/\/admin\/courses\/course\/edit$/);
	await page.locator('a[href="/admin/courses/course/teachers"]').first().click();
	await expect(page).toHaveURL(/\/admin\/courses\/course\/teachers$/);
	await expect(page.getByRole('row').filter({ hasText: 'teacher@example.invalid' })).toHaveCount(3);
	await page.locator('a[href="/admin/courses/course/students"]').first().click();
	await expect(page).toHaveURL(/\/admin\/courses\/course\/students$/);
	await expect(page.getByRole('row').filter({ hasText: 'teacher@example.invalid' })).toHaveCount(2);
	await page.goto('/admin/users/student');
	await page.locator('a[href="/admin/users/student/edit"]').first().click();
	await expect(page).toHaveURL(/\/admin\/users\/student\/edit$/);
	await page.getByRole('link', { name: 'Cancelar', exact: true }).click();
	await expect(page).toHaveURL(/\/admin\/users$/);
	await page.goto('/admin/analytics/user/student');
	await page.locator('a[href="/admin/analytics?tab=users"]').click();
	await expect(page).toHaveURL(/\/admin\/analytics\?tab=users$/);
	expect(pageErrors).toEqual([]);
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
