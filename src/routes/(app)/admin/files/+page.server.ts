import type { PageServerLoad } from './$types';
import { redirect } from '@sveltejs/kit';
import { fileCleanupService } from '$lib/server/files/FileCleanupService';
import { imageProcessingQueue } from '$lib/server/files/ImageProcessingQueue';
import { db } from '$lib/server/db';
import { fileStorage } from '$lib/server/db/schema';
import { eq, and, desc } from 'drizzle-orm';

export const load: PageServerLoad = async ({ locals, url }) => {
	// Check authentication
	if (!locals.user) {
		throw redirect(302, '/login');
	}

	// Check admin permission (level >= 90)
	const userRoleLevel = locals.user.highestRoleLevel ?? 0;
	if (userRoleLevel < 90) {
		throw redirect(302, '/');
	}

	// Parse query params
	const page = Math.max(1, parseInt(url.searchParams.get('page') || '1'));
	const limit = 20;
	const offset = (page - 1) * limit;
	const category = url.searchParams.get('category') || '';
	const status = url.searchParams.get('status') || '';
	const showDeleted = url.searchParams.get('showDeleted') === 'true';
	const showOrphans = url.searchParams.get('showOrphans') === 'true';

	// Get storage stats
	const stats = await fileCleanupService.getStorageStats();

	// Get processing stats
	const processingStats = await imageProcessingQueue.getStats();

	// Build query conditions
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

	// Get files
	const files = await db
		.select()
		.from(fileStorage)
		.where(conditions.length > 0 ? and(...conditions) : undefined)
		.orderBy(desc(fileStorage.uploadedAt))
		.limit(limit)
		.offset(offset);

	// Get total for pagination
	const allFilesWithConditions = await db
		.select({ id: fileStorage.id })
		.from(fileStorage)
		.where(conditions.length > 0 ? and(...conditions) : undefined);

	const total = allFilesWithConditions.length;

	return {
		stats,
		processingStats,
		files,
		pagination: {
			page,
			limit,
			total,
			totalPages: Math.ceil(total / limit)
		},
		filters: {
			category,
			status,
			showDeleted,
			showOrphans
		}
	};
};
