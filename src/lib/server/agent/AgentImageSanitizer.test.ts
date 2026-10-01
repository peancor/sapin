import test from 'node:test';
import assert from 'node:assert/strict';
import sharp from 'sharp';

import {
	MAX_AGENT_IMAGE_SIDE,
	SANITIZED_AGENT_IMAGE_MIME_TYPE,
	sanitizeAgentImage
} from './AgentImageSanitizer.ts';

async function makeImage(format: 'jpeg' | 'png' | 'webp'): Promise<Buffer> {
	const image = sharp({
		create: {
			width: 3000,
			height: 1000,
			channels: 3,
			background: '#ffffff'
		}
	});

	if (format === 'jpeg') return image.jpeg().toBuffer();
	if (format === 'png') return image.png().toBuffer();
	return image.webp().toBuffer();
}

function makeFile(buffer: Buffer, name: string, type: string): File {
	return new File([new Uint8Array(buffer)], name, { type });
}

test('sanitizeAgentImage accepts JPEG, PNG and WebP and normalizes to bounded WebP', async () => {
	for (const [format, mimeType] of [
		['jpeg', 'image/jpeg'],
		['png', 'image/png'],
		['webp', 'image/webp']
	] as const) {
		const sanitized = await sanitizeAgentImage(
			makeFile(await makeImage(format), `drawing.${format}`, mimeType)
		);

		assert.equal(sanitized.file.type, SANITIZED_AGENT_IMAGE_MIME_TYPE);
		assert.equal(sanitized.width, MAX_AGENT_IMAGE_SIDE);
		assert.ok(sanitized.height <= MAX_AGENT_IMAGE_SIDE);
		assert.ok(sanitized.size > 0);
	}
});

test('sanitizeAgentImage rejects SVG, GIF and corrupt image content', async () => {
	await assert.rejects(
		() => sanitizeAgentImage(makeFile(Buffer.from('<svg></svg>'), 'bad.svg', 'image/svg+xml')),
		/Solo se permiten/
	);

	const gif = Buffer.from('R0lGODlhAQABAPAAAP///wAAACH5BAAAAAAALAAAAAABAAEAAAICRAEAOw==', 'base64');
	await assert.rejects(
		() => sanitizeAgentImage(makeFile(gif, 'bad.gif', 'image/gif')),
		/Solo se permiten/
	);

	await assert.rejects(
		() => sanitizeAgentImage(makeFile(Buffer.from('not an image'), 'bad.jpg', 'image/jpeg')),
		/No se pudo leer/
	);
});
