import { test, expect, type Page } from '@playwright/test';

const PASSWORD = 'Sapin-e2e-2026!';

async function login(page: Page, user: string) {
	await page.goto('/login');
	await page.getByLabel(/correo electrónico/i).fill(`${user}@example.invalid`);
	await page.getByLabel('Contraseña', { exact: true }).fill(PASSWORD);
	await page.getByRole('button', { name: 'Iniciar sesión', exact: true }).click();
	await expect(page).not.toHaveURL(/\/login/);
}

function addUserForm(baseURL: string | undefined) {
	return {
		headers: { origin: baseURL ?? 'http://127.0.0.1:4187' },
		form: {
			email: 'intruso@example.invalid',
			username: 'intruso',
			password: 'Intruso-2026!',
			roleId: 'admin'
		},
		maxRedirects: 0
	};
}

test('admin user actions reject anonymous and non-admin requests', async ({ page, baseURL }) => {
	const anonymous = await page.request.post('/admin/users?/addUser', addUserForm(baseURL));
	expect(anonymous.status()).toBe(401);

	await login(page, 'teacher');
	const teacher = await page.request.post('/admin/users?/addUser', addUserForm(baseURL));
	expect(teacher.status()).toBe(403);
	const deletion = await page.request.post('/admin/users?/deleteUser', {
		headers: { origin: baseURL ?? 'http://127.0.0.1:4187' },
		form: { userId: 'student' },
		maxRedirects: 0
	});
	expect(deletion.status()).toBe(403);
});

test('course administration actions reject anonymous users and students', async ({
	page,
	baseURL
}) => {
	const request = {
		headers: { origin: baseURL ?? 'http://127.0.0.1:4187' },
		form: { id: 'ninguna' },
		maxRedirects: 0
	};
	const anonymous = await page.request.post('/course/course/admin?/deleteInteractive', request);
	expect(anonymous.status()).toBe(401);

	await login(page, 'student');
	const student = await page.request.post('/course/course/admin?/deleteInteractive', request);
	expect(student.status()).toBe(403);
});

test('admin creates a user without autofill leaks or accidental closing', async ({ page }) => {
	const errors: string[] = [];
	page.on('pageerror', (error) => errors.push(error.message));
	await login(page, 'admin');
	await page.goto('/admin/users');
	await page.getByRole('button', { name: 'Nuevo Usuario' }).click();

	const dialog = page.getByRole('dialog', { name: 'Añadir nuevo usuario' });
	await expect(dialog).toBeVisible();
	const email = dialog.getByLabel(/correo electrónico/i);
	const username = dialog.getByLabel(/nombre de usuario/i);
	const password = dialog.getByLabel(/contraseña inicial/i);

	// Los campos describen la cuenta de otra persona, no las credenciales del administrador
	await expect(email).toHaveAttribute('autocomplete', 'off');
	await expect(username).toHaveAttribute('autocomplete', 'off');
	await expect(password).toHaveAttribute('autocomplete', 'new-password');
	await expect(page.getByRole('searchbox', { name: 'Buscar' })).toHaveAttribute(
		'autocomplete',
		'off'
	);

	// El rol de menor nivel queda preseleccionado y el admin no puede asignar "admin"
	await expect(dialog.getByRole('radio', { name: /student/ })).toBeChecked();
	await expect(dialog.getByRole('radio', { name: /^admin/ })).toHaveCount(0);

	await email.fill('nueva.persona@example.invalid');
	// Esc (p. ej. para cerrar el desplegable de autocompletado) no descarta los datos
	await page.keyboard.press('Escape');
	await expect(dialog).toBeVisible();
	await expect(dialog.getByText('Hay datos sin guardar')).toBeVisible();
	await dialog.getByRole('button', { name: 'Seguir editando' }).click();
	await expect(email).toHaveValue('nueva.persona@example.invalid');

	await username.fill('nueva.persona');
	await password.fill('corta');
	await dialog.getByRole('radio', { name: /teacher/ }).check();
	await dialog.getByRole('button', { name: 'Crear usuario' }).click();
	// Validación nativa: la contraseña corta bloquea el envío sin cerrar el modal
	await expect(dialog).toBeVisible();

	await password.fill('Nueva-persona-2026!');
	await dialog.getByRole('button', { name: 'Crear usuario' }).click();
	await expect(dialog).toBeHidden();
	await expect(page.getByRole('region', { name: 'Notificaciones' })).toContainText(
		'nueva.persona@example.invalid'
	);
	const row = page.getByRole('row').filter({ hasText: 'nueva.persona@example.invalid' });
	await expect(row).toBeVisible();
	await expect(row.getByText('teacher', { exact: true })).toBeVisible();

	// Un email duplicado muestra el error en el propio formulario y conserva lo escrito
	await page.getByRole('button', { name: 'Nuevo Usuario' }).click();
	await email.fill('nueva.persona@example.invalid');
	await username.fill('otra.persona');
	await password.fill('Otra-persona-2026!');
	await dialog.getByRole('radio', { name: /teacher/ }).check();
	await dialog.getByRole('button', { name: 'Crear usuario' }).click();
	await expect(dialog.getByRole('alert')).toContainText('Ya existe un usuario con ese email');
	await expect(email).toBeFocused();
	await expect(username).toHaveValue('otra.persona');
	await expect(password).toHaveValue('Otra-persona-2026!');
	await expect(dialog.getByRole('radio', { name: /teacher/ })).toBeChecked();

	expect(errors).toEqual([]);
});
