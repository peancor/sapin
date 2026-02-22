import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { fileStorageService } from '$lib/server/files/FileStorageService';
import { imageProcessor } from '$lib/server/files/ImageProcessor';

export const GET: RequestHandler = async ({ params }) => {
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
				'Cache-Control': 'public, max-age=31536000, immutable'
			}
		});
	} catch (error) {
		console.error('Thumbnail endpoint error:', error);
		return json(
			{ error: error instanceof Error ? error.message : 'Unknown error' },
			{ status: 500 }
		);
	}
};
