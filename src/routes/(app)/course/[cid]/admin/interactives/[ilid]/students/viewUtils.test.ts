import test from 'node:test';
import assert from 'node:assert/strict';

import { buildCsvContent, CSV_BOM, escapeCsvCell, sortCsvRowsByStudent } from './viewUtils.ts';

test('buildCsvContent prepends UTF-8 BOM and uses semicolon with CRLF rows', () => {
	const content = buildCsvContent([
		['Nombre', 'Estado'],
		['Álvaro', 'En progreso'],
		['Bea', 'Completado']
	]);

	assert.equal(content, `${CSV_BOM}Nombre;Estado\r\nÁlvaro;En progreso\r\nBea;Completado`);
	assert.equal(content.startsWith(CSV_BOM), true);
	assert.equal(content.includes('\r\n'), true);
});

test('escapeCsvCell quotes cells with semicolon, quotes, or newlines', () => {
	assert.equal(escapeCsvCell('Ana; admin'), '"Ana; admin"');
	assert.equal(escapeCsvCell('Dice "hola"'), '"Dice ""hola"""');
	assert.equal(escapeCsvCell('Primera\nSegunda'), '"Primera\nSegunda"');
	assert.equal(escapeCsvCell('Texto simple'), 'Texto simple');
});

test('buildCsvContent escapes complex cells without changing the separator', () => {
	const content = buildCsvContent([
		['Nombre', 'Nota'],
		['Ana; admin', 'Dice "hola"\ny sigue']
	]);

	assert.equal(content, `${CSV_BOM}Nombre;Nota\r\n"Ana; admin";"Dice ""hola""\ny sigue"`);
});

test('sortCsvRowsByStudent sorts alphabetically and falls back to email and id', () => {
	const students = [
		{ id: '4', email: 'zoe@example.test', name: 'zoe' },
		{ id: '2', email: 'z@example.test', name: 'Álvaro' },
		{ id: '1', email: 'ana@example.test', name: 'ana' },
		{ id: '3', email: 'a@example.test', name: 'Álvaro' }
	];

	const sorted = sortCsvRowsByStudent(
		students,
		(student) => student.name,
		(student) => `${student.email}\u0000${student.id}`
	);

	assert.deepEqual(
		sorted.map((student) => student.id),
		['3', '2', '1', '4']
	);
});
