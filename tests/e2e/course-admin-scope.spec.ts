import { test, expect, type Page } from '@playwright/test';

// "teacher" administra "course" pero no tiene rol en "foreign-course" (ver scripts/e2e-seed.ts).
// Cada acción se envía a una ruta de "course", con IDs de recursos de "foreign-course".
const PASSWORD = 'Sapin-e2e-2026!';

async function login(page: Page, user: string) {
	await page.goto('/login');
	await page.getByLabel(/correo electrónico/i).fill(`${user}@example.invalid`);
	await page.getByLabel('Contraseña', { exact: true }).fill(PASSWORD);
	await page.getByRole('button', { name: 'Iniciar sesión', exact: true }).click();
	await expect(page).not.toHaveURL(/\/login/);
}

/**
 * Envía una acción de formulario y devuelve su estado efectivo. SvelteKit responde a las
 * peticiones de acción con JSON: `fail()` llega con HTTP 200 y `{ type: 'failure', status }`,
 * mientras que `error()` usa el código HTTP real.
 */
async function post(
	page: Page,
	baseURL: string | undefined,
	url: string,
	form: Record<string, string>
): Promise<number> {
	const response = await page.request.post(url, {
		headers: { origin: baseURL ?? 'http://127.0.0.1:4187', accept: 'application/json' },
		form,
		maxRedirects: 0
	});
	if (response.headers()['content-type']?.includes('application/json')) {
		const body = (await response.json()) as { type?: string; status?: number };
		if (body.type === 'failure' && body.status) return body.status;
	}
	return response.status();
}

test('course admin actions cannot modify resources of another course', async ({
	page,
	baseURL
}) => {
	await login(page, 'teacher');

	// Orden y ficheros del curso: IDs de otro curso no afectan a ninguna fila
	const foreignOrder = await post(page, baseURL, '/course/course/admin/edit?/updateOrder', {
		id: 'foreign-chat',
		order: '1'
	});
	expect(foreignOrder).toBe(404);
	const ownOrder = await post(page, baseURL, '/course/course/admin/edit?/updateOrder', {
		id: 'activity',
		order: '1'
	});
	expect(ownOrder).toBe(200);
	const foreignFile = await post(page, baseURL, '/course/course/admin/edit?/deleteFile', {
		fileId: 'foreign-course-file'
	});
	expect(foreignFile).toBe(404);

	// Lista de actividades
	for (const action of ['deleteInteractive', 'updateOrder']) {
		const response = await post(page, baseURL, `/course/course/admin/interactives?/${action}`, {
			id: 'foreign-chat',
			order: '1'
		});
		expect(response, action).toBe(404);
	}

	// Editor de chat: la actividad de la URL debe pertenecer al curso de la URL...
	for (const action of ['updateChat', 'deleteRagDocument', 'deleteFile', 'reindexRagDocuments']) {
		const response = await post(
			page,
			baseURL,
			`/course/course/admin/interactives/foreign-chat/chatedit?/${action}`,
			{ name: 'Secuestrado', documentId: 'foreign-rag', fileId: 'foreign-activity-file' }
		);
		expect(response, action).toBe(403);
	}
	// ...y los documentos y ficheros deben pertenecer a esa actividad
	const foreignRag = await post(
		page,
		baseURL,
		'/course/course/admin/interactives/activity/chatedit?/deleteRagDocument',
		{ documentId: 'foreign-rag' }
	);
	expect(foreignRag).toBe(404);
	const foreignActivityFile = await post(
		page,
		baseURL,
		'/course/course/admin/interactives/activity/chatedit?/deleteFile',
		{ fileId: 'foreign-activity-file' }
	);
	expect(foreignActivityFile).toBe(404);

	// Invitaciones: no se desactivan invitaciones de otro curso
	const foreignInvite = await post(page, baseURL, '/course/course/admin/invites?/deactivate', {
		inviteId: 'foreign-invite'
	});
	expect(foreignInvite).toBe(404);
});

test('course invites cannot grant a role above the issuer', async ({ page, baseURL }) => {
	await login(page, 'teacher');
	const invite = (courseRole: string) =>
		post(page, baseURL, '/course/course/admin/invites?/generate', {
			inviteType: 'course_role',
			courseRole,
			quantity: '1',
			expiresInDays: '7',
			maxUses: '1'
		});

	expect(await invite('admin')).toBe(403);
	expect(await invite('owner')).toBe(403);
	expect(await invite('superuser')).toBe(400);
	expect(await invite('teacher')).toBe(200);

	// El formulario solo ofrece roles hasta el nivel del emisor
	await page.goto('/course/course/admin/invites');
	await page.getByRole('button', { name: 'Generar', exact: true }).click();
	await page.getByLabel('Tipo').selectOption('course_role');
	const roles = page.getByLabel('Rol en el curso');
	await expect(roles.locator('option[value="teacher"]')).toHaveCount(1);
	await expect(roles.locator('option[value="admin"]')).toHaveCount(0);
});

test('foreign course resources stay intact for their administrators', async ({ page }) => {
	await login(page, 'admin');
	await page.goto('/course/foreign-course/admin/invites');
	const row = page.getByRole('row').filter({ hasText: 'FOREIGN-INVITE' });
	await expect(row).toBeVisible();
	await expect(row.getByRole('button', { name: /Desactivar invitación/ })).toBeVisible();
});
