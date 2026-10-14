import { test, expect, type Page } from '@playwright/test';
import type { RadarActionExecution } from '../../src/lib/types/radarActions';

const api = '/api/course/course/interactives/activity/radar';
test.use({ actionTimeout: 15000 });
async function login(page: Page, user = 'teacher') {
	await page.goto('/login');
	await page.getByLabel(/correo electrónico/i).fill(`${user}@example.invalid`);
	await page.getByLabel('Contraseña', { exact: true }).fill('Sapin-e2e-2026!');
	await page.getByRole('button', { name: 'Iniciar sesión', exact: true }).click();
	await expect(page).not.toHaveURL(/\/login/);
}

test('teacher saves, duplicates and executes an action, explores a saved result and sees invalidation', async ({
	page
}) => {
	await login(page);
	const history = await (await page.request.get(`${api}/runs`)).json();
	if (history.active) await page.request.post(`${api}/runs/${history.active.id}/stop`);
	let run: { id: string; startsAt: string; endsAt: string } | undefined;
	let preparationExecutions = 0;
	page.on('request', (request) => {
		if (request.method() === 'POST' && request.url().includes('/action-executions'))
			preparationExecutions++;
	});
	let invalidated = false;
	const result = {
		text: 'Comparación ficticia para comprobar la presentación.',
		evidenceIds: ['fixture-evidence'],
		limitations: ['Resultado de IA simulado en esta prueba.'],
		datasets: [
			{
				id: 'topics',
				title: 'Consultas por tema',
				unit: 'mensajes',
				definition: 'Número de consultas del intervalo',
				rows: [
					{
						key: 'a',
						label: 'Pendiente',
						value: 8,
						previous: 3,
						evidenceIds: ['fixture-evidence']
					},
					{
						key: 'b',
						label: '<img src=x onerror=alert(1)>',
						value: 2,
						previous: null,
						evidenceIds: []
					}
				]
			}
		],
		blocks: [{ datasetId: 'topics', kind: 'bar' }]
	};
	function simulated(execution: RadarActionExecution) {
		return {
			...execution,
			state: invalidated ? 'invalidated' : 'completed',
			error: null,
			result: invalidated ? null : result,
			snapshot: {
				at: run!.startsAt,
				from: run!.startsAt,
				to: run!.endsAt,
				previousFrom: null,
				messages: 10,
				students: 4,
				processed: 10,
				pending: 0,
				notAnalyzable: 0,
				truncated: 0,
				publishedVersion: 1
			}
		};
	}
	try {
		await page.goto('/course/course/admin/interactives/activity/radar');
		await page.getByRole('button', { name: 'Preparar acciones', exact: true }).click();
		const library = page.getByRole('region', { name: 'Preparación de acciones', exact: true });
		const panel = page.getByRole('region', { name: 'Acciones del radar', exact: true });
		await library.getByRole('button', { name: 'Nueva acción' }).click();
		await library.getByLabel('Nombre de la acción').fill('Comparar temas E2E');
		await library
			.getByLabel('Pregunta o instrucciones')
			.fill('Compara los temas consultados y ofrece ejemplos.');
		await library.getByLabel('Disponible en').selectOption('course');
		await library.getByRole('combobox', { name: /^Intervalo/ }).selectOption('compare');
		await library.getByLabel('Minutos por periodo').fill('5');
		await library.getByLabel('Presentación preferida').selectOption('bar');
		await library.getByRole('button', { name: 'Guardar acción', exact: true }).click();
		const card = library
			.getByRole('article')
			.filter({ has: page.getByRole('heading', { name: 'Comparar temas E2E', exact: true }) });
		await expect(card).toBeVisible();
		await card.getByRole('button', { name: 'Duplicar', exact: true }).click();
		await expect(library.getByLabel('Nombre de la acción')).toHaveValue(
			'Comparar temas E2E (copia)'
		);
		await library.getByRole('button', { name: 'Guardar acción', exact: true }).click();
		await expect(
			library.getByRole('heading', { name: 'Comparar temas E2E (copia)', exact: true })
		).toBeVisible();
		await expect(
			library.getByText('Disponible tras 10 minutos', { exact: false }).first()
		).toBeVisible();
		await expect(library.getByRole('button', { name: /^Ejecutar / })).toHaveCount(0);
		expect(preparationExecutions).toBe(0);
		expect((await (await page.request.get(`${api}/runs`)).json()).active).toBeNull();
		await library.getByRole('button', { name: 'Cerrar preparación' }).click();
		const newRun = page.getByRole('button', { name: 'Nuevo seguimiento', exact: true });
		if (await newRun.isVisible()) await newRun.click();
		await page.getByLabel('Título de la clase').fill('Acciones E2E');
		const creation = page.waitForResponse(
			(response) => response.url().endsWith('/radar/runs') && response.request().method() === 'POST'
		);
		await page.getByRole('button', { name: 'Iniciar seguimiento', exact: true }).click();
		run = await (await creation).json();
		// CRUD, authorization and execution enqueue are real. Only AI result/evidence delivery is simulated.
		await page.route(`**/radar/runs/${run!.id}/action-executions**`, async (route) => {
			if (route.request().url().includes('/evidence?')) {
				await route.fulfill({
					json: {
						evidence: [
							{
								id: 'fixture-evidence',
								at: run!.startsAt,
								text: 'Pregunta ficticia: ¿qué representa la pendiente?'
							}
						]
					}
				});
				return;
			}
			const response = await route.fetch();
			if (!response.ok()) {
				await route.fulfill({ response });
				return;
			}
			const payload = await response.json();
			await route.fulfill({
				response,
				json: payload.executions
					? { ...payload, executions: payload.executions.map(simulated) }
					: simulated(payload)
			});
		});

		await expect(
			panel.getByRole('button', { name: 'Ejecutar Comparar temas E2E', exact: true })
		).toBeDisabled();
		await expect(panel.getByText(/necesita 10 minutos de seguimiento/).first()).toBeVisible();
		await expect(panel.getByRole('button', { name: 'Editar', exact: true })).toHaveCount(0);
		await panel.getByRole('button', { name: 'Preparar acciones', exact: true }).click();
		// A new run has no completed comparison windows yet. Preserve the compare copy,
		// then edit the action through the real UI before exercising execution enqueue.
		await card.getByRole('button', { name: 'Editar', exact: true }).click();
		await library.getByRole('combobox', { name: /^Intervalo/ }).selectOption('all');
		await library.getByRole('button', { name: 'Guardar acción', exact: true }).click();
		await expect(card).toContainText('Todo el seguimiento');
		await library.getByRole('button', { name: 'Cerrar preparación' }).click();
		const enqueue = page.waitForResponse(
			(r) =>
				r.url().endsWith(`/runs/${run!.id}/action-executions`) && r.request().method() === 'POST'
		);
		await panel.getByRole('button', { name: 'Ejecutar Comparar temas E2E', exact: true }).click();
		expect((await enqueue).status()).toBe(202);
		await expect(
			panel.getByRole('heading', { name: 'Comparar temas E2E · Completado', exact: true })
		).toBeVisible();
		const dataset = panel.getByRole('region', { name: 'Consultas por tema', exact: true });
		await expect(dataset.locator('canvas').first()).toBeVisible();
		await dataset.getByLabel('Mostrar como').selectOption('table');
		await expect(dataset.getByRole('cell', { name: '8', exact: true })).toBeVisible();
		await expect(
			dataset.getByRole('rowheader', { name: '<img src=x onerror=alert(1)>', exact: true })
		).toBeVisible();
		await expect(dataset.locator('img')).toHaveCount(0);
		await dataset.getByRole('combobox', { name: /^Series/ }).selectOption('difference');
		await expect(dataset.getByRole('cell', { name: '5', exact: true })).toBeVisible();
		await expect(dataset.getByRole('cell', { name: 'Sin datos', exact: true })).toBeVisible();
		await dataset.getByLabel('Filtrar filas').fill('Pendiente');
		await expect(dataset.getByText('1 de 2 filas.', { exact: false })).toBeVisible();
		await dataset.getByRole('button', { name: 'Ver evidencias de Pendiente', exact: true }).click();
		await expect(panel.getByText('Pregunta ficticia: ¿qué representa la pendiente?')).toBeVisible();
		await dataset.getByLabel('Mostrar como').selectOption('line');
		await expect(dataset.locator('canvas').first()).toBeVisible();
		await dataset.getByLabel('Mostrar como').selectOption('statistics');
		await expect(dataset.getByText('5', { exact: true })).toBeVisible();
		invalidated = true;
		await expect(
			panel.getByRole('heading', { name: 'Comparar temas E2E · Resultado retirado', exact: true })
		).toBeVisible();
		await expect(dataset).not.toBeVisible();
		await expect(
			panel.getByRole('heading', { name: 'Evidencias del resultado', exact: true })
		).not.toBeVisible();
		const actions = (await (await page.request.get(`${api}/actions`)).json()).actions;
		const action = actions.find((item: { name: string }) => item.name === 'Comparar temas E2E');
		const edited = await page.request.patch(`${api}/actions/${action.id}`, {
			data: {
				name: 'Actualizada E2E',
				prompt: action.prompt,
				scope: action.scope,
				window: action.window,
				minutes: action.minutes,
				presentation: action.presentation,
				revision: action.revision
			}
		});
		expect(edited.ok()).toBeTruthy();
		expect(
			(
				await page.request.delete(`${api}/actions/${action.id}?revision=${action.revision}`)
			).status()
		).toBe(409);
	} finally {
		const actions = (await (await page.request.get(`${api}/actions`)).json()).actions;
		for (const action of actions.filter((item: { name: string }) => /E2E/.test(item.name)))
			await page.request.delete(`${api}/actions/${action.id}?revision=${action.revision}`);
		if (run) await page.request.post(`${api}/runs/${run.id}/stop`);
	}
});

