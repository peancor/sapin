import { db } from '$lib/server/db';
import { fileSystemSetting } from '$lib/server/db/schema';
import { eq } from 'drizzle-orm';
import { nanoid } from 'nanoid';

/**
 * FileSystemSettings - Helper class to manage file system configuration
 * Includes in-memory cache for performance optimization
 */
class FileSystemSettings {
	private cache: Map<string, string> = new Map();
	private cacheInitialized = false;
	private cacheExpiry = 5 * 60 * 1000; // 5 minutes cache
	private lastCacheUpdate = 0;

	/**
	 * Initialize cache by loading all settings from DB
	 */
	private async initCache(): Promise<void> {
		if (this.cacheInitialized && Date.now() - this.lastCacheUpdate < this.cacheExpiry) {
			return;
		}

		try {
			const settings = await db.select().from(fileSystemSetting);
			this.cache.clear();
			settings.forEach((setting) => {
				this.cache.set(setting.key, setting.value);
			});
			this.cacheInitialized = true;
			this.lastCacheUpdate = Date.now();
		} catch (error) {
			console.error('Failed to initialize FileSystemSettings cache:', error);
			throw error;
		}
	}

	/**
	 * Get a setting value by key
	 * @param key - Setting key (e.g., 'files.cleanup.enabled')
	 * @param defaultValue - Default value if setting not found
	 * @returns Setting value as string
	 */
	async get(key: string, defaultValue?: string): Promise<string | undefined> {
		await this.initCache();

		if (this.cache.has(key)) {
			return this.cache.get(key);
		}

		// If not in cache, try to load from DB
		try {
			const result = await db
				.select()
				.from(fileSystemSetting)
				.where(eq(fileSystemSetting.key, key))
				.limit(1);

			if (result.length > 0) {
				const value = result[0].value;
				this.cache.set(key, value);
				return value;
			}
		} catch (error) {
			console.error(`Failed to get setting ${key}:`, error);
		}

		return defaultValue;
	}

	/**
	 * Get a boolean setting value
	 * @param key - Setting key
	 * @param defaultValue - Default value if setting not found
	 * @returns Boolean value
	 */
	async getBoolean(key: string, defaultValue = false): Promise<boolean> {
		const value = await this.get(key, defaultValue.toString());
		return value === 'true' || value === '1';
	}

	/**
	 * Get a number setting value
	 * @param key - Setting key
	 * @param defaultValue - Default value if setting not found
	 * @returns Number value
	 */
	async getNumber(key: string, defaultValue = 0): Promise<number> {
		const value = await this.get(key, defaultValue.toString());
		return value ? parseInt(value, 10) : defaultValue;
	}

	/**
	 * Get an array setting value (comma-separated string)
	 * @param key - Setting key
	 * @param defaultValue - Default value if setting not found
	 * @returns Array of strings
	 */
	async getArray(key: string, defaultValue: string[] = []): Promise<string[]> {
		const value = await this.get(key, defaultValue.join(','));
		return value ? value.split(',').map((v) => v.trim()) : defaultValue;
	}

	/**
	 * Set a setting value
	 * @param key - Setting key
	 * @param value - Setting value
	 * @param userId - User ID who is updating the setting (optional)
	 * @param description - Description of the setting (optional)
	 */
	async set(
		key: string,
		value: string,
		userId?: string,
		description?: string
	): Promise<void> {
		const now = new Date();

		try {
			// Check if setting exists
			const existing = await db
				.select()
				.from(fileSystemSetting)
				.where(eq(fileSystemSetting.key, key))
				.limit(1);

			if (existing.length > 0) {
				// Update existing setting
				await db
					.update(fileSystemSetting)
					.set({
						value,
						updatedBy: userId,
						updatedAt: now
					})
					.where(eq(fileSystemSetting.key, key));
			} else {
				// Insert new setting
				await db.insert(fileSystemSetting).values({
					id: nanoid(),
					key,
					value,
					description,
					updatedBy: userId,
					createdAt: now,
					updatedAt: now
				});
			}

			// Update cache
			this.cache.set(key, value);
		} catch (error) {
			console.error(`Failed to set setting ${key}:`, error);
			throw error;
		}
	}

