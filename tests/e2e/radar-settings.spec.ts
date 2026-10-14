import { test, expect, type Page } from '@playwright/test';

const api = '/api/course/course/interactives/activity/radar';
async function login(page: Page, user = 'teacher') {
	await page.goto('/login');
	await page.getByLabel(/correo electrónico/i).fill(`${user}@example.invalid`);
	await page.getByLabel('Contraseña', { exact: true }).fill('Sapin-e2e-2026!');
	await page.getByRole('button', { name: 'Iniciar sesión', exact: true }).click();
	await expect(page).not.toHaveURL(/\/login/);
}

test('teacher reuses settings, switches views and updates instructions without changing classification', async ({
	page
}) => {
	await login(page);
	await page.goto('/course/course/admin/interactives/activity/radar');
	await page.getByRole('button', { name: 'Nuevo seguimiento', exact: true }).click();
	await page.getByLabel('Título de la clase').fill('Radar personalizado E2E');
	await page
		.getByLabel('Contexto de la explicación', { exact: false })
		.fill('Clase ficticia de derivadas');
	await page
		.getByLabel('Instrucciones para el resumen y las sugerencias')
		.fill('Usa ejemplos geométricos');
	await page.getByLabel('Vista inicial').selectOption('cloud');
	await page.getByLabel('Nombre para reutilizar esta configuración').fill('Geometría E2E');
	await page.getByRole('button', { name: 'Guardar configuración', exact: true }).click();
	await expect(
		page.getByRole('status').filter({ hasText: 'Configuración guardada' })
	).toBeVisible();
	await page.getByLabel('Instrucciones para el resumen y las sugerencias').fill('Temporal');
	await page.getByRole('button', { name: 'Cargar', exact: true }).click();
	await expect(page.getByLabel('Instrucciones para el resumen y las sugerencias')).toHaveValue(
		'Usa ejemplos geométricos'
	);
	const created = page.waitForResponse(
		(r) => r.url().endsWith('/radar/runs') && r.request().method() === 'POST'
	);
	await page.getByRole('button', { name: 'Iniciar seguimiento', exact: true }).click();
	const run = await (await created).json();
	expect(run.instructions).toBe('Usa ejemplos geométricos');
	expect(run.initialView).toBe('cloud');
	// Only topic results are simulated. Settings, sessions and permission checks use the real server.
	await page.route(`**/radar/runs/${run.id}?*`, async (route) => {
		const response = await route.fetch();
		const snapshot = await response.json();
		snapshot.topics = [
			{ id: 'topic-a', title: 'Pendiente', description: 'Tema ficticio', students: 3, messages: 8 },
			{ id: 'topic-b', title: 'Notación', description: 'Tema ficticio', students: 5, messages: 6 }
		].map((topic) => ({
			...topic,
			suggestion: null,
			intents: { concept: topic.messages },
			confusionCount: 0,
			trend: null,
			firstAt: run.startsAt,
			lastAt: run.startsAt
		}));
		await route.fulfill({ response, json: snapshot });
	});
	await page.reload();
	await expect(page.getByLabel('Nube de temas', { exact: true })).toBeVisible();
	await expect(
		page
			.getByLabel('Nube de temas', { exact: true })
			.getByRole('button', { name: /Pendiente 3 alumnos distintos/ })
	).toBeVisible();
	await page.getByLabel('Tamaño por').selectOption('messages');
	await expect(
		page
			.getByLabel('Nube de temas', { exact: true })
			.getByRole('button', { name: /Pendiente 8 mensajes/ })
	).toBeVisible();
	await page.getByRole('combobox', { name: /^Vista/ }).selectOption('bars');
	await expect(page.getByLabel('Barras de temas').getByRole('button').first()).toContainText(
		'Pendiente'
	);
	await page.getByRole('combobox', { name: /^Vista/ }).selectOption('list');
	await expect(page.getByRole('heading', { name: 'Pendiente', exact: true })).toBeVisible();
	await page.getByRole('button', { name: 'Configurar', exact: true }).click();
	await page
		.getByLabel('Instrucciones para el resumen y las sugerencias')
		.fill('Prioriza las dudas de notación');
	await page.getByRole('button', { name: 'Aplicar y actualizar resumen' }).click();
	await expect(page.getByText('Instrucciones activas · versión 2')).toBeVisible();
	const snapshot = await (await page.request.get(`${api}/runs/${run.id}?window=all`)).json();
	expect(snapshot.run.instructions).toBe('Prioriza las dudas de notación');
	expect(snapshot.statistics.messages).toBe(0);
	const conflict = await page.request.patch(`${api}/runs/${run.id}`, {
		data: { instructions: 'Antigua', settingsRevision: 1 }
	});
	expect(conflict.status()).toBe(409);
	const presets = await (await page.request.get(`${api}/presets`)).json();
	const preset = presets.presets.find((p: { name: string }) => p.name === 'Geometría E2E');
	expect((await page.request.delete(`${api}/presets/${preset.id}`)).status()).toBe(204);
	expect((await (await page.request.get(`${api}/runs/${run.id}`)).json()).run.instructions).toBe(
		'Prioriza las dudas de notación'
	);
	await page.reload();
	await expect(page.getByRole('combobox', { name: /^Vista/ })).toHaveValue('list');
	await expect(page.getByLabel('Ordenar por')).toHaveValue('messages');
	await page.request.post(`${api}/runs/${run.id}/stop`);
});

test('radar presets and settings enforce authentication and course permission', async ({
	page,
	request
}) => {
	expect((await request.get(`${api}/presets`)).status()).toBe(401);
	expect((await request.post(`${api}/presets`, { data: { name: 'No autorizado' } })).status()).toBe(
		401
	);
	await login(page, 'student');
	expect((await page.request.get(`${api}/presets`)).status()).toBe(403);
	expect(
		(await page.request.post(`${api}/presets`, { data: { name: 'No autorizado' } })).status()
	).toBe(403);
	expect((await page.request.delete(`${api}/presets/unknown`)).status()).toBe(403);
	expect(
		(
			await page.request.patch(`${api}/runs/unknown`, {
				data: { instructions: 'Cambiar', settingsRevision: 1 }
			})
		).status()
	).toBe(403);
});
