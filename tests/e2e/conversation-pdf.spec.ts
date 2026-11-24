import { expect, test, type Page } from '@playwright/test';
import { PDFParse } from 'pdf-parse';
import { readFile } from 'node:fs/promises';

async function login(page: Page, name: string) {
	await page.goto('/login');
	await page.getByLabel(/correo electrónico/i).fill(name + '@example.invalid');
	await page.getByLabel('Contraseña', { exact: true }).fill('Sapin-e2e-2026!');
	await page.getByRole('button', { name: 'Iniciar sesión', exact: true }).click();
	await expect(page).not.toHaveURL(/\/login/);
}

async function downloadConversation(page: Page, path: string) {
	const downloading = page.waitForEvent('download');
	await page.getByRole('link', { name: 'Exportar conversación en PDF' }).click();
	const download = await downloading;
	expect(download.suggestedFilename()).toBe('Repaso de álgebra.pdf');
	await download.saveAs(path);
	return new PDFParse({ data: new Uint8Array(await readFile(path)) });
}

test.beforeEach(async ({ page }) => {
	await page.route('https://old-campus.example.invalid/**', (route) => route.abort());
});

for (const type of ['chat', 'agent']) {
	test('Descarga y repaso de un intento finalizado de ' + type, async ({ page }, info) => {
		await login(page, 'pdf-student');
		const prefix = type === 'chat' ? 'interactive-chat' : 'agent-chat';
		const id = 'pdf-' + type;
		await page.goto('/' + prefix + '/' + id + '/c/' + id);
		await page.getByRole('link', { name: 'Repasar conversación' }).click();
		const transcript = page.locator('[data-conversation-transcript]');
		await expect(transcript).toBeVisible();
		if (type === 'agent') {
			await expect(transcript.getByText('Curva cuadrática')).toBeVisible();
			await expect(transcript.getByText('Dos por dos son cuatro.')).toBeVisible();
		} else await expect(transcript.locator('.katex').first()).toBeVisible();
		const parser = await downloadConversation(page, info.outputPath(type + '.pdf'));
		try {
			const pdf = await parser.getText();
			expect(pdf.text).toContain(
				type === 'chat' ? 'Último turno conservado' : 'Dos por dos son cuatro.'
			);
			expect(pdf.text).not.toMatch(
				/\[\[DONE\]\]|Solución privada pendiente|Instrucción interna reservada|Exportar conversación/
			);
			expect(pdf.total).toBeGreaterThan(1);
			if (type === 'chat') {
				const { pages } = await parser.getImage({ imageDataUrl: false, imageBuffer: false });
				expect(pages.flatMap((page) => page.images)).toContainEqual(
					expect.objectContaining({ width: 128, height: 128 })
				);
			}
			if (type === 'agent')
				for (const title of [
					'Curva cuadrática',
					'Triángulo',
					'Tarjetas de repaso',
					'Coordinación',
					'Imagen compartida',
					'Memoria de trabajo'
				])
					expect(pdf.text).toContain(title);
		} finally {
			await parser.destroy();
		}
	});
}
for (const [entry, url, content] of [
	[
		'chat interactivo',
		'/interactive-chat/pdf-chat/c/pdf-chat-open',
		'Mi primera pregunta de álgebra.'
	],
	[
		'chat desde el curso',
		'/course/pdf-course/run/chat/pdf-chat-open',
		'Mi primera pregunta de álgebra.'
	],
	['chat de agente', '/agent-chat/pdf-agent/c/pdf-agent-open', 'Cuestionario en curso']
] as const) {
	test('El alumno descarga su intento en curso desde ' + entry, async ({ page }, info) => {
		await login(page, 'pdf-student');
		await page.goto(url);
		await expect(page.getByRole('link', { name: 'Repasar conversación' })).toHaveCount(0);
		const composer = page.getByRole('textbox', { name: 'Mensaje', exact: true });
		const draft = 'Este borrador aún no se ha enviado.';
		await composer.fill(draft);
		const parser = await downloadConversation(page, info.outputPath('en-curso.pdf'));
		try {
			const pdf = await parser.getText();
			expect(pdf.text).toContain(content);
			expect(pdf.text).not.toContain(draft);
			if (entry === 'chat de agente') {
				expect(pdf.text).toContain('Sin respuesta guardada.');
				expect(pdf.text).not.toMatch(/Solución privada pendiente|Respuesta correcta/i);
			}
		} finally {
			await parser.destroy();
		}
		await expect(page).toHaveURL(url);
		await expect(composer).toHaveValue(draft);
	});
}
test('La revisión docente enlaza a la misma lectura y protege los intentos', async ({
	page,
	request
}) => {
	const base = '/api/conversation/';
	expect((await request.get(base + 'pdf-chat/pdf-chat/pdf')).status()).toBe(401);
	await login(page, 'pdf-student');
	expect((await page.request.get(base + 'pdf-agent/pdf-chat/pdf')).status()).toBe(404);
	await page.context().clearCookies();
	await login(page, 'student2');
	for (const id of ['pdf-chat', 'pdf-agent']) {
		expect((await page.request.get(base + id + '/' + id + '-open/pdf')).status()).toBe(403);
		expect((await page.request.get('/conversation/' + id + '/' + id + '-open')).status()).toBe(403);
	}
	expect((await page.request.get(base + 'pdf-chat/pdf-chat/pdf')).status()).toBe(403);
	await page.context().clearCookies();
	await login(page, 'pdf-teacher');
	for (const [kind, id] of [
		['interactive-chat', 'pdf-chat'],
		['agent-chat', 'pdf-agent']
	]) {
		await page.goto('/' + kind + '/' + id + '/view/' + id);
		await expect(page.getByRole('link', { name: 'Exportar conversación en PDF' })).toBeVisible();
		await page.getByRole('link', { name: 'Repasar conversación' }).click();
		await expect(page.locator('[data-conversation-transcript]')).toBeVisible();
		const copy = await page.request.get(base + id + '/' + id + '/pdf');
		expect(copy.status()).toBe(200);
		expect(copy.headers()['content-type']).toBe('application/pdf');
	}
});
