import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { fileCleanupService } from '$lib/server/files/FileCleanupService';

// POST: Execute maintenance actions
export const POST: RequestHandler = async ({ request, locals }) => {
	// Check admin permissions
	if (!locals.user) {
		return json({ error: 'Unauthorized' }, { status: 401 });
	}

	// Check for admin role (assuming highestRoleLevel >= 90 is admin)
	const userRoleLevel = locals.user.highestRoleLevel ?? 0;
	if (userRoleLevel < 90) {
		return json({ error: 'Forbidden: Admin access required' }, { status: 403 });
	}

	try {
		const body = await request.json();
		const { action } = body;

		switch (action) {
			case 'full-cleanup': {
				const result = await fileCleanupService.runFullCleanup();
				return json({
					success: true,
					action: 'full-cleanup',
					result: {
						orphansDetected: result.orphanDetection.orphansFound,
						orphansByType: result.orphanDetection.byEntityType,
						deletedPurged: result.deletedPurge.deletedCount,
						deletedFreedBytes: result.deletedPurge.freedBytes,
						orphansPurged: result.orphanPurge.deletedCount,
						orphansFreedBytes: result.orphanPurge.freedBytes,
						errors: [
							...result.deletedPurge.errors,
							...result.orphanPurge.errors
						]
					}
				});
			}

			case 'purge-deleted': {
				const result = await fileCleanupService.purgeDeletedFiles();
				return json({
					success: result.success,
					action: 'purge-deleted',
					result: {
						purgedCount: result.deletedCount,
						freedBytes: result.freedBytes,
						errors: result.errors
					}
				});
			}

			case 'purge-orphans': {
				const result = await fileCleanupService.purgeOrphanedFiles();
				return json({
					success: result.success,
					action: 'purge-orphans',
					result: {
						purgedCount: result.deletedCount,
						freedBytes: result.freedBytes,
						errors: result.errors
					}
				});
			}

			case 'detect-orphans': {
				const result = await fileCleanupService.detectOrphanedFiles();
				// Mark detected orphans
				if (result.orphansFound > 0) {
					await fileCleanupService.markAsOrphans(result.orphanIds);
				}
				return json({
					success: true,
					action: 'detect-orphans',
					result: {
						orphansFound: result.orphansFound,
						orphanIds: result.orphanIds,
						byEntityType: result.byEntityType
					}
				});
			}

			default:
				return json(
					{ error: `Unknown action: ${action}` },
					{ status: 400 }
				);
		}
	} catch (error) {
		console.error('Maintenance endpoint error:', error);
		return json(
			{ error: error instanceof Error ? error.message : 'Unknown error' },
			{ status: 500 }
		);
	}
};

// GET: Get current storage stats
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
		const stats = await fileCleanupService.getStorageStats();
		return json({ success: true, stats });
	} catch (error) {
		console.error('Failed to get storage stats:', error);
		return json(
			{ error: error instanceof Error ? error.message : 'Unknown error' },
			{ status: 500 }
		);
	}
};
