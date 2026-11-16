import { test, expect } from '@playwright/test';

test('Moodle import distinguishes defaults from help and preserves the review step', async ({
	page
}) => {
	const previews: unknown[] = [];
	let confirmations = 0;
	await page.route('**/students/import/moodle/preview', async (route) => {
		previews.push(route.request().postDataJSON());
		await route.fulfill({
			json: {
				rows: [],
				summary: {
					total: 0,
					createAndEnroll: 0,
					enrollOnly: 0,
					linkAndEnroll: 0,
					linkOnly: 0,
					alreadyEnrolled: 0,
					conflicts: 0,
					invalid: 0
				}
			}
		});
	});
	await page.route('**/students/import/moodle/confirm', async (route) => {
		confirmations++;
		await route.fulfill({ status: 400, json: { error: 'Unexpected confirmation' } });
	});
	await page.goto('/login');
	await page.getByLabel(/correo electrónico/i).fill('admin@example.invalid');
	await page.getByLabel('Contraseña', { exact: true }).fill('Sapin-e2e-2026!');
	await page.getByRole('button', { name: 'Iniciar sesión', exact: true }).click();
	await expect(page).not.toHaveURL(/\/login/);
	await page.goto('/course/moodle-import-course/admin/students');
	await page.getByRole('button', { name: 'Acciones', exact: true }).click();
	await page.getByText('Importar desde Moodle', { exact: true }).click();
	const url = page.getByLabel('URL del servicio REST de Moodle', { exact: true });
	const token = page.getByLabel('Token del servicio web de Moodle', { exact: true });
	const course = page.getByLabel('ID del curso en Moodle', { exact: true });
	await expect(url).toHaveValue('https://moodle.unican.es/webservice/rest/server.php');
	await expect(token).toHaveValue('');
	await expect(course).toHaveValue('');
	await expect(page.getByText('course/view.php?id=42', { exact: true })).toBeVisible();
	await page.getByRole('button', { name: 'Revisar estudiantes', exact: true }).click();
	await expect(
		page.getByText('Completa la URL de Moodle, el token y el ID del curso para continuar')
	).toBeVisible();
	expect(previews).toHaveLength(0);
	await token.fill('fictitious-token');
	await course.fill('42');
	// Con datos escritos, Esc y un clic fuera no cierran el asistente
	const wizard = page.getByRole('dialog', { name: 'Asistente de Importación desde Moodle' });
	await page.keyboard.press('Escape');
	await expect(wizard).toBeVisible();
	await expect(wizard.getByText(/perderás los datos de conexión/)).toBeVisible();
	await wizard.getByRole('button', { name: 'Seguir editando', exact: true }).click();
	await page.mouse.click(5, 5);
	await expect(wizard).toBeVisible();
	await expect(token).toHaveValue('fictitious-token');
	await page.getByRole('button', { name: 'Revisar estudiantes', exact: true }).click();
	await expect(
		page.getByText('Paso 2 de 2 · Revisa el resultado y confirma la importación.')
	).toBeVisible();
	expect(previews).toEqual([
		{
			baseUrl: 'https://moodle.unican.es/webservice/rest/server.php',
			token: 'fictitious-token',
			moodleCourseId: '42'
		}
	]);
	await expect(
		page.getByLabel('Token del servicio web de Moodle para confirmar la importación')
	).toHaveValue('');
	await expect(
		page.getByRole('button', { name: 'Confirmar importación', exact: true })
	).toBeDisabled();
	await page.getByRole('button', { name: 'Volver', exact: true }).click();
	await url.fill('https://moodle.example.invalid');
	await expect(url).toHaveValue('https://moodle.example.invalid');
	await page.getByRole('button', { name: 'Cancelar', exact: true }).click();
	// Cancelar con cambios pide confirmación antes de descartarlos
	await expect(wizard).toBeVisible();
	await wizard.getByRole('button', { name: 'Descartar y cerrar', exact: true }).click();
	await expect(wizard).toBeHidden();
	await page.setViewportSize({ width: 390, height: 844 });
	await page.getByRole('button', { name: 'Acciones', exact: true }).click();
	await page.getByText('Importar desde Moodle', { exact: true }).click();
	await expect(url).toHaveValue('https://moodle.unican.es/webservice/rest/server.php');
	await expect(token).toHaveValue('');
	await expect(course).toHaveValue('');
	await expect(
		page.getByRole('button', { name: 'Revisar estudiantes', exact: true })
	).toBeVisible();
	expect(confirmations).toBe(0);
});
