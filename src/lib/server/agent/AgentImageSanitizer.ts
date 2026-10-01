import sharp from 'sharp';

export const MAX_AGENT_IMAGE_ATTACHMENTS_PER_MESSAGE = 3;
export const MAX_AGENT_IMAGE_UPLOAD_BYTES = 10 * 1024 * 1024;
export const MAX_AGENT_IMAGE_SIDE = 2048;
export const SANITIZED_AGENT_IMAGE_MIME_TYPE = 'image/webp';

const OUTPUT_EXTENSION = '.webp';
const ACCEPTED_INPUT_MIME_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp']);
const ACCEPTED_SHARP_FORMATS = new Set(['jpeg', 'png', 'webp']);

export interface SanitizedAgentImage {
	file: File;
	width: number;
	height: number;
	size: number;
	originalMimeType: string;
	originalSize: number;
	originalName: string;
}

function assertImageFile(file: File) {
	if (!ACCEPTED_INPUT_MIME_TYPES.has(file.type)) {
		throw new Error('Solo se permiten imágenes JPEG, PNG o WebP.');
	}

	if (file.size > MAX_AGENT_IMAGE_UPLOAD_BYTES) {
		throw new Error('La imagen supera el límite de 10 MB.');
	}
}

function buildSafeOutputName(originalName: string): string {
	const baseName = originalName.replace(/\.[^.]*$/, '').replace(/[^a-zA-Z0-9._-]+/g, '-');
	return `${baseName || 'agent-image'}${OUTPUT_EXTENSION}`;
}

export async function sanitizeAgentImage(file: File): Promise<SanitizedAgentImage> {
	assertImageFile(file);

	const inputBuffer = Buffer.from(await file.arrayBuffer());
	let metadata: sharp.Metadata;
	try {
		metadata = await sharp(inputBuffer, { animated: false }).metadata();
	} catch {
		throw new Error('No se pudo leer la imagen. Prueba con otra imagen JPEG, PNG o WebP.');
	}

	if (!metadata.format || !ACCEPTED_SHARP_FORMATS.has(metadata.format)) {
		throw new Error('El contenido real de la imagen no es JPEG, PNG o WebP.');
	}

	if ((metadata.pages ?? 1) > 1) {
		throw new Error('Las imágenes animadas no están soportadas en esta fase.');
	}

	const result = await sharp(inputBuffer, { animated: false })
		.rotate()
		.resize({
			width: MAX_AGENT_IMAGE_SIDE,
			height: MAX_AGENT_IMAGE_SIDE,
			fit: 'inside',
			withoutEnlargement: true
		})
		.webp({ quality: 90 })
		.toBuffer({ resolveWithObject: true });

	const outputFile = new File([new Uint8Array(result.data)], buildSafeOutputName(file.name), {
		type: SANITIZED_AGENT_IMAGE_MIME_TYPE
	});

	return {
		file: outputFile,
		width: result.info.width,
		height: result.info.height,
		size: result.info.size,
		originalMimeType: file.type,
		originalSize: file.size,
		originalName: file.name
	};
}
