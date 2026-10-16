import { test, expect, type Page } from '@playwright/test';

async function emit(page: Page, data: unknown) {
	await page.evaluate(
		(payload) => window.dispatchEvent(new CustomEvent('tool-fixture', { detail: payload })),
		data
	);
}

test('persisted errors and finalization survive reload while teacher review keeps its detail', async ({
	page
}) => {
	await openChat(page, false);
	await emit(page, '[DONE]');
	await page.reload();
	const activity = page
		.getByTestId('agent-tool-activity')
		.filter({ hasText: 'Error histórico ficticio' });
	await expect(activity.getByText('history-failure: Error histórico ficticio')).toBeVisible();
	await expect(activity.getByText('Actividad finalizada.', { exact: true })).toBeVisible();
	await expect(activity.locator('details').first()).not.toHaveAttribute('open');
	await page.context().clearCookies();
	await page.goto('/login');
	await page.getByLabel(/correo electrónico/i).fill('teacher@example.invalid');
	await page.getByLabel('Contraseña', { exact: true }).fill('Sapin-e2e-2026!');
	await page.getByRole('button', { name: 'Iniciar sesión', exact: true }).click();
	await expect(page).not.toHaveURL(/\/login/);
	await page.goto('/agent-chat/agent/view/agent-chat');
	await expect(page.getByText('Historial de herramientas ficticio')).toBeVisible();
	await expect(page.getByTestId('agent-tool-activity')).toHaveCount(0);
	await expect(page.getByText('Ver detalle tecnico').first()).toBeVisible();
});

async function openChat(page: Page, lesson: boolean) {
	// Controllable SSE transport lets assertions run between individual events.
	// The actual chat components and their event handlers remain in use.
	await page.addInitScript(() => {
		const NativeEventSource = window.EventSource;
		class FixtureEventSource extends EventTarget {
			listener = (event: Event) => {
				const value = (event as CustomEvent).detail;
				this.dispatchEvent(
					value === 'disconnect'
						? new Event('error')
						: new MessageEvent('message', {
								data: value === '[DONE]' ? value : JSON.stringify(value)
							})
				);
			};
			constructor() {
				super();
				window.addEventListener('tool-fixture', this.listener);
			}
			close() {
				window.removeEventListener('tool-fixture', this.listener);
			}
		}
		window.EventSource = new Proxy(NativeEventSource, {
			construct(target, args) {
				return String(args[0]).includes('/ask?')
					? new FixtureEventSource()
					: Reflect.construct(target, args);
			}
		});
	});
	await page.goto('/login');
	await page.getByLabel(/correo electrónico/i).fill('student@example.invalid');
	await page.getByLabel('Contraseña', { exact: true }).fill('Sapin-e2e-2026!');
	await page.getByRole('button', { name: 'Iniciar sesión', exact: true }).click();
	await expect(page).not.toHaveURL(/\/login/);
	await page.goto(
		lesson ? '/course/course/run/new-lesson/tool-lesson' : '/agent-chat/agent/c/agent-chat'
	);
	await page
		.getByPlaceholder(lesson ? 'Escribe tu respuesta' : 'Escribe un mensaje...')
		.fill('Prueba ficticia');
	await page.getByRole('button', { name: 'Enviar mensaje' }).click();
}

const start = (id: string) => ({
	type: 'tool-call-start',
	toolCallId: id,
	toolName: 'search',
	toolDisplayName: 'Consultar materiales',
	args: { private: 'never show arguments' }
});
const finish = (id: string, status = 'completed') => ({
	type: 'tool-result',
	toolCallId: id,
	toolName: 'search',
	status,
	result: status === 'failed' ? { error: 'Material no disponible' } : {},
	durationMs: 12
});

