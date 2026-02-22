import { error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { fileStorageService } from '$lib/server/files/FileStorageService';
import { filePermissionMiddleware } from '$lib/server/files/FilePermissionMiddleware';
import fs from 'fs/promises';
import { createReadStream } from 'fs';

/**
 * GET /api/files/[fileId]
 * Download a file with permission checking
 *
 * Query parameters:
 * - download: 'true' to force download (Content-Disposition: attachment)
 */
export const GET: RequestHandler = async ({ params, locals, url, request }) => {
	const { fileId } = params;
	const forceDownload = url.searchParams.get('download') === 'true';

	try {
		// Get file from database
		const file = await fileStorageService.getFile(fileId);
		if (!file) {
			throw error(404, 'File not found');
		}

		// Check permissions
		const userId = locals.user?.id || null;
		const permissionCheck = await filePermissionMiddleware.checkPermission(
			fileId,
			userId,
			'read'
		);

		if (!permissionCheck.allowed) {
			// Log failed access attempt
			await fileStorageService.logAccess(
				fileId,
				userId,
				'download',
				false,
				request.headers.get('x-forwarded-for') || request.headers.get('x-real-ip') || undefined,
				request.headers.get('user-agent') || undefined,
				permissionCheck.reason
			);

			throw error(403, permissionCheck.reason || 'Access denied');
		}

		// Get physical file path
		const filePath = fileStorageService.getPhysicalPath(file);

		// Check if file exists on disk
		try {
			await fs.access(filePath);
		} catch (err) {
			console.error('File not found on disk:', filePath);
			throw error(404, 'File not found on disk');
		}

		// Update access statistics (async, don't wait)
		fileStorageService.updateAccessStats(fileId).catch((err) => {
			console.error('Failed to update access stats:', err);
		});

		// Log successful access
		fileStorageService
			.logAccess(
				fileId,
				userId,
				'download',
				true,
				request.headers.get('x-forwarded-for') || request.headers.get('x-real-ip') || undefined,
				request.headers.get('user-agent') || undefined
			)
			.catch((err) => {
				console.error('Failed to log access:', err);
			});

		// Read file stats for headers
		const stats = await fs.stat(filePath);

		// Set appropriate headers
		const headers = new Headers();
		headers.set('Content-Type', file.mimeType || 'application/octet-stream');
		headers.set('Content-Length', stats.size.toString());
		headers.set('Cache-Control', 'public, max-age=31536000, immutable');
		headers.set('ETag', `"${file.hash}"`);

		// Set Content-Disposition based on forceDownload
		if (forceDownload) {
			headers.set('Content-Disposition', `attachment; filename="${file.displayName || file.name}"`);
		} else {
			// Inline display for images, PDFs, etc.
			if (
				file.mimeType.startsWith('image/') ||
				file.mimeType === 'application/pdf' ||
				file.mimeType.startsWith('text/')
			) {
				headers.set('Content-Disposition', `inline; filename="${file.displayName || file.name}"`);
			} else {
				headers.set(
					'Content-Disposition',
					`attachment; filename="${file.displayName || file.name}"`
				);
			}
		}

		// Check ETag for caching
		const ifNoneMatch = request.headers.get('if-none-match');
		if (ifNoneMatch === `"${file.hash}"`) {
			return new Response(null, {
				status: 304,
				headers
			});
		}

		// Stream the file
		const fileStream = createReadStream(filePath);

		return new Response(fileStream as any, {
			status: 200,
			headers
		});
	} catch (err) {
		console.error('Download error:', err);

		// If it's already a SvelteKit error, rethrow it
		if (err && typeof err === 'object' && 'status' in err) {
			throw err;
		}

		// Otherwise, return a generic error
		throw error(500, err instanceof Error ? err.message : 'Download failed');
	}
};

/**
 * DELETE /api/files/[fileId]
 * Delete a file (soft delete)
 */
export const DELETE: RequestHandler = async ({ params, locals, request }) => {
	const { fileId } = params;

	try {
		// Check authentication
		if (!locals.user) {
			throw error(401, 'Authentication required');
		}

		// Get file from database
		const file = await fileStorageService.getFile(fileId);
		if (!file) {
			throw error(404, 'File not found');
		}

		// Check permissions
		const permissionCheck = await filePermissionMiddleware.checkPermission(
			fileId,
			locals.user.id,
			'delete'
		);

		if (!permissionCheck.allowed) {
			// Log failed deletion attempt
			await fileStorageService.logAccess(
				fileId,
				locals.user.id,
				'delete',
				false,
				request.headers.get('x-forwarded-for') || request.headers.get('x-real-ip') || undefined,
				request.headers.get('user-agent') || undefined,
				permissionCheck.reason
			);

			throw error(403, permissionCheck.reason || 'Access denied');
		}

		// Delete the file (soft delete)
		const result = await fileStorageService.delete(fileId, locals.user.id);

		if (!result.success) {
			throw error(500, result.error || 'Delete failed');
		}

		return new Response(JSON.stringify({ success: true }), {
			status: 200,
			headers: {
				'Content-Type': 'application/json'
			}
		});
	} catch (err) {
		console.error('Delete error:', err);

		// If it's already a SvelteKit error, rethrow it
		if (err && typeof err === 'object' && 'status' in err) {
			throw err;
		}

		// Otherwise, return a generic error
		throw error(500, err instanceof Error ? err.message : 'Delete failed');
	}
};
