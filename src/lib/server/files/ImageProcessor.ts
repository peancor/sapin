import sharp from 'sharp';
import { db } from '$lib/server/db';
import { fileStorage } from '$lib/server/db/schema';
import { eq } from 'drizzle-orm';
import fs from 'fs/promises';
import path from 'path';
import { env } from '$env/dynamic/private';

export interface ImageVariant {
	path: string;
	width: number;
	height: number;
	size: number;
	mimeType: string;
}

export interface ImageVariants {
	thumbnail?: ImageVariant;
	optimized?: ImageVariant;
}

export interface ProcessingResult {
	success: boolean;
	variants?: ImageVariants;
	error?: string;
}

// Supported image MIME types for processing
const PROCESSABLE_MIME_TYPES = [
	'image/jpeg',
	'image/jpg',
	'image/png',
	'image/webp',
	'image/gif',
	'image/avif',
	'image/tiff'
];

/**
 * ImageProcessor - Handles image optimization and thumbnail generation
 */
class ImageProcessor {
	private baseStoragePath: string;
	private thumbnailSize: number;
	private maxOptimizedWidth: number;
	private quality: number;

	constructor() {
		const storagePath = env.FILES_STORAGE_PATH || 'uploads/files';
		this.baseStoragePath = path.isAbsolute(storagePath)
			? storagePath
			: path.join(process.cwd(), storagePath);
		this.thumbnailSize = 200;
		this.maxOptimizedWidth = 2048;
		this.quality = 85;
	}

	/**
	 * Check if the MIME type is a processable image
	 */
	isProcessableImage(mimeType: string): boolean {
		return PROCESSABLE_MIME_TYPES.includes(mimeType.toLowerCase());
	}

	/**
	 * Generate a thumbnail for an image
	 */
	async generateThumbnail(
		inputPath: string,
		outputPath: string
	): Promise<{ width: number; height: number; size: number }> {
		await this.ensureDirectory(path.dirname(outputPath));

		const result = await sharp(inputPath)
			.resize(this.thumbnailSize, this.thumbnailSize, {
				fit: 'cover',
				position: 'center'
			})
			.webp({ quality: 80 })
			.toFile(outputPath);

		return {
			width: result.width,
			height: result.height,
			size: result.size
		};
	}

	/**
	 * Optimize an image (resize if too large, convert to webp)
	 */
	async optimizeImage(
		inputPath: string,
		outputPath: string
	): Promise<{ width: number; height: number; size: number } | null> {
		await this.ensureDirectory(path.dirname(outputPath));

		// Get original image metadata
		const metadata = await sharp(inputPath).metadata();

		// Only optimize if image is larger than max width
		if (metadata.width && metadata.width <= this.maxOptimizedWidth) {
			return null; // No optimization needed
		}

		const result = await sharp(inputPath)
			.resize(this.maxOptimizedWidth, null, {
				fit: 'inside',
				withoutEnlargement: true
			})
			.webp({ quality: this.quality })
			.toFile(outputPath);

		return {
			width: result.width,
			height: result.height,
			size: result.size
		};
	}

	/**
	 * Get variant paths based on the original file path
	 */
	private getVariantPaths(
		internalPath: string,
		hash: string
	): { thumbnailPath: string; optimizedPath: string } {
		const dir = path.dirname(internalPath);
		return {
			thumbnailPath: path.join(dir, `${hash}_thumb.webp`),
			optimizedPath: path.join(dir, `${hash}_opt.webp`)
		};
	}

