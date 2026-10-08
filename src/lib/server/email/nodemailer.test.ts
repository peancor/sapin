import test from 'node:test';
import assert from 'node:assert/strict';
import nodemailer from 'nodemailer';

test('mail keeps recipients, Unicode content and headers without delivering externally', async () => {
	const transport = nodemailer.createTransport({ streamTransport: true, buffer: true });
	const result = await transport.sendMail({
		from: '"Sapin" <noreply@example.invalid>',
		to: 'student@example.invalid',
		cc: ['teacher@example.invalid'],
		bcc: ['audit@example.invalid'],
		subject: 'Lección de prueba',
		text: 'Actividad completada',
		html: '<p>Actividad completada</p>'
	});
	assert.deepEqual(result.envelope.to, [
		'student@example.invalid',
		'teacher@example.invalid',
		'audit@example.invalid'
	]);
	const message = result.message.toString();
	assert.match(message, /multipart\/alternative/);
	assert.match(message, /Actividad completada/);
	assert.match(message, /Subject: =\?UTF-8\?/);
});
