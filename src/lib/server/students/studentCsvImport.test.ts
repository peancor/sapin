import assert from 'node:assert/strict';
import test from 'node:test';
import { buildStudentCsv, buildStudentCsvTemplate } from '$lib/utils/studentCsv';
import { parseStudentCsv, resolveStudentCsvUser } from './studentCsvImport';

test('student CSV round trips names, separators, quotes, newlines, accents and leading zeros', () => {
	const student = {
		id: 'internal-id',
		externalId: '00042',
		email: 'ana@example.invalid',
		username: 'Pérez, Ana; "A"\nSegundo nombre',
		alias: 'Ana'
	};
	const csv = buildStudentCsv([student, student]);
	assert.ok(csv.startsWith('\uFEFFexternalId;email;fullname;firstname\r\n'));
	assert.ok(!csv.includes('internal-id'));
	assert.deepEqual(parseStudentCsv(csv), [
		{ externalId: '00042', email: student.email, fullname: student.username, firstname: 'Ana' }
	]);
});

test('template contains importable fictional identities', () => {
	const rows = parseStudentCsv(buildStudentCsvTemplate());
	assert.equal(rows.length, 2);
	for (const row of rows) {
		assert.ok(row.email.endsWith('@example.invalid'));
		assert.equal(resolveStudentCsvUser(row, null, null), null);
	}
});

test('legacy Moodle CSV accepts comma or semicolon and optional first/last names', () => {
	assert.deepEqual(
		parseStudentCsv(
			'id,email,firstname,lastname,fullname\r\n0001,ana@example.invalid,Ana,Pérez,"Pérez, Ana"'
		),
		[{ externalId: '0001', email: 'ana@example.invalid', fullname: 'Pérez, Ana', firstname: 'Ana' }]
	);
	assert.equal(
		parseStudentCsv('id;email;fullname\n0001;ana@example.invalid;Pérez, Ana')[0].firstname,
		''
	);
	assert.equal(
		parseStudentCsv('externalId,email,fullname\n0001,ana@example.invalid,"Pérez; Ana"')[0].fullname,
		'Pérez; Ana'
	);
});

test('invalid headers, duplicate columns, ambiguous IDs and malformed rows are rejected', () => {
	for (const csv of [
		'',
		'externalId;email;fullname',
		'ID,Username,Email\ninternal,Ana,ana@example.invalid',
		'externalId;email;email;fullname\nx;a;b;c',
		'id;externalId;email;fullname\nx;y;a;b',
		'externalId;email;fullname\nx;a',
		'externalId;email;fullname\nx;a;"unfinished'
	]) {
		assert.throws(() => parseStudentCsv(csv));
	}
});

const row = {
	externalId: '0001',
	email: 'ana@example.invalid',
	fullname: 'Pérez, Ana',
	firstname: ''
};
const user = { id: 'internal', email: row.email, externalId: row.externalId };

test('existing identities are reused without updates; users without external ID can be reimported', () => {
	assert.equal(resolveStudentCsvUser(row, user, user), user.id);
	assert.equal(
		resolveStudentCsvUser({ ...row, externalId: '', fullname: '' }, null, {
			...user,
			externalId: null
		}),
		user.id
	);
	assert.equal(resolveStudentCsvUser({ ...row, externalId: '' }, null, user), user.id);
});

test('identity conflicts cannot silently enroll another user or link an external ID', () => {
	assert.throws(
		() => resolveStudentCsvUser({ ...row, email: 'other@example.invalid' }, user, null),
		/Conflicto/
	);
	assert.throws(
		() => resolveStudentCsvUser(row, user, { ...user, id: 'another-user' }),
		/Conflicto/
	);
	assert.throws(
		() => resolveStudentCsvUser(row, null, { ...user, externalId: 'different' }),
		/Conflicto/
	);
	assert.throws(() => resolveStudentCsvUser(row, null, { ...user, externalId: null }), /Conflicto/);
});

test('new students need an external identity, valid email and full name', () => {
	for (const invalid of [
		{ ...row, externalId: '' },
		{ ...row, fullname: '' },
		{ ...row, email: 'invalid' }
	]) {
		assert.throws(() => resolveStudentCsvUser(invalid, null, null));
	}
});
