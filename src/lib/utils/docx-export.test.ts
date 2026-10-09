import test from 'node:test';
import assert from 'node:assert/strict';
import JSZip from 'jszip';
import { createDocxFromContent, createDocxFromMarkdown } from './docx-export';

async function documentXml(blob: Blob) {
	const zip = await JSZip.loadAsync(await blob.arrayBuffer());
	const document = zip.file('word/document.xml');
	assert.ok(document);
	return document.async('string');
}

test('DOCX export preserves nested formatting, lists, tables and code from Markdown', async () => {
	const xml = await documentXml(
		await createDocxFromContent(
			'Informe',
			'2026-10-09',
			[
				'# Cabecera',
				'**Negrita con *cursiva***',
				'- Elemento uno\n- Elemento dos',
				'> Cita de prueba',
				'| Columna | Valor |\n| --- | --- |\n| Celda | Dato |',
				'```ts\nconst resultado = 2;\n```'
			].join('\n\n')
		)
	);
	for (const text of [
		'Cabecera',
		'Negrita con',
		'cursiva',
		'Elemento uno',
		'Elemento dos',
		'Cita de prueba',
		'Columna',
		'Celda',
		'const resultado = 2;'
	])
		assert.ok(xml.includes(text), text);
	assert.match(xml, /<w:b\b/);
	assert.match(xml, /<w:i\b/);
	assert.match(xml, /<w:tbl>/);
	assert.ok(!xml.includes('[Error al procesar contenido]'));
});

test('DOCX export retains legacy table cells supplied as strings', async () => {
	const tokens = [
		{ type: 'table', raw: '', header: ['Cabecera legacy'], cells: [['Celda legacy']] }
	];
	const xml = await documentXml(await createDocxFromMarkdown('Legacy', '2026-10-09', tokens));
	assert.ok(xml.includes('Cabecera legacy'));
	assert.ok(xml.includes('Celda legacy'));
	assert.match(xml, /<w:tbl>/);
});
