import assert from 'node:assert/strict';
import test from 'node:test';
import { createHash } from 'node:crypto';

import type { LessonDefinition } from '$lib/types/lesson';
import { LessonServiceError } from './LessonServiceError.ts';
import {
	assertAllLessonAssetRefsResolvable,
	validateLessonPackageChecksums,
	validateLessonPackageEntryPath,
	rewriteLessonDefinitionResourceIds,
	type LessonPackageChecksums
} from './LessonPackageService.ts';

function sha256(bytes: Uint8Array): string {
	return createHash('sha256').update(bytes).digest('hex');
}

function makeDefinition(fileId = 'old_file'): LessonDefinition {
	return {
		version: '2',
		entryBlockId: 'intro',
		blocks: [
			{
				id: 'intro',
				kind: 'content',
				title: 'Intro',
				body: 'Hola',
				next: 'end',
				assetRefs: [{ fileId, kind: 'image', caption: 'Imagen' }]
			},
			{
				id: 'end',
				kind: 'end',
				title: 'Fin',
				body: 'Cierre'
			}
		]
	};
}

test('validateLessonPackageEntryPath rejects traversal and unexpected top-level entries', () => {
	assert.equal(
		validateLessonPackageEntryPath('lesson/definition.published.json'),
		'lesson/definition.published.json'
	);

	for (const entryPath of [
		'../manifest.json',
		'lesson/../../x',
		'/manifest.json',
		'evil/file.txt',
		'lesson/revisions/1.json'
	]) {
		assert.throws(
			() => validateLessonPackageEntryPath(entryPath),
			(error: unknown) => error instanceof LessonServiceError && error.status === 400
		);
	}
});

test('validateLessonPackageChecksums verifies declared size and sha256', () => {
	const bytes = new TextEncoder().encode('payload');
	const checksums: LessonPackageChecksums = {
		algorithm: 'sha256',
		files: {
			'lesson/definition.published.json': {
				sha256: sha256(bytes),
				size: bytes.byteLength,
				mimeType: 'application/json'
			}
		}
	};

	assert.doesNotThrow(() =>
		validateLessonPackageChecksums(
			new Map([['lesson/definition.published.json', bytes]]),
			checksums
		)
	);

	const badChecksums: LessonPackageChecksums = {
		algorithm: 'sha256',
		files: {
			'lesson/definition.published.json': {
				sha256: '0'.repeat(64),
				size: bytes.byteLength,
				mimeType: 'application/json'
			}
		}
	};

	assert.throws(
		() =>
			validateLessonPackageChecksums(
				new Map([['lesson/definition.published.json', bytes]]),
				badChecksums
			),
		(error: unknown) => error instanceof LessonServiceError && error.status === 400
	);
});

test('rewriteLessonDefinitionResourceIds remaps content asset references only', () => {
	const definition = makeDefinition();
	const rewritten = rewriteLessonDefinitionResourceIds(
		definition,
		new Map([['old_file', 'new_file']])
	);
	const contentBlock = rewritten.blocks[0];

	assert.equal(contentBlock.kind, 'content');
	assert.equal(
		contentBlock.kind === 'content' ? contentBlock.assetRefs?.[0]?.fileId : '',
		'new_file'
	);
	assert.equal(
		definition.blocks[0]?.kind === 'content' ? definition.blocks[0].assetRefs?.[0]?.fileId : '',
		'old_file'
	);
});

test('rewriteLessonDefinitionResourceIds remaps markdown file urls to imported storage ids', () => {
	const definition = makeDefinition('old_interactive_file');
	const contentBlock = definition.blocks[0];
	if (contentBlock.kind !== 'content') {
		assert.fail('Expected content block');
	}
	contentBlock.body =
		'Imagen ![captura](/api/files/old_storage_file "captura") y enlace /api/files/unknown_file';

	const rewritten = rewriteLessonDefinitionResourceIds(
		definition,
		new Map([['old_interactive_file', 'new_interactive_file']]),
		new Map([['old_storage_file', 'new_storage_file']])
	);
	const rewrittenContentBlock = rewritten.blocks[0];

	assert.equal(rewrittenContentBlock.kind, 'content');
	assert.equal(
		rewrittenContentBlock.kind === 'content' ? rewrittenContentBlock.body : '',
		'Imagen ![captura](/api/files/new_storage_file "captura") y enlace /api/files/unknown_file'
	);
	assert.equal(
		rewrittenContentBlock.kind === 'content' ? rewrittenContentBlock.assetRefs?.[0]?.fileId : '',
		'new_interactive_file'
	);
	assert.equal(contentBlock.body.includes('/api/files/old_storage_file'), true);
});

test('assertAllLessonAssetRefsResolvable rejects missing packaged resources', () => {
	assert.doesNotThrow(() =>
		assertAllLessonAssetRefsResolvable([makeDefinition()], new Set(['old_file']))
	);
	assert.throws(
		() =>
			assertAllLessonAssetRefsResolvable([makeDefinition('missing_file')], new Set(['old_file'])),
		(error: unknown) => error instanceof LessonServiceError && error.status === 400
	);
});
