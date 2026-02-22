import { z } from 'zod';
import { db } from './index';
import { invite, course, user, courseRoleType, inviteType } from './schema';
import { eq, and, desc, sql, or, gt, isNull } from 'drizzle-orm';
import { nanoid } from 'nanoid';
import { sn } from '$lib/server/sn';
import type { InviteConfig, InviteType } from './schema/courses';
import CourseRoleUtils from './CourseRoleUtils';
import RoleUtils from './RoleUtils';

// ============================================
// ZOD SCHEMAS FOR INVITE CONFIG VALIDATION
// ============================================

export const inviteConfigSchema = z.discriminatedUnion('type', [
    // Invitación a curso como estudiante
    z.object({
        type: z.literal('course_student'),
        courseId: z.string().min(1),
        courseName: z.string().optional(),
        welcomeMessage: z.string().max(500).optional()
    }),
    // Invitación a curso con rol específico
    z.object({
        type: z.literal('course_role'),
        courseId: z.string().min(1),
        courseRole: z.enum(['owner', 'admin', 'teacher', 'assistant', 'grader', 'student']),
        courseName: z.string().optional(),
        welcomeMessage: z.string().max(500).optional()
    }),
    // Invitación con rol de sistema (ej: admin invita profesor)
    z.object({
        type: z.literal('system_role'),
        systemRoleId: z.string().min(1),
        welcomeMessage: z.string().max(500).optional()
    }),
    // Solo registro abierto
    z.object({
        type: z.literal('open_registration'),
        welcomeMessage: z.string().max(500).optional()
    })
]);

export const createInviteSchema = z.object({
    quantity: z.number().int().min(1).max(100).default(1),
    campaign: z.string().max(100).optional(),
    email: z.string().email().optional(),
    config: inviteConfigSchema,
    expiresInDays: z.number().int().min(1).max(365).default(30),
    maxUses: z.number().int().min(1).max(1000).default(1)
});

export type CreateInviteInput = z.infer<typeof createInviteSchema>;

// ============================================
// INVITE QUERY RESULTS
// ============================================

export interface InviteWithDetails {
    id: string;
    code: string;
    campaign: string | null;
    email: string | null;
    config: InviteConfig;
    maxUses: number;
    useCount: number;
    usedByEmail: string | null;
    usedAt: Date | null;
    expiresAt: Date;
    createdAt: Date;
    isActive: boolean;
    courseId: string | null;
    createdByEmail: string | null;
    isExpired: boolean;
    isFullyUsed: boolean;
}

// ============================================
// INVITATION UTILS
// ============================================

export class InvitationUtils {
    /**
     * Genera una o más invitaciones con configuración
     */
    static async createInvites(input: CreateInviteInput, createdBy: string): Promise<string[]> {
        const validated = createInviteSchema.parse(input);
        const codes: string[] = [];

        const invites = Array.from({ length: validated.quantity }, () => {
            const code = sn.generateSerialNumber();
            codes.push(code);
            return {
                id: nanoid(),
                code,
                campaign: validated.campaign || null,
                email: validated.email || null,
                config: validated.config,
                createdBy,
                maxUses: validated.maxUses,
                useCount: 0,
                expiresAt: new Date(Date.now() + validated.expiresInDays * 24 * 60 * 60 * 1000),
                createdAt: new Date(),
                courseId: ('courseId' in validated.config) ? validated.config.courseId : null,
                isActive: true
            };
        });

        await db.insert(invite).values(invites);
        return codes;
    }

