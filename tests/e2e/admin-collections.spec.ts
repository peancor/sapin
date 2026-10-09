import { test, expect } from '@playwright/test';

test('admin course cards retain repeated teacher assignments after filtering and reload', async ({
	page
}) => {
	const errors: string[] = [];
	page.on('pageerror', (error) => errors.push(error.message));
	await page.goto('/login');
	await page.getByLabel(/correo electrónico/i).fill('admin@example.invalid');
	await page.getByLabel('Contraseña', { exact: true }).fill('Sapin-e2e-2026!');
	await page.getByRole('button', { name: 'Iniciar sesión', exact: true }).click();
	await expect(page).not.toHaveURL(/\/login/);
	await page.goto('/admin/courses');
	await expect(page.getByRole('heading', { name: 'Gestión de cursos', exact: true })).toBeVisible();
	const course = page.locator('article').filter({
		has: page.locator('h2 a[href="/admin/courses/course"]')
	});
	await expect(course).toBeVisible();
	// The seed assigns the same teacher twice. Both assignments must survive hydration.
	await expect(course.getByText('Sin nombre', { exact: true })).toHaveCount(2);
	const search = page.getByRole('searchbox', { name: 'Buscar cursos', exact: true });
	await search.fill('ningun-curso-con-este-nombre');
	await expect(page.getByText('No se encontraron resultados', { exact: true })).toBeVisible();
	await page.getByRole('button', { name: 'Limpiar búsqueda', exact: true }).click();
	await expect(course).toBeVisible();
	await page.reload();
	await expect(course).toBeVisible();
	await expect(course.getByText('Sin nombre', { exact: true })).toHaveCount(2);
	expect(errors).toEqual([]);
});