	/**
	 * Process an image file - generate thumbnail and optimize
	 */
	async processImage(fileId: string): Promise<ProcessingResult> {
		try {
			// Get file record
			const files = await db
				.select()
				.from(fileStorage)
				.where(eq(fileStorage.id, fileId))
				.limit(1);

			if (files.length === 0) {
				return { success: false, error: 'File not found' };
			}

			const file = files[0];

			// Check if processable
			if (!this.isProcessableImage(file.mimeType)) {
				// Mark as completed (nothing to process)
				await db
					.update(fileStorage)
					.set({ processingStatus: 'completed' })
					.where(eq(fileStorage.id, fileId));

				return { success: true, variants: {} };
			}

			// Get paths
			const inputPath = path.join(this.baseStoragePath, file.internalPath);
			const { thumbnailPath, optimizedPath } = this.getVariantPaths(file.internalPath, file.hash);

			const fullThumbnailPath = path.join(this.baseStoragePath, thumbnailPath);
			const fullOptimizedPath = path.join(this.baseStoragePath, optimizedPath);

			// Check if input file exists
			try {
				await fs.access(inputPath);
			} catch {
				return { success: false, error: 'Source file not found on disk' };
			}

			const variants: ImageVariants = {};

			// Generate thumbnail
			try {
				const thumbResult = await this.generateThumbnail(inputPath, fullThumbnailPath);
				variants.thumbnail = {
					path: thumbnailPath,
					width: thumbResult.width,
					height: thumbResult.height,
					size: thumbResult.size,
					mimeType: 'image/webp'
				};
			} catch (error) {
				console.error('Failed to generate thumbnail:', error);
			}

			// Optimize image (only if large)
			try {
				const optResult = await this.optimizeImage(inputPath, fullOptimizedPath);
				if (optResult) {
					variants.optimized = {
						path: optimizedPath,
						width: optResult.width,
						height: optResult.height,
						size: optResult.size,
						mimeType: 'image/webp'
					};
				}
			} catch (error) {
				console.error('Failed to optimize image:', error);
			}

			// Update database record
			await db
				.update(fileStorage)
				.set({
					processingStatus: 'completed',
					variants: JSON.stringify(variants)
				})
				.where(eq(fileStorage.id, fileId));

			return { success: true, variants };
		} catch (error) {
			console.error('Image processing failed:', error);

			// Mark as failed in database
			try {
				await db
					.update(fileStorage)
					.set({ processingStatus: 'error' })
					.where(eq(fileStorage.id, fileId));
			} catch {
				// Ignore update error
			}

			return {
				success: false,
				error: error instanceof Error ? error.message : 'Unknown error'
			};
		}
	}

	/**
	 * Generate thumbnail on-the-fly (for files that don't have one)
	 */
	async generateThumbnailOnTheFly(fileId: string): Promise<Buffer | null> {
		try {
			const files = await db
				.select()
				.from(fileStorage)
				.where(eq(fileStorage.id, fileId))
				.limit(1);

			if (files.length === 0) {
				return null;
			}

			const file = files[0];

			if (!this.isProcessableImage(file.mimeType)) {
				return null;
			}

			const inputPath = path.join(this.baseStoragePath, file.internalPath);

			// Generate thumbnail to buffer (not saved to disk)
			const thumbnailBuffer = await sharp(inputPath)
				.resize(this.thumbnailSize, this.thumbnailSize, {
					fit: 'cover',
					position: 'center'
				})
				.webp({ quality: 80 })
				.toBuffer();

			return thumbnailBuffer;
		} catch (error) {
			console.error('On-the-fly thumbnail generation failed:', error);
			return null;
		}
	}

	/**
	 * Get thumbnail from variants or generate on-the-fly
	 */
	async getThumbnail(fileId: string): Promise<{ buffer: Buffer; path?: string } | null> {
		try {
			const files = await db
				.select()
				.from(fileStorage)
				.where(eq(fileStorage.id, fileId))
				.limit(1);

			if (files.length === 0) {
				return null;
			}

			const file = files[0];

			// Try to get from variants
			if (file.variants) {
				try {
					const variants: ImageVariants = JSON.parse(file.variants);
					if (variants.thumbnail) {
						const thumbnailPath = path.join(this.baseStoragePath, variants.thumbnail.path);
						const buffer = await fs.readFile(thumbnailPath);
						return { buffer, path: variants.thumbnail.path };
					}
				} catch {
					// Variants parsing failed, generate on-the-fly
				}
			}

			// Generate on-the-fly
			const buffer = await this.generateThumbnailOnTheFly(fileId);
			if (buffer) {
				return { buffer };
			}

			return null;
		} catch (error) {
			console.error('Failed to get thumbnail:', error);
			return null;
		}
	}

	/**
	 * Ensure directory exists
	 */
	private async ensureDirectory(dirPath: string): Promise<void> {
		try {
			await fs.mkdir(dirPath, { recursive: true });
		} catch (error) {
			// Directory might already exist
		}
	}
}

// Singleton instance
export const imageProcessor = new ImageProcessor();
export default ImageProcessor;