	/**
	 * Delete a setting
	 * @param key - Setting key
	 */
	async delete(key: string): Promise<void> {
		try {
			await db.delete(fileSystemSetting).where(eq(fileSystemSetting.key, key));
			this.cache.delete(key);
		} catch (error) {
			console.error(`Failed to delete setting ${key}:`, error);
			throw error;
		}
	}

	/**
	 * Get all settings
	 * @returns Map of all settings
	 */
	async getAll(): Promise<Map<string, string>> {
		await this.initCache();
		return new Map(this.cache);
	}

	/**
	 * Clear cache (useful for testing or forcing reload)
	 */
	clearCache(): void {
		this.cache.clear();
		this.cacheInitialized = false;
		this.lastCacheUpdate = 0;
	}

	/**
	 * Check if cleanup is enabled
	 */
	async isCleanupEnabled(): Promise<boolean> {
		return this.getBoolean('files.cleanup.enabled', true);
	}

	/**
	 * Check if validation is enabled
	 */
	async isValidationEnabled(): Promise<boolean> {
		return this.getBoolean('files.validation.enabled', true);
	}

	/**
	 * Check if optimization is enabled
	 */
	async isOptimizationEnabled(): Promise<boolean> {
		return this.getBoolean('files.optimization.enabled', true);
	}

	/**
	 * Check if audit logging is enabled
	 */
	async isAuditEnabled(): Promise<boolean> {
		return this.getBoolean('files.audit.enabled', false);
	}

	/**
	 * Get maximum file size for a category
	 * @param category - File category (avatar, course, chat, lesson, rag_document)
	 * @returns Maximum size in bytes
	 */
	async getMaxSize(category: string): Promise<number> {
		const key = `files.max_size.${category}`;
		const defaults: Record<string, number> = {
			avatar: 2 * 1024 * 1024, // 2MB
			course: 50 * 1024 * 1024, // 50MB
			chat: 10 * 1024 * 1024, // 10MB
			lesson: 50 * 1024 * 1024, // 50MB
			rag_document: 50 * 1024 * 1024, // 50MB
			public: 20 * 1024 * 1024 // 20MB
		};
		return this.getNumber(key, defaults[category] || 10 * 1024 * 1024);
	}

	/**
	 * Get allowed MIME types for a category
	 * @param category - File category
	 * @returns Array of allowed MIME types
	 */
	async getAllowedTypes(category: string): Promise<string[]> {
		const key = `files.allowed_types.${category}`;
		const defaults: Record<string, string[]> = {
			avatar: ['image/jpeg', 'image/png', 'image/webp', 'image/gif'],
			course: [
				'application/pdf',
				'image/*',
				'video/*',
				'application/msword',
				'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
			],
			chat: ['image/*', 'application/pdf', 'text/*'],
			lesson: ['image/*', 'application/pdf', 'text/*', 'video/*', 'audio/*'],
			rag_document: [
				'application/pdf',
				'text/plain',
				'application/msword',
				'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
			],
			public: [
				'image/*',
				'application/pdf',
				'text/*',
				'application/msword',
				'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
				'video/*',
				'audio/*'
			]
		};
		return this.getArray(key, defaults[category] || []);
	}

	/**
	 * Get image optimization quality
	 */
	async getOptimizationQuality(): Promise<number> {
		return this.getNumber('files.optimization.quality', 85);
	}

	/**
	 * Get thumbnail size
	 */
	async getThumbnailSize(): Promise<number> {
		return this.getNumber('files.optimization.thumbnail_size', 200);
	}

	/**
	 * Get maximum image width
	 */
	async getMaxImageWidth(): Promise<number> {
		return this.getNumber('files.optimization.max_width', 2048);
	}

	/**
	 * Get number of days before orphaned files are deleted
	 */
	async getOrphanRetentionDays(): Promise<number> {
		return this.getNumber('files.cleanup.orphan_days', 30);
	}

	/**
	 * Get number of days to keep deleted files
	 */
	async getDeletedRetentionDays(): Promise<number> {
		return this.getNumber('files.cleanup.deleted_retention_days', 7);
	}
}

// Singleton instance
export const fileSystemSettings = new FileSystemSettings();
export default FileSystemSettings;
