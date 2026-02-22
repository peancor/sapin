import { db } from '$lib/server/db';
import {
	fileStorage,
	courseRole,
	user,
	userInteractiveLearningChat,
	interactiveLearningChat,
	courseInteractiveLearning,
	userRoleAssignment,
	role
} from '$lib/server/db/schema';
import { ROLE_LEVELS } from '$lib/server/roles';
import type { FileStorage } from '$lib/server/db/schema';
import { eq, and } from 'drizzle-orm';

export interface PermissionCheckResult {
	allowed: boolean;
	reason?: string;
}

/**
 * FilePermissionMiddleware - Handles file access permissions
 * Implements category-based permission rules
 */
class FilePermissionMiddleware {
	/**
	 * Check if a user has permission to access a file
	 * @param fileId - File ID
	 * @param userId - User ID (null for anonymous users)
	 * @param action - Action to perform (read, write, delete)
	 * @returns Permission check result
	 */
	async checkPermission(
		fileId: string,
		userId: string | null,
		action: 'read' | 'write' | 'delete' = 'read'
	): Promise<PermissionCheckResult> {
		try {
			// Get file from database
			const files = await db
				.select()
				.from(fileStorage)
				.where(and(eq(fileStorage.id, fileId), eq(fileStorage.isActive, true)))
				.limit(1);

			if (files.length === 0) {
				return { allowed: false, reason: 'File not found' };
			}

			const file = files[0];

			// Public files are always readable
			if (file.visibility === 'public' && action === 'read') {
				return { allowed: true };
			}

			// Anonymous users can only access public files
			if (!userId) {
				return { allowed: false, reason: 'Authentication required' };
			}

			// Get user info
			const users = await db.select().from(user).where(eq(user.id, userId)).limit(1);
			if (users.length === 0) {
				return { allowed: false, reason: 'User not found' };
			}

			const currentUser = users[0];

			// Check if user has admin level in the new role system
			const adminLevel = await this.getUserHighestRoleLevel(userId);
			
			// Admins have full access to all files (level >= 90)
			if (adminLevel >= ROLE_LEVELS.ADMIN) {
				return { allowed: true };
			}

			// File uploader always has access
			if (file.uploadedBy === userId) {
				return { allowed: true };
			}

			// Check category-specific permissions
			switch (file.category) {
				case 'avatar':
					return this.checkAvatarPermission(file, userId, action);

				case 'course':
					return this.checkCoursePermission(file, userId, action);

				case 'chat':
					return this.checkChatPermission(file, userId, action);

				case 'rag_document':
					return this.checkRagDocumentPermission(file, userId, action);

				case 'public':
					return this.checkPublicPermission(file, userId, action);

				default:
					return { allowed: false, reason: 'Unknown file category' };
			}
		} catch (error) {
			console.error('Permission check failed:', error);
			return { allowed: false, reason: 'Permission check failed' };
		}
	}

	/**
	 * Check avatar file permissions
	 * Rule: Public files are accessible by everyone
	 */
	private async checkAvatarPermission(
		file: FileStorage,
		userId: string,
		action: string
	): Promise<PermissionCheckResult> {
		// Avatars are usually public, already handled above
		// For write/delete, only owner can modify
		if (action !== 'read') {
			if (file.entityId === userId) {
				return { allowed: true };
			}
			return { allowed: false, reason: 'Only the owner can modify this avatar' };
		}

		return { allowed: true };
	}

	/**
	 * Check course file permissions
	 * Rule: User must have a role in the course
	 */
	private async checkCoursePermission(
		file: FileStorage,
		userId: string,
		action: string
	): Promise<PermissionCheckResult> {
		const courseId = file.entityId;

		// Check if user has a course role
		const userCourseRole = await db
			.select()
			.from(courseRole)
			.where(
				and(
					eq(courseRole.courseId, courseId),
					eq(courseRole.userId, userId),
					eq(courseRole.isActive, true)
				)
			)
			.limit(1);

		if (userCourseRole.length > 0) {
			const userRole = userCourseRole[0].role;
			// Teachers and above can write/delete
			if (action !== 'read' && ['owner', 'admin', 'teacher'].includes(userRole)) {
				return { allowed: true };
			}
			// All course roles can read
			return { allowed: true };
		}

		return { allowed: false, reason: 'User does not have access to this course' };
	}

