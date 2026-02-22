import { db } from '$lib/server/db';
import { fileStorage } from '$lib/server/db/schema';
import { eq, and } from 'drizzle-orm';
import { imageProcessor } from './ImageProcessor';

export interface BatchResult {
	processed: number;
	succeeded: number;
	failed: number;
	errors: string[];
}

/**
 * ImageProcessingQueue - Manages background processing of images
 */
class ImageProcessingQueue {
	private batchSize: number;
	private isProcessing: boolean;

	constructor() {
		this.batchSize = 5;
		this.isProcessing = false;
	}

	/**
	 * Get files pending processing
	 */
	async getPendingFiles(limit?: number): Promise<{ id: string; mimeType: string }[]> {
		try {
			const files = await db
				.select({
					id: fileStorage.id,
					mimeType: fileStorage.mimeType
				})
				.from(fileStorage)
				.where(
					and(eq(fileStorage.processingStatus, 'pending'), eq(fileStorage.isActive, true))
				)
				.limit(limit || this.batchSize);

			return files;
		} catch (error) {
			console.error('Failed to get pending files:', error);
			return [];
		}
	}

	/**
	 * Process a single file
	 */
	async processFile(fileId: string): Promise<{ success: boolean; error?: string }> {
		try {
			// Check if file is processable image
			const files = await db
				.select()
				.from(fileStorage)
				.where(eq(fileStorage.id, fileId))
				.limit(1);

			if (files.length === 0) {
				return { success: false, error: 'File not found' };
			}

			const file = files[0];

			// If not an image, just mark as completed
			if (!imageProcessor.isProcessableImage(file.mimeType)) {
				await db
					.update(fileStorage)
					.set({ processingStatus: 'completed' })
					.where(eq(fileStorage.id, fileId));
				return { success: true };
			}

			// Process the image
			const result = await imageProcessor.processImage(fileId);
			return {
				success: result.success,
				error: result.error
			};
		} catch (error) {
			console.error(`Failed to process file ${fileId}:`, error);
			return {
				success: false,
				error: error instanceof Error ? error.message : 'Unknown error'
			};
		}
	}

	/**
	 * Process a batch of pending files
	 */
	async processBatch(): Promise<BatchResult> {
		// Prevent concurrent processing
		if (this.isProcessing) {
			return {
				processed: 0,
				succeeded: 0,
				failed: 0,
				errors: ['Processing already in progress']
			};
		}

		this.isProcessing = true;
		const errors: string[] = [];
		let processed = 0;
		let succeeded = 0;
		let failed = 0;

		try {
			const pendingFiles = await this.getPendingFiles();

			if (pendingFiles.length === 0) {
				return { processed: 0, succeeded: 0, failed: 0, errors: [] };
			}

			console.log(`[ImageQueue] Processing batch of ${pendingFiles.length} files`);

			for (const file of pendingFiles) {
				processed++;
				const result = await this.processFile(file.id);

				if (result.success) {
					succeeded++;
				} else {
					failed++;
					if (result.error) {
						errors.push(`${file.id}: ${result.error}`);
					}
				}
			}

			console.log(`[ImageQueue] Batch complete: ${succeeded} succeeded, ${failed} failed`);
		} catch (error) {
			console.error('[ImageQueue] Batch processing failed:', error);
			errors.push(`Batch error: ${error}`);
		} finally {
			this.isProcessing = false;
		}

		return { processed, succeeded, failed, errors };
	}

	/**
	 * Get processing status
	 */
	getStatus(): { isProcessing: boolean; batchSize: number } {
		return {
			isProcessing: this.isProcessing,
			batchSize: this.batchSize
		};
	}

	/**
	 * Set batch size
	 */
	setBatchSize(size: number): void {
		this.batchSize = Math.max(1, Math.min(size, 20)); // Clamp between 1-20
	}

	/**
	 * Requeue failed files for reprocessing
	 */
	async requeueFailedFiles(): Promise<number> {
		try {
			const result = await db
				.update(fileStorage)
				.set({ processingStatus: 'pending' })
				.where(
					and(eq(fileStorage.processingStatus, 'error'), eq(fileStorage.isActive, true))
				);

			// SQLite doesn't return count easily, count separately
			const count = await db
				.select({ id: fileStorage.id })
				.from(fileStorage)
				.where(
					and(eq(fileStorage.processingStatus, 'pending'), eq(fileStorage.isActive, true))
				);

			return count.length;
		} catch (error) {
			console.error('Failed to requeue files:', error);
			return 0;
		}
	}

	/**
	 * Get processing statistics
	 */
	async getStats(): Promise<{
		pending: number;
		processing: number;
		completed: number;
		failed: number;
	}> {
		try {
			const pending = await db
				.select({ id: fileStorage.id })
				.from(fileStorage)
				.where(
					and(eq(fileStorage.processingStatus, 'pending'), eq(fileStorage.isActive, true))
				);

			const completed = await db
				.select({ id: fileStorage.id })
				.from(fileStorage)
				.where(
					and(eq(fileStorage.processingStatus, 'completed'), eq(fileStorage.isActive, true))
				);

			const failed = await db
				.select({ id: fileStorage.id })
				.from(fileStorage)
				.where(
					and(eq(fileStorage.processingStatus, 'error'), eq(fileStorage.isActive, true))
				);

			return {
				pending: pending.length,
				processing: this.isProcessing ? 1 : 0,
				completed: completed.length,
				failed: failed.length
			};
		} catch (error) {
			console.error('Failed to get stats:', error);
			return { pending: 0, processing: 0, completed: 0, failed: 0 };
		}
	}
}

// Singleton instance
export const imageProcessingQueue = new ImageProcessingQueue();
export default ImageProcessingQueue;
