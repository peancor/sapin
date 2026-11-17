import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { fileStorageService } from '$lib/server/files/FileStorageService';
import { filePermissionMiddleware } from '$lib/server/files/FilePermissionMiddleware';
import { buildFileCacheControl } from '$lib/server/files/fileResponseHeaders';
import { imageProcessor } from '$lib/server/files/ImageProcessor';

export const GET: RequestHandler = async ({ params, locals }) => {
	const { fileId } = params;

	if (!fileId) {
		return json({ error: 'File ID is required' }, { status: 400 });
	}

	try {
		// Get the file record
		const file = await fileStorageService.getFile(fileId);

		if (!file) {
			return json({ error: 'File not found' }, { status: 404 });
		}

		// La miniatura expone el mismo contenido que el fichero: mismos permisos de lectura.
		const permissionCheck = await filePermissionMiddleware.checkPermission(
			fileId,
			locals.user?.id ?? null,
			'read'
		);

		if (!permissionCheck.allowed) {
			return json(
				{ error: permissionCheck.reason || 'Access denied' },
				{ status: locals.user ? 403 : 401 }
			);
		}

		// Check if it's a processable image
		if (!imageProcessor.isProcessableImage(file.mimeType)) {
			return json({ error: 'File is not an image' }, { status: 400 });
		}

		// Get or generate thumbnail
		const thumbnail = await imageProcessor.getThumbnail(fileId);

		if (!thumbnail) {
			return json({ error: 'Failed to generate thumbnail' }, { status: 500 });
		}

		// Update access stats (non-blocking)
		fileStorageService.updateAccessStats(fileId).catch(() => {});

		// Return the thumbnail as webp
		return new Response(new Uint8Array(thumbnail.buffer), {
			headers: {
				'Content-Type': 'image/webp',
				'Content-Length': thumbnail.buffer.length.toString(),
				'Cache-Control': buildFileCacheControl(file.visibility),
				'X-Content-Type-Options': 'nosniff',
				'Cross-Origin-Resource-Policy': 'same-origin'
			}
		});
	} catch (error) {
		console.error('Thumbnail endpoint error:', error);
		return json({ error: 'Failed to load thumbnail' }, { status: 500 });
	}
};
