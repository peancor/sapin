import { test, expect, type Page } from '@playwright/test';

interface UIEvent {
	instanceId: string;
	componentKey: string;
	props: Record<string, unknown>;
}

async function openComponents(page: Page, components: UIEvent[]) {
	const responses: unknown[] = [];
	const errors: string[] = [];
	page.on('pageerror', (error) => errors.push(error.message));
	// Exercise the real chat renderer with deterministic UI events, without invoking a model.
	await page.route('**/api/agent-chat/**/ask?*', async (route) => {
		const resumed = new URL(route.request().url()).searchParams.has('resume');
		const events = resumed
			? []
			: components.map((component) => ({
					type: 'ui-component',
					interactive: true,
					...component
				}));
		await route.fulfill({
			contentType: 'text/event-stream',
			body:
				events.map((event) => `data: ${JSON.stringify(event)}\n\n`).join('') + 'data: [DONE]\n\n'
		});
	});
	// Only the outbound response contract is tested here, not server persistence.
	await page.route('**/ui-response', async (route) => {
		responses.push(route.request().postDataJSON());
		await route.fulfill({ json: { success: true } });
	});
	await page.goto('/login');
	await page.getByLabel(/correo electrónico/i).fill('student@example.invalid');
	await page.getByLabel('Contraseña', { exact: true }).fill('Sapin-e2e-2026!');
	await page.getByRole('button', { name: 'Iniciar sesión', exact: true }).click();
	await expect(page).not.toHaveURL(/\/login/);
	await page.goto('/agent-chat/agent/c/agent-chat');
	await page.getByPlaceholder('Escribe un mensaje...').fill('Muestra los ejercicios de prueba');
	await page.getByRole('button', { name: 'Enviar mensaje' }).click();
	return { responses, errors };
}

const questions = [
	{ question: 'Pregunta repetida', options: ['Igual', 'Igual'], correctIndex: 1 },
	{ question: 'Pregunta repetida', options: ['Igual', 'Igual'], correctIndex: 0 }
];

test('quiz HTML keeps formatting and formulas while blocking executable content', async ({
	page
}) => {
	const attack = `<img src="/missing-test-image" onerror="document.body.dataset.xss='executed'"><a href="javascript:document.body.dataset.xss='executed'">unsafe-link</a>`;
	const { errors } = await openComponents(page, [
		{
			instanceId: 'safe-quiz',
			componentKey: 'QuizCard',
			props: {
				title: 'HTML de prueba',
				questions: [
					{
						question: `**Formato conservado** $x^2$ ${attack}`,
						options: ['Respuesta', 'Otra'],
						correctIndex: 0,
						explanation: `**Explicación conservada** ${attack}`
					}
				]
			}
		}
	]);
	const quiz = page
		.locator('div.my-2')
		.filter({ has: page.getByText('HTML de prueba', { exact: true }) });
	await expect(quiz.locator('strong').filter({ hasText: 'Formato conservado' })).toBeVisible();
	await expect(quiz.locator('.katex')).toHaveCount(1);
	await expect(quiz.locator('[onerror], a[href^="javascript:"]')).toHaveCount(0);
	await quiz.getByRole('button', { name: 'A. Respuesta', exact: true }).click();
	await quiz.getByRole('button', { name: 'Enviar respuestas' }).click();
	await expect(quiz.locator('strong').filter({ hasText: 'Explicación conservada' })).toBeVisible();
	await expect(quiz.locator('[onerror], a[href^="javascript:"]')).toHaveCount(0);
	await expect(page.locator('body')).not.toHaveAttribute('data-xss', 'executed');
	expect(errors).toEqual([]);
});