    /**
     * Obtiene todas las invitaciones de un curso con detalles
     */
    static async getCourseInvites(courseId: string): Promise<InviteWithDetails[]> {
        const rows = await db
            .select({
                id: invite.id,
                code: invite.code,
                campaign: invite.campaign,
                email: invite.email,
                config: invite.config,
                maxUses: invite.maxUses,
                useCount: invite.useCount,
                usedByEmail: user.email,
                usedAt: invite.usedAt,
                expiresAt: invite.expiresAt,
                createdAt: invite.createdAt,
                isActive: invite.isActive,
                courseId: invite.courseId,
                createdByEmail: sql<string>`(SELECT email FROM user WHERE id = ${invite.createdBy})`
            })
            .from(invite)
            .leftJoin(user, eq(invite.usedBy, user.id))
            .where(eq(invite.courseId, courseId))
            .orderBy(desc(invite.createdAt));

        return rows.map(r => ({
            ...r,
            config: r.config as InviteConfig,
            isExpired: new Date() > r.expiresAt,
            isFullyUsed: r.useCount >= r.maxUses
        }));
    }

    /**
     * Obtiene todas las invitaciones del sistema (para admin)
     */
    static async getAllInvites(): Promise<InviteWithDetails[]> {
        const rows = await db
            .select({
                id: invite.id,
                code: invite.code,
                campaign: invite.campaign,
                email: invite.email,
                config: invite.config,
                maxUses: invite.maxUses,
                useCount: invite.useCount,
                usedByEmail: user.email,
                usedAt: invite.usedAt,
                expiresAt: invite.expiresAt,
                createdAt: invite.createdAt,
                isActive: invite.isActive,
                courseId: invite.courseId,
                createdByEmail: sql<string>`(SELECT email FROM user WHERE id = ${invite.createdBy})`
            })
            .from(invite)
            .leftJoin(user, eq(invite.usedBy, user.id))
            .orderBy(desc(invite.createdAt));

        return rows.map(r => ({
            ...r,
            config: r.config as InviteConfig,
            isExpired: new Date() > r.expiresAt,
            isFullyUsed: r.useCount >= r.maxUses
        }));
    }

    /**
     * Busca y valida una invitación por código.
     * Retorna null si no existe, está expirada, inactiva o totalmente usada.
     */
    static async findValidInvite(code: string): Promise<{
        id: string;
        config: InviteConfig;
        email: string | null;
        courseId: string | null;
        maxUses: number;
        useCount: number;
    } | null> {
        const [record] = await db
            .select({
                id: invite.id,
                config: invite.config,
                email: invite.email,
                courseId: invite.courseId,
                maxUses: invite.maxUses,
                useCount: invite.useCount,
                expiresAt: invite.expiresAt,
                isActive: invite.isActive
            })
            .from(invite)
            .where(
                and(
                    eq(invite.code, code),
                    eq(invite.isActive, true)
                )
            );

        if (!record) return null;

        // Check expiration
        if (new Date() > record.expiresAt) return null;

        // Check max uses
        if (record.useCount >= record.maxUses) return null;

        return {
            id: record.id,
            config: record.config as InviteConfig,
            email: record.email,
            courseId: record.courseId,
            maxUses: record.maxUses,
            useCount: record.useCount
        };
    }

    /**
     * Obtiene la info pública de una invitación (para mostrar en registro)
     */
    static async getInvitePublicInfo(code: string): Promise<{
        type: InviteType;
        courseName?: string;
        welcomeMessage?: string;
        isValid: boolean;
    } | null> {
        const record = await this.findValidInvite(code);
        if (!record) return null;

        const config = record.config;
        let courseName: string | undefined;

        // Get course name if it's a course invite
        if ('courseId' in config && config.courseId) {
            if (config.courseName) {
                courseName = config.courseName;
            } else {
                const [c] = await db
                    .select({ name: course.name })
                    .from(course)
                    .where(eq(course.id, config.courseId));
                courseName = c?.name;
            }
        }

        return {
            type: config.type,
            courseName,
            welcomeMessage: config.welcomeMessage,
            isValid: true
        };
    }

