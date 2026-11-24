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
		const downloading = page.waitForEvent('download');
		await page.getByRole('link', { name: 'Exportar conversación en PDF' }).click();
		const download = await downloading;
		expect(download.suggestedFilename()).toBe('Repaso de álgebra.pdf');
		const path = info.outputPath(type + '.pdf');
		await download.saveAs(path);
		const parser = new PDFParse({ data: new Uint8Array(await readFile(path)) });
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
test('La revisión docente enlaza a la misma lectura y protege los intentos', async ({
	page,
	request
}) => {
	const base = '/api/conversation/';
	expect((await request.get(base + 'pdf-chat/pdf-chat/pdf')).status()).toBe(401);
	await login(page, 'pdf-student');
	expect((await page.request.get(base + 'pdf-agent/pdf-agent-open/pdf')).status()).toBe(403);
	expect((await page.request.get(base + 'pdf-agent/pdf-chat/pdf')).status()).toBe(404);
	await page.context().clearCookies();
	await login(page, 'student2');
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