test('action library and executions reject unauthenticated users and students', async ({
	page,
	request
}) => {
	expect((await request.get(`${api}/actions`)).status()).toBe(401);
	expect((await request.post(`${api}/runs/unknown/action-executions`, { data: {} })).status()).toBe(
		401
	);
	await login(page, 'student');
	expect((await page.request.get(`${api}/actions`)).status()).toBe(403);
	expect((await page.request.post(`${api}/actions`, { data: {} })).status()).toBe(403);
	expect((await page.request.get(`${api}/runs/unknown/action-executions`)).status()).toBe(403);
	expect(
		(
			await page.request.get(`${api}/runs/unknown/action-executions/unknown/evidence?ids=unknown`)
		).status()
	).toBe(403);
});

test('comparison becomes available automatically using server time without executing it', async ({
	page
}) => {
	await login(page);
	const history = await (await page.request.get(`${api}/runs`)).json();
	if (history.active) await page.request.post(`${api}/runs/${history.active.id}/stop`);
	const createdRun = await page.request.post(`${api}/runs`, {
		data: { title: 'Disponibilidad E2E', durationMinutes: 15, modelId: 'model' }
	});
	expect(createdRun.ok()).toBeTruthy();
	const run = await createdRun.json();
	const createdAction = await page.request.post(`${api}/actions`, {
		data: {
			name: 'Desbloqueo E2E',
			prompt: 'Compara las consultas.',
			scope: 'activity',
			window: 'compare',
			minutes: 1,
			presentation: 'text'
		}
	});
	expect(createdAction.ok()).toBeTruthy();
	const action = await createdAction.json();
	let executionPosts = 0;
	page.on('request', (request) => {
		if (request.method() === 'POST' && request.url().includes('/action-executions'))
			executionPosts++;
	});
	try {
		// Only the server timestamp is shifted. This test never enqueues an AI request.
		await page.route(`**/radar/runs/${run.id}?*`, async (route) => {
			const response = await route.fetch();
			const snapshot = await response.json();
			snapshot.serverTime = new Date(Date.parse(run.startsAt) + 120000 - 1500).toISOString();
			await route.fulfill({ response, json: snapshot });
		});
		const clockStart = new Date('2030-01-01T12:00:00Z');
		await page.clock.install({ time: clockStart });
		await page.clock.pauseAt(new Date(clockStart.getTime() + 1000));
		await page.goto(`/course/course/admin/interactives/activity/radar?run=${run.id}`);
		const panel = page.getByRole('region', { name: 'Acciones del radar', exact: true });
		const execute = panel.getByRole('button', { name: 'Ejecutar Desbloqueo E2E', exact: true });
		await expect(execute).toBeDisabled();
		await page.clock.fastForward(2500);
		await expect(execute).toBeEnabled();
		expect(executionPosts).toBe(0);
	} finally {
		await page.request.delete(`${api}/actions/${action.id}?revision=${action.revision}`);
		await page.request.post(`${api}/runs/${run.id}/stop`);
	}
});