test('quizzes distinguish repeated text and keep separate answers for each instance', async ({
	page
}) => {
	const { responses, errors } = await openComponents(
		page,
		['Uno', 'Dos'].map((title) => ({
			instanceId: `quiz-${title}`,
			componentKey: 'QuizCard',
			props: { title, questions }
		}))
	);
	const first = page.locator('div.my-2').filter({ has: page.getByText('Uno', { exact: true }) });
	const second = page.locator('div.my-2').filter({ has: page.getByText('Dos', { exact: true }) });
	await first.getByRole('button', { name: 'B. Igual', exact: true }).nth(0).click();
	await first.getByRole('button', { name: 'A. Igual', exact: true }).nth(1).click();
	await expect(second.getByRole('button', { name: 'Enviar respuestas' })).toBeDisabled();
	await first.getByRole('button', { name: 'Enviar respuestas' }).click();
	await expect.poll(() => responses.length).toBe(1);
	expect(responses[0]).toMatchObject({
		instanceId: 'quiz-Uno',
		payload: { answers: [1, 0], score: 1 }
	});
	await expect(second.getByRole('button', { name: 'A. Igual', exact: true }).nth(0)).toBeEnabled();
	await second.getByRole('button', { name: 'A. Igual', exact: true }).nth(0).click();
	await second.getByRole('button', { name: 'B. Igual', exact: true }).nth(1).click();
	await second.getByRole('button', { name: 'Enviar respuestas' }).click();
	await expect.poll(() => responses.length).toBe(2);
	expect(responses[1]).toMatchObject({
		instanceId: 'quiz-Dos',
		payload: { answers: [0, 1], score: 0 }
	});
	expect(errors).toEqual([]);
});

for (const componentKey of ['TimedQuizCard', 'ImmersiveTimedQuiz']) {
	test(`${componentKey} creates new options when advancing and retains positional results`, async ({
		page
	}) => {
		const { responses, errors } = await openComponents(page, [
			{
				instanceId: 'timed',
				componentKey,
				props: {
					title: 'Quiz con tiempo',
					questions,
					timerByDifficultySec: { medium: 300 },
					autoAdvanceDelayMs: 150
				}
			}
		]);
		if (componentKey === 'ImmersiveTimedQuiz') {
			await page.getByRole('button', { name: /Abrir quiz$/ }).click();
			await page.getByRole('button', { name: 'Empezar partida', exact: true }).click();
		}
		const firstOption = await page
			.getByRole('button', { name: 'A. Igual', exact: true })
			.elementHandle();
		if (!firstOption) throw new Error('The first question did not render.');
		await page.getByRole('button', { name: 'B. Igual', exact: true }).click();
		await expect(page.getByText('2/2', { exact: true })).toBeVisible();
		await expect(page.getByRole('button', { name: 'A. Igual', exact: true })).toBeEnabled();
		expect(await firstOption.evaluate((node) => node.isConnected)).toBe(false);
		await page.getByRole('button', { name: 'A. Igual', exact: true }).click();
		await expect(page.getByText('Resultado final', { exact: true })).toBeVisible();
		await expect.poll(() => responses.length).toBe(1);
		expect(responses[0]).toMatchObject({
			instanceId: 'timed',
			payload: { answers: [1, 0], score: 1, correctCount: 2, timeoutCount: 0 }
		});
		expect(errors).toEqual([]);
	});
}

test('identical flashcards retain navigation positions and reset the flipped side', async ({
	page
}) => {
	const { responses, errors } = await openComponents(page, [
		{
			instanceId: 'deck',
			componentKey: 'FlashcardDeck',
			props: {
				title: 'Tarjetas repetidas',
				cards: [
					{ front: 'Anverso', back: 'Reverso' },
					{ front: 'Anverso', back: 'Reverso' }
				]
			}
		}
	]);
	await page.getByRole('button', { name: /^Pregunta.*Anverso/ }).click();
	await expect(page.getByRole('button', { name: /^Respuesta.*Reverso/ })).toBeVisible();
	await page.getByRole('button', { name: 'Siguiente →', exact: true }).click();
	await expect(page.getByText('2 / 2', { exact: true })).toBeVisible();
	await expect(page.getByRole('button', { name: /^Pregunta.*Anverso/ })).toBeVisible();
	await page.getByRole('button', { name: '← Anterior', exact: true }).click();
	await expect(page.getByText('1 / 2', { exact: true })).toBeVisible();
	await page.getByRole('button', { name: 'Siguiente →', exact: true }).click();
	await page.getByRole('button', { name: 'Completar', exact: true }).click();
	await expect(page.getByText('¡Mazo completado!', { exact: true })).toBeVisible();
	expect(responses).toEqual([
		{
			instanceId: 'deck',
			componentKey: 'FlashcardDeck',
			payload: { cardsReviewed: 2, completed: true }
		}
	]);
	expect(errors).toEqual([]);
});