    /**
     * Marca una invitación como usada y ejecuta las acciones asociadas
     */
    static async redeemInvite(
        code: string,
        userId: string
    ): Promise<{ success: boolean; error?: string }> {
        const record = await this.findValidInvite(code);
        if (!record) {
            return { success: false, error: 'Invalid or expired invite code' };
        }

        // If email-restricted, we can't check here (before user creation)
        // The caller should verify email match

        const config = record.config;

        try {
            // Update invite usage
            await db
                .update(invite)
                .set({
                    useCount: record.useCount + 1,
                    usedBy: userId,
                    usedAt: new Date(),
                    // Mark inactive if fully used
                    isActive: (record.useCount + 1) < record.maxUses
                })
                .where(eq(invite.id, record.id));

            // Execute actions based on config type
            switch (config.type) {
                case 'course_student': {
                    if (config.courseId) {
                        await CourseRoleUtils.assignCourseRole(config.courseId, userId, 'student');
                    }
                    // Also assign a base system role so the user has a proper system-level identity
                    try {
                        await RoleUtils.assignRoleToUser(userId, 'role_student', undefined, 'Assigned via course invitation');
                    } catch {
                        // role_student may not exist; not critical
                    }
                    break;
                }
                case 'course_role': {
                    if (config.courseId && config.courseRole) {
                        await CourseRoleUtils.assignCourseRole(
                            config.courseId,
                            userId,
                            config.courseRole
                        );
                    }
                    break;
                }
                case 'system_role': {
                    if (config.systemRoleId) {
                        try {
                            await RoleUtils.assignRoleToUser(
                                userId,
                                config.systemRoleId,
                                undefined,
                                'Assigned via invitation'
                            );
                        } catch (e) {
                            console.warn('Could not assign system role via invite:', e);
                        }
                    }
                    break;
                }
                case 'open_registration': {
                    // Assign base user/student system role
                    try {
                        await RoleUtils.assignRoleToUser(userId, 'role_student', undefined, 'Assigned via open registration');
                    } catch {
                        // role may not exist; not critical
                    }
                    break;
                }
            }

            return { success: true };
        } catch (error) {
            console.error('Error redeeming invite:', error);
            return { success: false, error: 'Error processing invitation' };
        }
    }

    /**
     * Desactiva invitaciones
     */
    static async deactivateInvite(inviteId: string): Promise<boolean> {
        const result = await db
            .update(invite)
            .set({ isActive: false })
            .where(eq(invite.id, inviteId));

        return true;
    }

    /**
     * Desactiva todas las invitaciones de una campaña
     */
    static async deactivateCampaign(campaignName: string): Promise<number> {
        const result = await db
            .update(invite)
            .set({ isActive: false })
            .where(
                and(
                    eq(invite.campaign, campaignName),
                    eq(invite.isActive, true)
                )
            );
        return 0; // SQLite doesn't easily return affected rows without raw
    }

    /**
     * Obtiene estadísticas de invitaciones
     */
    static async getInviteStats(courseId?: string) {
        const baseWhere = courseId ? eq(invite.courseId, courseId) : undefined;

        const [stats] = await db
            .select({
                total: sql<number>`COUNT(*)`,
                active: sql<number>`SUM(CASE WHEN ${invite.isActive} = 1 AND ${invite.expiresAt} > unixepoch() THEN 1 ELSE 0 END)`,
                used: sql<number>`SUM(CASE WHEN ${invite.useCount} > 0 THEN 1 ELSE 0 END)`,
                expired: sql<number>`SUM(CASE WHEN ${invite.expiresAt} <= unixepoch() THEN 1 ELSE 0 END)`,
                totalUses: sql<number>`SUM(${invite.useCount})`
            })
            .from(invite)
            .where(baseWhere);

        return {
            total: stats?.total ?? 0,
            active: stats?.active ?? 0,
            used: stats?.used ?? 0,
            expired: stats?.expired ?? 0,
            totalUses: stats?.totalUses ?? 0
        };
    }
}

export default InvitationUtils;
