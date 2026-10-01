import assert from 'node:assert/strict';
import test from 'node:test';
import { createHash } from 'node:crypto';

import {
	ActivityPackageError,
	rewriteFileUrlsInString,
	rewriteFileUrlsInUnknown,
	validateActivityPackageChecksums,
	validateActivityPackageEntryPath,
	type ActivityPackageChecksums
} from './ActivityPackageService.ts';

function sha256(bytes: Uint8Array): string {
	return createHash('sha256').update(bytes).digest('hex');
}

test('validateActivityPackageEntryPath rejects traversal and unexpected top-level entries', () => {
	assert.equal(
		validateActivityPackageEntryPath('resources/file_1/image.png'),
		'resources/file_1/image.png'
	);
	assert.equal(validateActivityPackageEntryPath('rag/doc_1/source.pdf'), 'rag/doc_1/source.pdf');

	for (const entryPath of [
		'../manifest.json',
		'resources/../../x',
		'/manifest.json',
		'lesson/definition.json',
		'evil/file.txt'
	]) {
		assert.throws(
			() => validateActivityPackageEntryPath(entryPath),
			(error: unknown) => error instanceof ActivityPackageError && error.status === 400
		);
	}
});

test('validateActivityPackageChecksums verifies declared size and sha256', () => {
	const bytes = new TextEncoder().encode('payload');
	const checksums: ActivityPackageChecksums = {
		algorithm: 'sha256',
		files: {
			'resources/file_1/image.png': {
				sha256: sha256(bytes),
				size: bytes.byteLength,
				mimeType: 'image/png'
			}
		}
	};

	assert.doesNotThrow(() =>
		validateActivityPackageChecksums(new Map([['resources/file_1/image.png', bytes]]), checksums)
	);

	const badChecksums: ActivityPackageChecksums = {
		algorithm: 'sha256',
		files: {
			'resources/file_1/image.png': {
				sha256: '0'.repeat(64),
				size: bytes.byteLength,
				mimeType: 'image/png'
			}
		}
	};

	assert.throws(
		() =>
			validateActivityPackageChecksums(
				new Map([['resources/file_1/image.png', bytes]]),
				badChecksums
			),
		(error: unknown) => error instanceof ActivityPackageError && error.status === 400
	);
});

test('rewriteFileUrlsInString remaps only known /api/files ids', () => {
	const rewritten = rewriteFileUrlsInString(
		'Imagen /api/files/old_storage y enlace /api/files/unknown',
		new Map([['old_storage', 'new_storage']])
	);

	assert.equal(rewritten, 'Imagen /api/files/new_storage y enlace /api/files/unknown');
});

test('rewriteFileUrlsInUnknown recursively remaps serialized config values', () => {
	const rewritten = rewriteFileUrlsInUnknown(
		{
			systemPrompt: 'Usa /api/files/old_storage',
			nested: [{ image: '/api/files/old_image' }, { keep: '/api/files/unknown' }]
		},
		new Map([
			['old_storage', 'new_storage'],
			['old_image', 'new_image']
		])
	);

	assert.deepEqual(rewritten, {
		systemPrompt: 'Usa /api/files/new_storage',
		nested: [{ image: '/api/files/new_image' }, { keep: '/api/files/unknown' }]
	});
});
