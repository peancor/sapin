import { db } from '$lib/server/db';
import { fileStorage, user, course, interactiveLearning, interactiveLearningChat } from '$lib/server/db/schema';
import type { FileStorage } from '$lib/server/db/schema';
import { eq, and, lt, sql, isNull } from 'drizzle-orm';
import fs from 'fs/promises';
import path from 'path';
import { env } from '$env/dynamic/private';

export interface StorageStats {
	totalFiles: number;
	totalSize: number;
	activeFiles: number;
	activeSize: number;
	deletedFiles: number;
	orphanedFiles: number;
	pendingProcessing: number;
	byCategory: Record<string, { count: number; size: number }>;
	byStatus: Record<string, number>;
}

export interface CleanupResult {
	success: boolean;
	deletedCount: number;
	freedBytes: number;
	errors: string[];
}

export interface OrphanDetectionResult {
	orphansFound: number;
	orphanIds: string[];
	byEntityType: Record<string, number>;
}

/**
 * FileCleanupService - Handles file cleanup, orphan detection, and storage statistics
 */
class FileCleanupService {
	private baseStoragePath: string;
	private deletionRetentionDays: number;
	private orphanRetentionDays: number;

	constructor() {
		const storagePath = env.FILES_STORAGE_PATH || 'uploads/files';
		this.baseStoragePath = path.isAbsolute(storagePath)
			? storagePath
			: path.join(process.cwd(), storagePath);
		this.deletionRetentionDays = 7; // Days before physically deleting soft-deleted files
		this.orphanRetentionDays = 30; // Days before deleting orphaned files
	}

	/**
	 * Get storage statistics
	 */
	async getStorageStats(): Promise<StorageStats> {
		try {
			// Total files and size
			const totalResult = await db
				.select({
					count: sql<number>`count(*)`,
					size: sql<number>`coalesce(sum(${fileStorage.size}), 0)`
				})
				.from(fileStorage);

			// Active files and size
			const activeResult = await db
				.select({
					count: sql<number>`count(*)`,
					size: sql<number>`coalesce(sum(${fileStorage.size}), 0)`
				})
				.from(fileStorage)
				.where(eq(fileStorage.isActive, true));

			// Deleted files count
			const deletedResult = await db
				.select({ count: sql<number>`count(*)` })
				.from(fileStorage)
				.where(eq(fileStorage.isActive, false));

			// Orphaned files count
			const orphanedResult = await db
				.select({ count: sql<number>`count(*)` })
				.from(fileStorage)
				.where(and(eq(fileStorage.isOrphan, true), eq(fileStorage.isActive, true)));

			// Pending processing count
			const pendingResult = await db
				.select({ count: sql<number>`count(*)` })
				.from(fileStorage)
				.where(and(eq(fileStorage.processingStatus, 'pending'), eq(fileStorage.isActive, true)));

			// By category
			const categoryResult = await db
				.select({
					category: fileStorage.category,
					count: sql<number>`count(*)`,
					size: sql<number>`coalesce(sum(${fileStorage.size}), 0)`
				})
				.from(fileStorage)
				.where(eq(fileStorage.isActive, true))
				.groupBy(fileStorage.category);

			const byCategory: Record<string, { count: number; size: number }> = {};
			for (const row of categoryResult) {
				byCategory[row.category] = {
					count: Number(row.count),
					size: Number(row.size)
				};
			}

			// By processing status
			const statusResult = await db
				.select({
					status: fileStorage.processingStatus,
					count: sql<number>`count(*)`
				})
				.from(fileStorage)
				.where(eq(fileStorage.isActive, true))
				.groupBy(fileStorage.processingStatus);

			const byStatus: Record<string, number> = {};
			for (const row of statusResult) {
				byStatus[row.status] = Number(row.count);
			}

			return {
				totalFiles: Number(totalResult[0]?.count || 0),
				totalSize: Number(totalResult[0]?.size || 0),
				activeFiles: Number(activeResult[0]?.count || 0),
				activeSize: Number(activeResult[0]?.size || 0),
				deletedFiles: Number(deletedResult[0]?.count || 0),
				orphanedFiles: Number(orphanedResult[0]?.count || 0),
				pendingProcessing: Number(pendingResult[0]?.count || 0),
				byCategory,
				byStatus
			};
		} catch (error) {
			console.error('Failed to get storage stats:', error);
			throw error;
		}
	}