	/**
	 * Check chat file permissions
	 * Rule: User must have access to the interactive learning chat
	 */
	private async checkChatPermission(
		file: FileStorage,
		userId: string,
		action: string
	): Promise<PermissionCheckResult> {
		const chatId = file.entityId;

		// Check if user has access to this interactive learning chat
		const userChat = await db
			.select()
			.from(userInteractiveLearningChat)
			.where(
				and(
					eq(userInteractiveLearningChat.userId, userId),
					eq(userInteractiveLearningChat.interactiveLearningChatId, chatId)
				)
			)
			.limit(1);

		if (userChat.length > 0) {
			return { allowed: true };
		}

		// Also check if user is a teacher of the course that contains this chat
		const chatData = await db
			.select()
			.from(interactiveLearningChat)
			.where(eq(interactiveLearningChat.id, chatId))
			.limit(1);

		if (chatData.length === 0) {
			return { allowed: false, reason: 'Chat not found' };
		}

		// El id del chat ES el interactiveLearningId (patrón de herencia 1:1)
		const interactiveLearningId = chatData[0].id;

		// Get course that contains this interactive learning
		const courseInteractive = await db
			.select()
			.from(courseInteractiveLearning)
			.where(eq(courseInteractiveLearning.interactiveLearningId, interactiveLearningId))
			.limit(1);

		if (courseInteractive.length === 0) {
			return { allowed: false, reason: 'Associated course not found' };
		}

		const courseId = courseInteractive[0].courseId;

		// Check if user has a teacher-level course role
		const userCourseRole = await db
			.select()
			.from(courseRole)
			.where(
				and(
					eq(courseRole.courseId, courseId),
					eq(courseRole.userId, userId),
					eq(courseRole.isActive, true)
				)
			)
			.limit(1);

		if (userCourseRole.length > 0) {
			const userRole = userCourseRole[0].role;
			if (['owner', 'admin', 'teacher'].includes(userRole)) {
				return { allowed: true };
			}
		}

		return { allowed: false, reason: 'User does not have access to this chat' };
	}

	/**
	 * Check RAG document permissions
	 * Rule: Only uploader, teachers of the associated course, or admins
	 */
	private async checkRagDocumentPermission(
		file: FileStorage,
		userId: string,
		action: string
	): Promise<PermissionCheckResult> {
		// RAG documents are private by default
		// Already checked: uploader and admin have access

		const chatId = file.entityId;

		// Get the interactive learning chat
		const chatData = await db
			.select()
			.from(interactiveLearningChat)
			.where(eq(interactiveLearningChat.id, chatId))
			.limit(1);

		if (chatData.length === 0) {
			return { allowed: false, reason: 'Associated chat not found' };
		}

		// El id del chat ES el interactiveLearningId (patrón de herencia 1:1)
		const interactiveLearningId = chatData[0].id;

		// Get course that contains this interactive learning
		const courseInteractive = await db
			.select()
			.from(courseInteractiveLearning)
			.where(eq(courseInteractiveLearning.interactiveLearningId, interactiveLearningId))
			.limit(1);

		if (courseInteractive.length === 0) {
			return { allowed: false, reason: 'Associated course not found' };
		}

		const courseId = courseInteractive[0].courseId;

		// Check if user has a teacher-level course role
		const userCourseRole = await db
			.select()
			.from(courseRole)
			.where(
				and(
					eq(courseRole.courseId, courseId),
					eq(courseRole.userId, userId),
					eq(courseRole.isActive, true)
				)
			)
			.limit(1);

		if (userCourseRole.length > 0) {
			const userRole = userCourseRole[0].role;
			if (['owner', 'admin', 'teacher'].includes(userRole)) {
				return { allowed: true };
			}
		}

		return { allowed: false, reason: 'Only teachers can access RAG documents' };
	}

	/**
	 * Check public file permissions
	 * Rule: Anyone can read, only authenticated users can upload, only uploader/admin can delete
	 */
	private async checkPublicPermission(
		file: FileStorage,
		userId: string,
		action: string
	): Promise<PermissionCheckResult> {
		// Public files are always readable
		if (action === 'read') {
			return { allowed: true };
		}

		// For write/delete actions, must be authenticated
		if (!userId) {
			return { allowed: false, reason: 'Authentication required to modify public files' };
		}

		// Uploader can always modify their own files (already checked in parent)
		// This is just a fallback
		return { allowed: true };
	}

	/**
	 * Batch permission check for multiple files
	 */
	async checkMultiplePermissions(
		fileIds: string[],
		userId: string | null,
		action: 'read' | 'write' | 'delete' = 'read'
	): Promise<Map<string, PermissionCheckResult>> {
		const results = new Map<string, PermissionCheckResult>();

		for (const fileId of fileIds) {
			const result = await this.checkPermission(fileId, userId, action);
			results.set(fileId, result);
		}

		return results;
	}

	/**
	 * Get user's highest role level from the new role system
	 */
	private async getUserHighestRoleLevel(userId: string): Promise<number> {
		const userRoles = await db
			.select({ level: role.level })
			.from(userRoleAssignment)
			.innerJoin(role, eq(userRoleAssignment.roleId, role.id))
			.where(
				and(
					eq(userRoleAssignment.userId, userId),
					eq(userRoleAssignment.isActive, true),
					eq(role.isActive, true)
				)
			);

		if (userRoles.length === 0) return 0;
		return Math.max(...userRoles.map(r => r.level));
	}
}

// Singleton instance
export const filePermissionMiddleware = new FilePermissionMiddleware();
export default FilePermissionMiddleware;
