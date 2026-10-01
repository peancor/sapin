import { db } from '$lib/server/db';
import { fileStorage, fileAccessLog } from '$lib/server/db/schema';
import type { FileStorage } from '$lib/server/db/schema';
import { eq, and, sql } from 'drizzle-orm';
import { nanoid } from 'nanoid';
import { createHash } from 'crypto';
import fs from 'fs/promises';
import path from 'path';
import { fileSystemSettings } from './FileSystemSettings';
import { env } from '$env/dynamic/private';
import { imageProcessor } from './ImageProcessor';

export interface UploadFileOptions {
	file: File;
	category: 'avatar' | 'course' | 'chat' | 'rag_document' | 'public';
	entityType: 'user' | 'course' | 'interactive_learning' | 'interactive_learning_chat' | 'system';
	entityId: string;
	uploadedBy: string;
	displayName?: string;
	visibility?: 'public' | 'private' | 'restricted';
}

export interface UploadResult {
	success: boolean;
	fileId?: string;
	file?: FileStorage;
	error?: string;
	isDuplicate?: boolean;
}

/**
 * FileStorageService - Core service for file management
 * Handles upload, download, delete, validation, and deduplication
 */
class FileStorageService {
	private baseStoragePath: string;

	constructor() {
		// Base path for file storage (configurable via FILES_STORAGE_PATH env var)
		const storagePath = env.FILES_STORAGE_PATH || 'uploads/files';
		this.baseStoragePath = path.isAbsolute(storagePath)
			? storagePath
			: path.join(process.cwd(), storagePath);
	}

	/**
	 * Calculate SHA-256 hash of a file
	 */
	private async calculateHash(buffer: Buffer): Promise<string> {
		const hash = createHash('sha256');
		hash.update(buffer);
		return hash.digest('hex');
	}

	/**
	 * Get internal storage path based on hash
	 * Uses 2+2 character prefix for directory sharding
	 */
	private getInternalPath(hash: string, originalName: string): string {
		const ext = path.extname(originalName);
		const prefix1 = hash.substring(0, 2);
		const prefix2 = hash.substring(2, 4);
		return path.join(prefix1, prefix2, `${hash}${ext}`);
	}

	/**
	 * Ensure directory exists
	 */
	private async ensureDirectory(dirPath: string): Promise<void> {
		try {
			await fs.mkdir(dirPath, { recursive: true });
		} catch (error) {
			console.error('Failed to create directory:', error);
			throw error;
		}
	}

	/**
	 * Validate file against category constraints
	 */
	private async validateFile(
		file: File,
		category: string
	): Promise<{ valid: boolean; error?: string }> {
		// Check if validation is enabled
		const validationEnabled = await fileSystemSettings.isValidationEnabled();
		if (!validationEnabled) {
			return { valid: true };
		}

		// Check file size
		const maxSize = await fileSystemSettings.getMaxSize(category);
		if (file.size > maxSize) {
			return {
				valid: false,
				error: `File size exceeds maximum allowed size of ${maxSize / 1024 / 1024}MB`
			};
		}

		// Check MIME type
		const allowedTypes = await fileSystemSettings.getAllowedTypes(category);
		const isAllowed = allowedTypes.some((type) => {
			if (type.endsWith('/*')) {
				const baseType = type.split('/')[0];
				return file.type.startsWith(baseType + '/');
			}
			return file.type === type;
		});

		if (!isAllowed) {
			return {
				valid: false,
				error: `File type ${file.type} is not allowed for category ${category}`
			};
		}

		return { valid: true };
	}

	/**
	 * Check if file with same hash already exists (deduplication)
	 */
	private async checkDuplicate(hash: string): Promise<FileStorage | null> {
		try {
			const existing = await db
				.select()
				.from(fileStorage)
				.where(and(eq(fileStorage.hash, hash), eq(fileStorage.isActive, true)))
				.limit(1);

			return existing.length > 0 ? existing[0] : null;
		} catch (error) {
			console.error('Failed to check for duplicate:', error);
			return null;
		}
	}

	/**
	 * Upload a file to storage
	 */
	async upload(options: UploadFileOptions): Promise<UploadResult> {
		const { file, category, entityType, entityId, uploadedBy, displayName, visibility } = options;

		try {
			// Validate file
			const validation = await this.validateFile(file, category);
			if (!validation.valid) {
				return {
					success: false,
					error: validation.error
				};
			}

			// Read file buffer
			const buffer = Buffer.from(await file.arrayBuffer());

			// Calculate hash
			const hash = await this.calculateHash(buffer);

			// Check for duplicate
			const duplicate = await this.checkDuplicate(hash);
			if (duplicate) {
				// File already exists, create a new reference to the same physical file
				const fileId = nanoid();
				const now = new Date();

				const newRecord = await db.insert(fileStorage).values({
					id: fileId,
					name: file.name,
					displayName: displayName || file.name,
					internalPath: duplicate.internalPath,
					mimeType: file.type,
					size: file.size,
					hash,
					category,
					entityType,
					entityId,
					visibility: visibility || this.getDefaultVisibility(category),
					processingStatus: 'completed',
					uploadedBy,
					uploadedAt: now,
					isActive: true,
					isOrphan: false,
					accessCount: 0
				}).returning();

				return {
					success: true,
					fileId,
					file: newRecord[0],
					isDuplicate: true
				};
			}

			// Generate internal path
			const internalPath = this.getInternalPath(hash, file.name);
			const fullPath = path.join(this.baseStoragePath, internalPath);

			// Ensure directory exists
			await this.ensureDirectory(path.dirname(fullPath));

			// Write file to disk
			await fs.writeFile(fullPath, buffer);

			// Create database record
			const fileId = nanoid();
			const now = new Date();

			const newRecord = await db.insert(fileStorage).values({
				id: fileId,
				name: file.name,
				displayName: displayName || file.name,
				internalPath,
				mimeType: file.type,
				size: file.size,
				hash,
				category,
				entityType,
				entityId,
				visibility: visibility || this.getDefaultVisibility(category),
				processingStatus: 'pending',
				uploadedBy,
				uploadedAt: now,
				isActive: true,
				isOrphan: false,
				accessCount: 0
			}).returning();

			// Queue image processing if applicable (non-blocking)
			if (imageProcessor.isProcessableImage(file.type)) {
				// Process asynchronously - don't await
				imageProcessor.processImage(fileId).catch((err) => {
					console.error('Background image processing failed:', err);
				});
			} else {
				// Mark non-image files as completed
				await db
					.update(fileStorage)
					.set({ processingStatus: 'completed' })
					.where(eq(fileStorage.id, fileId));
			}

			return {
				success: true,
				fileId,
				file: newRecord[0]
			};
		} catch (error) {
			console.error('Failed to upload file:', error);
			return {
				success: false,
				error: error instanceof Error ? error.message : 'Unknown error occurred'
			};
		}
	}

