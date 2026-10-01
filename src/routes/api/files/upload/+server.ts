import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { fileStorageService } from '$lib/server/files/FileStorageService';

/**
 * POST /api/files/upload
 * Generic file upload endpoint
 *
 * Expected form data:
 * - file: File to upload
 * - category: 'avatar' | 'course' | 'chat' | 'rag_document'
 * - entityType: 'user' | 'course' | 'interactive_learning' | 'interactive_learning_chat'
 * - entityId: ID of the related entity
 * - displayName (optional): Custom display name
 * - visibility (optional): 'public' | 'private' | 'restricted'
 */
export const POST: RequestHandler = async ({ request, locals }) => {
	// Check authentication
	if (!locals.user) {
		throw error(401, 'Authentication required');
	}

	try {
		// Parse form data
		const formData = await request.formData();
		const file = formData.get('file') as File | null;
		const category = formData.get('category') as string | null;
		const entityType = formData.get('entityType') as string | null;
		const entityId = formData.get('entityId') as string | null;
		const displayName = formData.get('displayName') as string | null;
		const visibility = formData.get('visibility') as 'public' | 'private' | 'restricted' | null;

		// Validate required fields
		if (!file) {
			throw error(400, 'File is required');
		}

		if (!category) {
			throw error(400, 'Category is required');
		}

		if (!['avatar', 'course', 'chat', 'rag_document', 'public'].includes(category)) {
			throw error(400, 'Invalid category');
		}

		if (!entityType) {
			throw error(400, 'Entity type is required');
		}

		if (!['user', 'course', 'interactive_learning', 'interactive_learning_chat', 'system'].includes(entityType)) {
			throw error(400, 'Invalid entity type');
		}

		if (!entityId) {
			throw error(400, 'Entity ID is required');
		}

		// Upload file
		const result = await fileStorageService.upload({
			file,
			category: category as 'avatar' | 'course' | 'chat' | 'rag_document' | 'public',
			entityType: entityType as 'user' | 'course' | 'interactive_learning' | 'interactive_learning_chat' | 'system',
			entityId,
			uploadedBy: locals.user.id,
			displayName: displayName || undefined,
			visibility: visibility || undefined
		});

		if (!result.success) {
			throw error(400, result.error || 'Upload failed');
		}

		// Log successful upload
		await fileStorageService.logAccess(
			result.fileId!,
			locals.user.id,
			'upload',
			true,
			request.headers.get('x-forwarded-for') || request.headers.get('x-real-ip') || undefined,
			request.headers.get('user-agent') || undefined
		);

		return json({
			success: true,
			fileId: result.fileId,
			file: result.file,
			isDuplicate: result.isDuplicate || false,
			url: `/api/files/${result.fileId}`
		});
	} catch (err) {
		console.error('Upload error:', err);

		// If it's already a SvelteKit error, rethrow it
		if (err && typeof err === 'object' && 'status' in err) {
			throw err;
		}

		// Otherwise, return a generic error
		throw error(500, err instanceof Error ? err.message : 'Upload failed');
	}
};
