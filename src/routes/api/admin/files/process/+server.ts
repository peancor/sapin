import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { imageProcessingQueue } from '$lib/server/files/ImageProcessingQueue';
import { imageProcessor } from '$lib/server/files/ImageProcessor';

// POST: Trigger processing actions
export const POST: RequestHandler = async ({ request, locals }) => {
	// Check admin permissions
	if (!locals.user) {
		return json({ error: 'Unauthorized' }, { status: 401 });
	}

	const userRoleLevel = locals.user.highestRoleLevel ?? 0;
	if (userRoleLevel < 90) {
		return json({ error: 'Forbidden: Admin access required' }, { status: 403 });
	}

	try {
		const body = await request.json();
		const { action, fileId, fileIds } = body;

		switch (action) {
			case 'process-batch': {
				const result = await imageProcessingQueue.processBatch();
				return json({
					success: true,
					action: 'process-batch',
					result
				});
			}

			case 'process-single': {
				if (!fileId) {
					return json({ error: 'fileId is required' }, { status: 400 });
				}
				const result = await imageProcessingQueue.processFile(fileId);
				return json({
					success: result.success,
					action: 'process-single',
					fileId,
					error: result.error
				});
			}

			case 'reprocess': {
				// Reprocess specific files
				if (!fileIds || !Array.isArray(fileIds)) {
					return json({ error: 'fileIds array is required' }, { status: 400 });
				}
				const results = [];
				for (const id of fileIds) {
					const result = await imageProcessor.processImage(id);
					results.push({ fileId: id, ...result });
				}
				return json({
					success: true,
					action: 'reprocess',
					results
				});
			}

			case 'requeue-failed': {
				const count = await imageProcessingQueue.requeueFailedFiles();
				return json({
					success: true,
					action: 'requeue-failed',
					requeuedCount: count
				});
			}

			default:
				return json({ error: `Unknown action: ${action}` }, { status: 400 });
		}
	} catch (error) {
		console.error('Process endpoint error:', error);
		return json(
			{ error: error instanceof Error ? error.message : 'Unknown error' },
			{ status: 500 }
		);
	}
};

// GET: Get processing status
export const GET: RequestHandler = async ({ locals }) => {
	// Check admin permissions
	if (!locals.user) {
		return json({ error: 'Unauthorized' }, { status: 401 });
	}

	const userRoleLevel = locals.user.highestRoleLevel ?? 0;
	if (userRoleLevel < 90) {
		return json({ error: 'Forbidden: Admin access required' }, { status: 403 });
	}

	try {
		const status = imageProcessingQueue.getStatus();
		const stats = await imageProcessingQueue.getStats();
		const pendingFiles = await imageProcessingQueue.getPendingFiles(10);

		return json({
			success: true,
			status,
			stats,
			pendingFiles
		});
	} catch (error) {
		console.error('Failed to get processing status:', error);
		return json(
			{ error: error instanceof Error ? error.message : 'Unknown error' },
			{ status: 500 }
		);
	}
};