	/**
	 * Detect orphaned files (files whose entity no longer exists)
	 */
	async detectOrphanedFiles(): Promise<OrphanDetectionResult> {
		try {
			const orphanIds: string[] = [];
			const byEntityType: Record<string, number> = {};

			// Get all active, non-orphan files
			const files = await db
				.select()
				.from(fileStorage)
				.where(and(eq(fileStorage.isActive, true), eq(fileStorage.isOrphan, false)));

			// Check each file's entity
			for (const file of files) {
				let isOrphan = false;

				if (file.entityType === 'user') {
					const userExists = await db
						.select({ id: user.id })
						.from(user)
						.where(eq(user.id, file.entityId))
						.limit(1);
					isOrphan = userExists.length === 0;
				} else if (file.entityType === 'course') {
					const courseExists = await db
						.select({ id: course.id })
						.from(course)
						.where(eq(course.id, file.entityId))
						.limit(1);
					isOrphan = courseExists.length === 0;
				} else if (file.entityType === 'interactive_learning_chat') {
					const chatExists = await db
						.select({ id: interactiveLearningChat.id })
						.from(interactiveLearningChat)
						.where(eq(interactiveLearningChat.id, file.entityId))
						.limit(1);
					isOrphan = chatExists.length === 0;
				} else if (file.entityType === 'interactive_learning') {
					const interactiveExists = await db
						.select({ id: interactiveLearning.id })
						.from(interactiveLearning)
						.where(eq(interactiveLearning.id, file.entityId))
						.limit(1);
					isOrphan = interactiveExists.length === 0;
				}
				// 'system' entityType is never orphaned

				if (isOrphan) {
					orphanIds.push(file.id);
					byEntityType[file.entityType] = (byEntityType[file.entityType] || 0) + 1;
				}
			}

			return {
				orphansFound: orphanIds.length,
				orphanIds,
				byEntityType
			};
		} catch (error) {
			console.error('Failed to detect orphaned files:', error);
			throw error;
		}
	}

	/**
	 * Mark files as orphaned
	 */
	async markAsOrphans(fileIds: string[]): Promise<number> {
		if (fileIds.length === 0) return 0;

		try {
			const now = new Date();
			let markedCount = 0;

			for (const fileId of fileIds) {
				await db
					.update(fileStorage)
					.set({
						isOrphan: true,
						markedForDeletionAt: now
					})
					.where(eq(fileStorage.id, fileId));
				markedCount++;
			}

			return markedCount;
		} catch (error) {
			console.error('Failed to mark files as orphans:', error);
			throw error;
		}
	}

	/**
	 * Delete a physical file from disk
	 */
	async deletePhysicalFile(internalPath: string): Promise<boolean> {
		try {
			const fullPath = path.join(this.baseStoragePath, internalPath);
			await fs.unlink(fullPath);
			return true;
		} catch (error) {
			// File might not exist
			if ((error as NodeJS.ErrnoException).code !== 'ENOENT') {
				console.error('Failed to delete physical file:', error);
			}
			return false;
		}
	}

	/**
	 * Delete variant files (thumbnails, optimized versions)
	 */
	async deleteVariantFiles(variants: string | null): Promise<void> {
		if (!variants) return;

		try {
			const variantsObj = JSON.parse(variants);
			for (const key of Object.keys(variantsObj)) {
				const variant = variantsObj[key];
				if (variant?.path) {
					await this.deletePhysicalFile(variant.path);
				}
			}
		} catch {
			// Ignore parsing errors
		}
	}

	/**
	 * Purge soft-deleted files after retention period
	 */
	async purgeDeletedFiles(): Promise<CleanupResult> {
		const errors: string[] = [];
		let deletedCount = 0;
		let freedBytes = 0;

		try {
			const cutoffDate = new Date();
			cutoffDate.setDate(cutoffDate.getDate() - this.deletionRetentionDays);

			// Find files to purge
			const filesToPurge = await db
				.select()
				.from(fileStorage)
				.where(
					and(eq(fileStorage.isActive, false), lt(fileStorage.deletedAt, cutoffDate))
				);

			for (const file of filesToPurge) {
				try {
					// Check if other records use the same physical file
					const otherRefs = await db
						.select({ id: fileStorage.id })
						.from(fileStorage)
						.where(
							and(
								eq(fileStorage.hash, file.hash),
								eq(fileStorage.isActive, true)
							)
						)
						.limit(1);

					// Only delete physical file if no other references exist
					if (otherRefs.length === 0) {
						await this.deletePhysicalFile(file.internalPath);
						await this.deleteVariantFiles(file.variants);
						freedBytes += file.size;
					}

					// Delete database record
					await db.delete(fileStorage).where(eq(fileStorage.id, file.id));
					deletedCount++;
				} catch (error) {
					errors.push(`Failed to purge file ${file.id}: ${error}`);
				}
			}

			return { success: true, deletedCount, freedBytes, errors };
		} catch (error) {
			console.error('Failed to purge deleted files:', error);
			return {
				success: false,
				deletedCount,
				freedBytes,
				errors: [...errors, `Purge operation failed: ${error}`]
			};
		}
	}