	/**
	 * Get default visibility based on category
	 */
	private getDefaultVisibility(category: string): 'public' | 'private' | 'restricted' {
		switch (category) {
			case 'avatar':
				return 'public';
			case 'course':
				return 'restricted';
			case 'chat':
				return 'restricted';
			case 'rag_document':
				return 'private';
			case 'public':
				return 'public';
			default:
				return 'private';
		}
	}

	/**
	 * Get file by ID
	 */
	async getFile(fileId: string): Promise<FileStorage | null> {
		try {
			const result = await db
				.select()
				.from(fileStorage)
				.where(and(eq(fileStorage.id, fileId), eq(fileStorage.isActive, true)))
				.limit(1);

			return result.length > 0 ? result[0] : null;
		} catch (error) {
			console.error('Failed to get file:', error);
			return null;
		}
	}

	/**
	 * Get physical file path
	 */
	getPhysicalPath(file: FileStorage): string {
		return path.join(this.baseStoragePath, file.internalPath);
	}

	/**
	 * Update access statistics
	 */
	async updateAccessStats(fileId: string): Promise<void> {
		try {
			const now = new Date();
			await db
				.update(fileStorage)
				.set({
					lastAccessedAt: now,
					accessCount: sql`${fileStorage.accessCount} + 1`
				})
				.where(eq(fileStorage.id, fileId));
		} catch (error) {
			console.error('Failed to update access stats:', error);
		}
	}

	/**
	 * Log file access (if auditing is enabled)
	 */
	async logAccess(
		fileId: string,
		userId: string | null,
		action: string,
		success: boolean,
		ipAddress?: string,
		userAgent?: string,
		errorMessage?: string
	): Promise<void> {
		try {
			const auditEnabled = await fileSystemSettings.isAuditEnabled();
			if (!auditEnabled) {
				return;
			}

			await db.insert(fileAccessLog).values({
				id: nanoid(),
				fileId,
				userId,
				action,
				ipAddress,
				userAgent,
				success,
				errorMessage,
				createdAt: new Date()
			});
		} catch (error) {
			console.error('Failed to log access:', error);
		}
	}

	/**
	 * Soft delete a file
	 */
	async delete(fileId: string, userId: string): Promise<{ success: boolean; error?: string }> {
		try {
			const file = await this.getFile(fileId);
			if (!file) {
				return {
					success: false,
					error: 'File not found'
				};
			}

			const now = new Date();

			// Soft delete: mark as inactive and set deletedAt
			await db
				.update(fileStorage)
				.set({
					isActive: false,
					deletedAt: now,
					markedForDeletionAt: now
				})
				.where(eq(fileStorage.id, fileId));

			// Log the deletion
			await this.logAccess(fileId, userId, 'delete', true);

			return { success: true };
		} catch (error) {
			console.error('Failed to delete file:', error);
			return {
				success: false,
				error: error instanceof Error ? error.message : 'Unknown error occurred'
			};
		}
	}

	/**
	 * Mark file as orphaned
	 */
	async markAsOrphan(fileId: string): Promise<void> {
		try {
			const now = new Date();
			await db
				.update(fileStorage)
				.set({
					isOrphan: true,
					markedForDeletionAt: now
				})
				.where(eq(fileStorage.id, fileId));
		} catch (error) {
			console.error('Failed to mark file as orphan:', error);
		}
	}

	/**
	 * Get files by entity
	 */
	async getFilesByEntity(
		entityType: 'user' | 'course' | 'interactive_learning' | 'interactive_learning_chat' | 'system',
		entityId: string
	): Promise<FileStorage[]> {
		try {
			return await db
				.select()
				.from(fileStorage)
				.where(
					and(
						eq(fileStorage.entityType, entityType),
						eq(fileStorage.entityId, entityId),
						eq(fileStorage.isActive, true)
					)
				);
		} catch (error) {
			console.error('Failed to get files by entity:', error);
			return [];
		}
	}

	/**
	 * Get orphaned files
	 */
	async getOrphanedFiles(): Promise<FileStorage[]> {
		try {
			return await db
				.select()
				.from(fileStorage)
				.where(and(eq(fileStorage.isOrphan, true), eq(fileStorage.isActive, true)));
		} catch (error) {
			console.error('Failed to get orphaned files:', error);
			return [];
		}
	}
}

// Singleton instance
export const fileStorageService = new FileStorageService();
export default FileStorageService;
