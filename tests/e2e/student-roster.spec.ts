import { test, expect } from '@playwright/test';

test('student roster counts and exports people and unenrolls all their student assignments', async ({
	page
}) => {
	const errors: string[] = [];
	page.on('pageerror', (error) => errors.push(error.message));
	await page.goto('/login');
	await page.getByLabel(/correo electrónico/i).fill('admin@example.invalid');
	await page.getByLabel('Contraseña', { exact: true }).fill('Sapin-e2e-2026!');
	await page.getByRole('button', { name: 'Iniciar sesión', exact: true }).click();
	await expect(page).not.toHaveURL(/\/login/);

	// The role management screen must still expose each separate assignment.
	await page.goto('/admin/courses/roster/students');
	await expect(page.getByRole('row').filter({ hasText: 'admin@example.invalid' })).toHaveCount(2);
	await expect(page.getByRole('row').filter({ hasText: 'student2@example.invalid' })).toHaveCount(
		2
	);
	await page.goto('/course/roster/admin/students');
	const rows = page.locator('tbody tr');
	await expect(rows).toHaveCount(2);
	await expect(
		page.locator('aside').getByText('Estudiantes', { exact: true }).last().locator('../..')
	).toHaveText(/Estudiantes\s*2/);
	await expect(page.getByText('Total Estudiantes', { exact: true }).locator('..')).toHaveText(
		/Total Estudiantes\s*2/
	);
	await page.reload();
	await expect(rows).toHaveCount(2);
	await page.locator('thead input[type="checkbox"]').check();
	await expect(page.getByText('2 estudiantes seleccionados', { exact: true })).toBeVisible();
	const downloadPromise = page.waitForEvent('download');
	await page.getByRole('button', { name: 'Exportar', exact: true }).click();
	const download = await downloadPromise;
	const stream = await download.createReadStream();
	const chunks: Buffer[] = [];
	for await (const chunk of stream!) chunks.push(Buffer.from(chunk));
	const csv = Buffer.concat(chunks).toString('utf8');
	expect(csv.trim().split('\n')).toHaveLength(3);
	expect(csv.match(/admin@example.invalid/g)).toHaveLength(1);
	expect(csv.match(/student2@example.invalid/g)).toHaveLength(1);
	await page.getByRole('button', { name: 'Cancelar', exact: true }).click();

	const mixedRoleRow = rows.filter({
		has: page.locator('a[href="/course/roster/admin/students/admin"]')
	});
	await mixedRoleRow.getByRole('button').click();
	await page.getByRole('button', { name: 'Sí, estoy seguro', exact: true }).click();
	await expect(rows).toHaveCount(1);
	await page.reload();
	await expect(rows).toHaveCount(1);
	await page.locator('thead input[type="checkbox"]').check();
	await expect(page.getByText('1 estudiantes seleccionados', { exact: true })).toBeVisible();
	await page.getByRole('button', { name: 'Dar de baja', exact: true }).click();
	await page.getByRole('button', { name: 'Sí, estoy seguro', exact: true }).click();
	await expect(rows).toHaveCount(0);
	await page.reload();
	await expect(rows).toHaveCount(0);
	await expect(page.getByText('Total Estudiantes', { exact: true }).locator('..')).toHaveText(
		/Total Estudiantes\s*0/
	);
	await page.goto('/admin/courses/roster/students');
	await expect(page.getByRole('row').filter({ hasText: 'admin@example.invalid' })).toHaveCount(0);
	await expect(page.getByRole('row').filter({ hasText: 'student2@example.invalid' })).toHaveCount(
		0
	);
	await page.goto('/admin/courses/roster/teachers');
	await expect(page.getByRole('row').filter({ hasText: 'admin@example.invalid' })).toHaveCount(1);
	await page.goto('/course/course/admin/students');
	await expect(page.locator('tbody tr')).toHaveCount(3);
	expect(errors).toEqual([]);
});