	/**
	 * Purge orphaned files after retention period
	 */
	async purgeOrphanedFiles(): Promise<CleanupResult> {
		const errors: string[] = [];
		let deletedCount = 0;
		let freedBytes = 0;

		try {
			const cutoffDate = new Date();
			cutoffDate.setDate(cutoffDate.getDate() - this.orphanRetentionDays);

			// Find orphaned files to purge
			const filesToPurge = await db
				.select()
				.from(fileStorage)
				.where(
					and(
						eq(fileStorage.isOrphan, true),
						eq(fileStorage.isActive, true),
						lt(fileStorage.markedForDeletionAt, cutoffDate)
					)
				);

			for (const file of filesToPurge) {
				try {
					// Check if other records use the same physical file
					const otherRefs = await db
						.select({ id: fileStorage.id })
						.from(fileStorage)
						.where(
							and(
								eq(fileStorage.hash, file.hash),
								eq(fileStorage.isActive, true),
								sql`${fileStorage.id} != ${file.id}`
							)
						)
						.limit(1);

					// Only delete physical file if no other references exist
					if (otherRefs.length === 0) {
						await this.deletePhysicalFile(file.internalPath);
						await this.deleteVariantFiles(file.variants);
						freedBytes += file.size;
					}

					// Delete database record
					await db.delete(fileStorage).where(eq(fileStorage.id, file.id));
					deletedCount++;
				} catch (error) {
					errors.push(`Failed to purge orphan ${file.id}: ${error}`);
				}
			}

			return { success: true, deletedCount, freedBytes, errors };
		} catch (error) {
			console.error('Failed to purge orphaned files:', error);
			return {
				success: false,
				deletedCount,
				freedBytes,
				errors: [...errors, `Purge operation failed: ${error}`]
			};
		}
	}

	/**
	 * Run full cleanup: detect orphans, purge deleted, purge orphans
	 */
	async runFullCleanup(): Promise<{
		orphanDetection: OrphanDetectionResult;
		deletedPurge: CleanupResult;
		orphanPurge: CleanupResult;
	}> {
		console.log('[FileCleanup] Starting full cleanup...');

		// Detect and mark orphans
		const orphanDetection = await this.detectOrphanedFiles();
		if (orphanDetection.orphansFound > 0) {
			await this.markAsOrphans(orphanDetection.orphanIds);
			console.log(`[FileCleanup] Marked ${orphanDetection.orphansFound} orphaned files`);
		}

		// Purge deleted files
		const deletedPurge = await this.purgeDeletedFiles();
		console.log(
			`[FileCleanup] Purged ${deletedPurge.deletedCount} deleted files, freed ${deletedPurge.freedBytes} bytes`
		);

		// Purge orphaned files
		const orphanPurge = await this.purgeOrphanedFiles();
		console.log(
			`[FileCleanup] Purged ${orphanPurge.deletedCount} orphaned files, freed ${orphanPurge.freedBytes} bytes`
		);

		console.log('[FileCleanup] Full cleanup completed');

		return { orphanDetection, deletedPurge, orphanPurge };
	}

	/**
	 * Restore a soft-deleted file
	 */
	async restoreFile(fileId: string): Promise<boolean> {
		try {
			await db
				.update(fileStorage)
				.set({
					isActive: true,
					deletedAt: null,
					markedForDeletionAt: null
				})
				.where(eq(fileStorage.id, fileId));
			return true;
		} catch (error) {
			console.error('Failed to restore file:', error);
			return false;
		}
	}

	/**
	 * Unmark a file as orphan
	 */
	async unmarkOrphan(fileId: string): Promise<boolean> {
		try {
			await db
				.update(fileStorage)
				.set({
					isOrphan: false,
					markedForDeletionAt: null
				})
				.where(eq(fileStorage.id, fileId));
			return true;
		} catch (error) {
			console.error('Failed to unmark orphan:', error);
			return false;
		}
	}
}

// Singleton instance
export const fileCleanupService = new FileCleanupService();
export default FileCleanupService;
