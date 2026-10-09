import { test, expect, type Page } from '@playwright/test';

async function openEditor(page: Page) {
	const errors: string[] = [];
	page.on('pageerror', (error) => errors.push(error.message));
	await page.goto('/login');
	await page.getByLabel(/correo electrónico/i).fill('teacher@example.invalid');
	await page.getByLabel('Contraseña', { exact: true }).fill('Sapin-e2e-2026!');
	await page.getByRole('button', { name: 'Iniciar sesión', exact: true }).click();
	await expect(page).not.toHaveURL(/\/login/);
	await page.goto('/course/course/admin/interactives/activity/chatedit');
	return errors;
}

test('prompt wizard preserves changed choices across steps and applies the generated instructions', async ({
	page
}) => {
	const errors = await openEditor(page);
	await page.getByRole('button', { name: 'Asistente de Instrucciones' }).click();
	const dialog = page.getByRole('dialog');
	await expect(dialog.getByRole('button', { name: 'Siguiente →' })).toBeDisabled();
	await dialog.getByRole('button', { name: /Aprendizaje por Indagación/ }).click();
	await dialog.getByRole('button', { name: /Gamificación/ }).click();
	await dialog.getByRole('button', { name: 'Siguiente →' }).click();
	await dialog.getByRole('button', { name: /Evaluación Adaptativa/ }).click();
	await dialog.getByRole('button', { name: /Descubrimiento Guiado/ }).click();
	await dialog.getByRole('button', { name: 'Siguiente →' }).click();
	await dialog
		.getByPlaceholder('Ej: Fracciones, La Revolución Francesa...')
		.fill('Fracciones de prueba');
	await dialog.getByRole('button', { name: /Avanzado/ }).click();
	await dialog.getByRole('button', { name: /Inmediato/ }).click();
	await dialog.getByRole('button', { name: /Sumativa/ }).click();
	await dialog.getByRole('button', { name: '← Anterior' }).click();
	await dialog.getByRole('button', { name: '← Anterior' }).click();
	await expect(dialog.getByRole('button', { name: /Gamificación/ })).toHaveClass(/border-red-500/);
	await dialog.getByRole('button', { name: 'Siguiente →' }).click();
	await dialog.getByRole('button', { name: 'Siguiente →' }).click();
	await expect(dialog.getByPlaceholder('Ej: Fracciones, La Revolución Francesa...')).toHaveValue(
		'Fracciones de prueba'
	);
	await dialog.getByRole('button', { name: '✨ Generar Instrucciones' }).click();
	await expect(dialog).toContainText('Fracciones de prueba');
	await expect(dialog).toContainText('Gamificación');
	await expect(dialog).toContainText('Descubrimiento Guiado');
	await expect(dialog).toContainText('Avanzado');
	await dialog.getByRole('button', { name: '✓ Aplicar Instrucciones' }).click();
	await expect(dialog).not.toBeVisible();
	await page.getByRole('button', { name: 'Asistente de Instrucciones' }).click();
	await expect(dialog.getByRole('button', { name: 'Siguiente →' })).toBeDisabled();
	await dialog.getByRole('button', { name: 'Cancelar', exact: true }).click();
	await page.getByRole('button', { name: /guardar/i }).click();
	await expect(page.getByText('Actividad actualizada correctamente')).toBeVisible();
	await page.reload();
	await expect(page.locator('[name="llmInstructions"]')).toHaveValue(/Fracciones de prueba/);
	await page.getByRole('button', { name: 'Asistente de Instrucciones' }).click();
	await expect(dialog.getByRole('button', { name: 'Siguiente →' })).toBeDisabled();
	await dialog.getByRole('button', { name: 'Cancelar', exact: true }).click();
	await expect(page.locator('[name="llmInstructions"]')).toHaveValue(/Fracciones de prueba/);
	expect(errors).toEqual([]);
});

test('role wizard keeps independent selections, removes deselected traits and resets after applying', async ({
	page
}) => {
	const errors = await openEditor(page);
	await page.getByRole('button', { name: 'Asistente de Roles' }).click();
	const dialog = page.getByRole('dialog');
	await dialog.getByRole('button', { name: /Guía Socrático/ }).click();
	await dialog.getByRole('button', { name: /Tutor Experto/ }).click();
	await dialog.getByRole('button', { name: 'Siguiente →' }).click();
	await dialog.getByPlaceholder('Ej: Profesor García, Mentora Ana...').fill('Mentora de prueba');
	for (const trait of ['Paciente', 'Entusiasta', 'Con humor']) {
		await dialog.getByRole('button', { name: new RegExp(trait) }).click();
	}
	await dialog.getByRole('button', { name: /Empático/ }).click();
	await expect(dialog.getByRole('button', { name: /Empático/ })).not.toHaveClass(
		/border-purple-500/
	);
	await dialog.getByRole('button', { name: /Con humor/ }).click();
	await dialog.getByRole('button', { name: /Empático/ }).click();
	await dialog.getByRole('button', { name: /Adultos \(26\+\)/ }).click();
	await dialog.getByRole('button', { name: /Profesional y formal/ }).click();
	await dialog.getByRole('button', { name: 'Dislexia', exact: true }).click();
	await dialog.getByRole('button', { name: 'TDAH', exact: true }).click();
	await dialog.getByRole('button', { name: 'Dislexia', exact: true }).click();
	await dialog.getByRole('button', { name: 'Siguiente →' }).click();
	await dialog.getByRole('button', { name: /Andamiaje/ }).click();
	await dialog.getByRole('button', { name: /Dominio Progresivo/ }).click();
	await dialog.getByRole('button', { name: '← Anterior' }).click();
	await expect(dialog.getByRole('button', { name: /Empático/ })).toHaveClass(/border-purple-500/);
	await expect(dialog.getByRole('button', { name: 'Dislexia', exact: true })).not.toHaveClass(
		/border-green-500/
	);
	await dialog.getByRole('button', { name: 'Siguiente →' }).click();
	await dialog.getByRole('button', { name: '✨ Generar Rol' }).click();
	await expect(dialog).toContainText('Paciente, Entusiasta, Empático');
	await expect(dialog).not.toContainText('Con humor');
	await expect(dialog).toContainText('dominio progresivo');
	await expect(dialog).toContainText('TDAH');
	await expect(dialog).not.toContainText('Dislexia');
	await dialog.getByRole('button', { name: '✓ Aplicar Rol' }).click();
	await expect(dialog).not.toBeVisible();
	await page.getByRole('button', { name: 'Asistente de Roles' }).click();
	await expect(dialog.getByRole('button', { name: 'Siguiente →' })).toBeDisabled();
	await dialog.getByRole('button', { name: 'Cancelar', exact: true }).click();
	await page.getByRole('button', { name: /guardar/i }).click();
	await expect(page.getByText('Actividad actualizada correctamente')).toBeVisible();
	await page.reload();
	await expect(page.locator('[name="llmRole"]')).toHaveValue(/Mentora de prueba/);
	await page.getByRole('button', { name: 'Asistente de Roles' }).click();
	await expect(dialog.getByRole('button', { name: 'Siguiente →' })).toBeDisabled();
	await dialog.getByRole('button', { name: 'Cancelar', exact: true }).click();
	expect(errors).toEqual([]);
});
