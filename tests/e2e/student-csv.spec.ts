import { test, expect, type Download } from '@playwright/test';
import { parse } from 'csv-parse/sync';

async function readDownload(download: Download) {
	const stream = await download.createReadStream();
	const chunks: Buffer[] = [];
	for await (const chunk of stream!) chunks.push(Buffer.from(chunk));
	return Buffer.concat(chunks);
}

test('student CSV template, both exports and real import preserve identities and reject conflicts', async ({
	page,
	request
}) => {
	const endpoint = '/api/courses/csv-source/students/import';
	const upload = (buffer: Buffer, target = endpoint) =>
		page.request.post(target, {
			headers: { origin: 'http://127.0.0.1:4187' },
			multipart: { file: { name: 'students.csv', mimeType: 'text/csv', buffer } }
		});
	const anonymous = await request.post(endpoint);
	expect(anonymous.status()).toBe(401);
	await page.goto('/login');
	await page.getByLabel(/correo electrónico/i).fill('admin@example.invalid');
	await page.getByLabel('Contraseña', { exact: true }).fill('Sapin-e2e-2026!');
	await page.getByRole('button', { name: 'Iniciar sesión', exact: true }).click();
	await expect(page).not.toHaveURL(/\/login/);
	await page.goto('/course/csv-source/admin/students');
	await page.getByRole('button', { name: 'Acciones', exact: true }).click();
	await page.getByText('Importar desde CSV', { exact: true }).click();
	const templateDownload = page.waitForEvent('download');
	await page.getByRole('link', { name: 'Descargar plantilla de ejemplo' }).click();
	const template = await readDownload(await templateDownload);
	expect(parse(template, { bom: true, delimiter: ';', columns: true })).toHaveLength(2);
	// Exercise the actual file input and backend, without SSE or endpoint mocks.
	await page
		.locator('input[type="file"]')
		.setInputFiles({ name: 'students.csv', mimeType: 'text/csv', buffer: template });
	const imported = page.waitForResponse(
		(response) => response.url().endsWith(endpoint) && response.request().method() === 'POST'
	);
	await page.getByRole('button', { name: 'Importar', exact: true }).click();
	expect((await (await imported).json()).successCount).toBe(2);
	// Legacy comma CSV, quotes, semicolon, accented characters, and a multiline name.
	const legacy = Buffer.from(
		'id,email,firstname,lastname,fullname\n00042,csv-special@example.invalid,Ana,Pérez,"Pérez, Ana; ""A""\nSegundo nombre"'
	);
	expect((await (await upload(legacy)).json()).successCount).toBe(1);
	// Existing local account without external ID can be exported and reimported too.
	expect(
		(await (await upload(Buffer.from('externalId;email;fullname\n;admin@example.invalid;'))).json())
			.successCount
	).toBe(1);
	let exported: Buffer | undefined;
	for (const path of ['/course/csv-source/admin/students', '/admin/courses/csv-source/students']) {
		await page.goto(path);
		await page.getByRole('button', { name: 'Acciones', exact: true }).click();
		const pending = page.waitForEvent('download');
		await page.getByText('Exportar como CSV', { exact: true }).click();
		const buffer = await readDownload(await pending);
		const records = parse(buffer, { bom: true, delimiter: ';', columns: true }) as Array<{
			externalId: string;
			fullname: string;
		}>;
		expect(records).toHaveLength(4);
		expect(records.find((row) => row.externalId === '00042')?.fullname).toBe(
			'Pérez, Ana; "A"\nSegundo nombre'
		);
		if (exported) expect(buffer.equals(exported)).toBe(true);
		exported = buffer;
		await page.getByRole('button', { name: 'Acciones', exact: true }).click();
		await page.getByText('Importar desde CSV', { exact: true }).click();
		await expect(page.getByRole('link', { name: 'Descargar plantilla de ejemplo' })).toBeVisible();
	}
	const target = '/api/courses/csv-target/students/import';
	for (let repeat = 0; repeat < 2; repeat++) {
		const response = await upload(exported!, target);
		expect(response.status()).toBe(200);
		expect((await response.json()).successCount).toBe(4);
	}
	await page.goto('/course/csv-target/admin/students');
	await expect(page.locator('tbody tr')).toHaveCount(4);
	for (const row of [
		'prueba-001;other@example.invalid;Otro',
		'new-id;ana@example.invalid;Otro',
		'new-id;admin@example.invalid;Otro'
	]) {
		const result = await (await upload(Buffer.from(`externalId;email;fullname\n${row}`))).json();
		expect(result.successCount).toBe(0);
		expect(result.results[0].message).toContain('Conflicto');
	}
	const malformed = await upload(Buffer.from('externalId;email;fullname\nx;bad'));
	expect(malformed.status()).toBe(400);
	expect((await upload(template, '/api/courses/nonexistent/students/import')).status()).toBe(404);
	// A student session has no management permission on this course.
	await page.context().clearCookies();
	await page.goto('/login');
	await page.getByLabel(/correo electrónico/i).fill('student@example.invalid');
	await page.getByLabel('Contraseña', { exact: true }).fill('Sapin-e2e-2026!');
	await page.getByRole('button', { name: 'Iniciar sesión', exact: true }).click();
	await expect(page).not.toHaveURL(/\/login/);
	expect((await upload(template)).status()).toBe(403);
});
