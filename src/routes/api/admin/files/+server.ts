import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { db } from '$lib/server/db';
import { fileStorage } from '$lib/server/db/schema';
import { eq, and, like, sql, desc } from 'drizzle-orm';
import { fileStorageService } from '$lib/server/files/FileStorageService';
import { fileCleanupService } from '$lib/server/files/FileCleanupService';

// GET: List files with pagination and filters
export const GET: RequestHandler = async ({ url, locals }) => {
	// Check admin permissions
	if (!locals.user) {
		return json({ error: 'Unauthorized' }, { status: 401 });
	}

	const userRoleLevel = locals.user.highestRoleLevel ?? 0;
	if (userRoleLevel < 90) {
		return json({ error: 'Forbidden: Admin access required' }, { status: 403 });
	}

	try {
		// Parse query parameters
		const page = Math.max(1, parseInt(url.searchParams.get('page') || '1'));
		const limit = Math.min(100, Math.max(1, parseInt(url.searchParams.get('limit') || '20')));
		const offset = (page - 1) * limit;

		const category = url.searchParams.get('category');
		const status = url.searchParams.get('status');
		const search = url.searchParams.get('search');
		const showDeleted = url.searchParams.get('showDeleted') === 'true';
		const showOrphans = url.searchParams.get('showOrphans') === 'true';

		// Build conditions
		const conditions = [];

		if (!showDeleted) {
			conditions.push(eq(fileStorage.isActive, true));
		}

		if (category) {
			conditions.push(eq(fileStorage.category, category as 'avatar' | 'course' | 'chat' | 'rag_document' | 'public'));
		}

		if (status) {
			conditions.push(eq(fileStorage.processingStatus, status as 'pending' | 'processing' | 'completed' | 'error'));
		}

		if (showOrphans) {
			conditions.push(eq(fileStorage.isOrphan, true));
		}

		if (search) {
			conditions.push(like(fileStorage.name, `%${search}%`));
		}

		// Get total count
		const countResult = await db
			.select({ count: sql<number>`count(*)` })
			.from(fileStorage)
			.where(conditions.length > 0 ? and(...conditions) : undefined);

		const total = Number(countResult[0]?.count || 0);

		// Get files
		const files = await db
			.select()
			.from(fileStorage)
			.where(conditions.length > 0 ? and(...conditions) : undefined)
			.orderBy(desc(fileStorage.uploadedAt))
			.limit(limit)
			.offset(offset);

		return json({
			success: true,
			files,
			pagination: {
				page,
				limit,
				total,
				totalPages: Math.ceil(total / limit)
			}
		});
	} catch (error) {
		console.error('Failed to list files:', error);
		return json(
			{ error: error instanceof Error ? error.message : 'Unknown error' },
			{ status: 500 }
		);
	}
};

// POST: Bulk actions on files
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
		const { action, fileIds } = body;

		if (!fileIds || !Array.isArray(fileIds) || fileIds.length === 0) {
			return json({ error: 'No files specified' }, { status: 400 });
		}

		switch (action) {
			case 'delete': {
				const results = [];
				for (const fileId of fileIds) {
					const result = await fileStorageService.delete(fileId, locals.user.id);
					results.push({ fileId, ...result });
				}
				return json({
					success: true,
					action: 'delete',
					results
				});
			}

			case 'restore': {
				const results = [];
				for (const fileId of fileIds) {
					const success = await fileCleanupService.restoreFile(fileId);
					results.push({ fileId, success });
				}
				return json({
					success: true,
					action: 'restore',
					results
				});
			}

			case 'unmark-orphan': {
				const results = [];
				for (const fileId of fileIds) {
					const success = await fileCleanupService.unmarkOrphan(fileId);
					results.push({ fileId, success });
				}
				return json({
					success: true,
					action: 'unmark-orphan',
					results
				});
			}

			default:
				return json({ error: `Unknown action: ${action}` }, { status: 400 });
		}
	} catch (error) {
		console.error('Bulk action failed:', error);
		return json(
			{ error: error instanceof Error ? error.message : 'Unknown error' },
			{ status: 500 }
		);
	}
};