for (const lesson of [false, true]) {
	test(`${lesson ? 'lesson' : 'agent'} groups activity, keeps details open and exposes errors`, async ({
		page
	}) => {
		await openChat(page, lesson);
		await emit(page, start('a'));
		const activity = page.getByTestId('agent-tool-activity').last();
		const details = activity.locator('details').first();
		await expect(activity.locator('summary').first()).toContainText(
			'Ejecutando: Consultar materiales'
		);
		await expect(details).not.toHaveAttribute('open');
		await activity.locator('summary').first().focus();
		await page.keyboard.press('Enter');
		await expect(details).toHaveAttribute('open', '');
		await emit(page, finish('a'));
		await emit(page, start('b'));
		await emit(page, start('b'));
		await emit(page, finish('b'));
		await expect(activity.locator('summary').first()).toHaveText(
			'Actividad del agente · 2 acciones'
		);
		await expect(details).toHaveAttribute('open', '');
		await expect(activity.locator('summary').nth(1)).toContainText('×2');
		await expect(activity).not.toContainText('never show arguments');
		await activity.locator('summary').first().click();
		await emit(page, start('c'));
		await emit(page, finish('c', 'failed'));
		await expect(activity.getByText('Consultar materiales: Material no disponible')).toBeVisible();
		await expect(details).not.toHaveAttribute('open');
		await page.setViewportSize({ width: 390, height: 844 });
		await page.emulateMedia({ colorScheme: 'dark', reducedMotion: 'reduce' });
		await expect(activity).toBeVisible();
		expect(
			await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)
		).toBe(true);
		await page.screenshot({
			path: `output/tool-activity-${lesson ? 'lesson' : 'chat'}-mobile.png`
		});
		const themeToggle = lesson
			? page.getByRole('button').filter({ has: page.locator('svg.text-indigo-600') })
			: page.getByRole('button', { name: 'Activar tema oscuro', exact: true });
		await themeToggle.click();
		await expect(page.locator('html')).toHaveClass(/dark/);
		await expect(activity).toBeVisible();
		await page.screenshot({ path: `output/tool-activity-${lesson ? 'lesson' : 'chat'}-dark.png` });
	});

	test(`${lesson ? 'lesson' : 'agent'} replaces tool activity with its interactive result and handles disconnection`, async ({
		page
	}) => {
		await openChat(page, lesson);
		await emit(page, start('quiz-tool'));
		const ui = {
			type: 'ui-component',
			toolCallId: 'quiz-tool',
			instanceId: 'fixture-quiz',
			componentKey: 'QuizCard',
			interactive: true,
			props: {
				title: 'Ejercicio único',
				questions: [{ question: 'Dos más dos', options: ['Cuatro', 'Cinco'], correctIndex: 0 }]
			}
		};
		await emit(page, ui);
		await emit(page, ui);
		await expect(page.getByText('Ejercicio único', { exact: true })).toHaveCount(1);
		await expect(page.getByRole('button', { name: 'A. Cuatro', exact: true })).toBeEnabled();
		await expect(page.getByText('Ejecutando: Consultar materiales…', { exact: true })).toHaveCount(
			0
		);
		await emit(page, start('pending'));
		await emit(page, 'disconnect');
		await expect(
			page.getByTestId('agent-tool-activity').last().locator('summary').first()
		).toHaveText('Actividad interrumpida');
		await expect(
			page.getByTestId('agent-tool-activity').last().locator('.motion-safe\\:animate-spin')
		).toHaveCount(0);
	});
}

for (const lesson of [false, true]) {
	for (const approved of [true, false]) {
		test(`${lesson ? 'lesson' : 'agent'} keeps ${approved ? 'approval' : 'rejection'} actionable`, async ({
			page
		}) => {
			await openChat(page, lesson);
			let decision: unknown;
			await page.route('**/confirm-tool', async (route) => {
				decision = route.request().postDataJSON();
				await route.fulfill({ json: { success: true, status: 'completed', result: { value: 5 } } });
			});
			await emit(page, start('confirm'));
			await emit(page, {
				...start('confirm'),
				type: 'tool-confirm-required',
				riskLevel: 'low',
				confirmationMessage: 'Confirmación ficticia'
			});
			await emit(page, '[DONE]');
			await expect(page.getByRole('dialog')).toBeVisible();
			await page
				.getByRole('button', { name: approved ? 'Autorizar' : 'Rechazar', exact: true })
				.click();
			await expect(page.getByRole('dialog')).not.toBeVisible();
			expect(decision).toEqual({ toolCallId: 'confirm', approved });
			if (approved) {
				await expect(
					page.getByTestId('agent-tool-activity').last().locator('summary').first()
				).toHaveText('Actividad del agente · 1 acción');
			} else {
				await expect(
					page
						.getByTestId('agent-tool-activity')
						.last()
						.getByText('Consultar materiales: Acción no autorizada')
				).toBeVisible();
			}
		});
	}
}

test('new events and opening details preserve the scroll position while reading earlier content', async ({
	page
}) => {
	await openChat(page, false);
	await emit(page, start('scroll'));
	await emit(page, {
		type: 'text-delta',
		text: Array.from({ length: 50 }, (_, index) => `Párrafo de prueba ${index}.`).join('\n\n')
	});
	const activity = page.getByTestId('agent-tool-activity').last();
	const scroller = activity.locator('xpath=ancestor::div[contains(@class,"overflow-y-auto")][1]');
	await scroller.evaluate((element) => {
		element.scrollTop = 0;
		element.dispatchEvent(new Event('scroll'));
	});
	await emit(page, finish('scroll'));
	expect(await scroller.evaluate((element) => element.scrollTop)).toBe(0);
	await activity.locator('summary').first().scrollIntoViewIfNeeded();
	const before = await scroller.evaluate((element) => element.scrollTop);
	await activity.locator('summary').first().click();
	expect(await scroller.evaluate((element) => element.scrollTop)).toBe(before);
});
