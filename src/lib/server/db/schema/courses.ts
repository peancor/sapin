import { sqliteTable, text, integer, index } from 'drizzle-orm/sqlite-core';
import { user } from './users';
import { fileType } from './files';

// ============================================
// COURSE STATUS LIFECYCLE
// ============================================

export const courseStatus = {
    DRAFT: 'draft',
    SCHEDULED: 'scheduled',
    PUBLISHED: 'published',
    ARCHIVED: 'archived'
} as const;

export type CourseStatusType = (typeof courseStatus)[keyof typeof courseStatus];

// ============================================
// COURSE TABLE
// ============================================

export const course = sqliteTable(
    'course',
    {
        id: text('id').primaryKey(),

        // Identificación
        name: text('name').notNull(),
        slug: text('slug').notNull().unique(),
        description: text('description'),
        image: text('image'),

        // Ciclo de vida
        status: text('status').$type<CourseStatusType>().notNull().default('draft'),
        publishedAt: integer('published_at', { mode: 'timestamp' }),
        archivedAt: integer('archived_at', { mode: 'timestamp' }),

        // Timestamps
        createdAt: integer('created_at', { mode: 'timestamp' }).notNull(),
        updatedAt: integer('updated_at', { mode: 'timestamp' }).notNull(),

        // Configuración extensible (JSON)
        settings: text('settings'), // navegación, certificados, límites, etc.
        metadata: text('metadata') // tags, nivel, duración, idioma, etc.
    },
    (table) => [
        index('course_slug_idx').on(table.slug),
        index('course_status_idx').on(table.status)
    ]
);

// ============================================
// INVITATION CONFIGURATION TYPES
// ============================================

/**
 * Tipo de invitación que determina el alcance y comportamiento
 * - course_student: Invita a registrarse y auto-matricula como estudiante en un curso
 * - course_teacher: Invita a registrarse y auto-asigna profesor en un curso
 * - generic_student: Invita a registrarse y asigna rol de estudiante a nivel sistema
 * - course_role: Invita a registrarse y asigna un rol específico en un curso
 * - system_role: Invita a registrarse y asigna un rol de sistema (admin genera para profesor, etc.)
 * - open_registration: Registro abierto con asignación de rol base de sistema (user)
 */
export const inviteType = {
    COURSE_STUDENT: 'course_student',
    COURSE_TEACHER: 'course_teacher',
    GENERIC_STUDENT: 'generic_student',
    COURSE_ROLE: 'course_role',
    SYSTEM_ROLE: 'system_role',
    OPEN_REGISTRATION: 'open_registration'
} as const;

export type InviteType = (typeof inviteType)[keyof typeof inviteType];

/**
 * Configuración JSON almacenada en el campo `config` de la invitación.
 * Define qué acciones se ejecutan al usar la invitación.
 */
export type InviteConfig = {
    /** Tipo de invitación */
    type: InviteType;
    /** ID del curso (requerido para course_student, course_teacher y course_role) */
    courseId?: string;
    /** Rol a asignar en el curso (para course_role) */
    courseRole?: (typeof courseRoleType)[keyof typeof courseRoleType];
    /** ID del rol de sistema a asignar (para system_role, ej: 'role_teacher') */
    systemRoleId?: string;
    /** Mensaje personalizado para mostrar al usuario en el registro */
    welcomeMessage?: string;
    /** Nombre del curso (snapshot para display, no se usa para lógica) */
    courseName?: string;
};

export const invite = sqliteTable(
    'invite',
    {
        id: text('id').primaryKey(),
        code: text('code').notNull().unique(),
        /** Nombre de campaña para agrupar invitaciones */
        campaign: text('campaign'),
        /** Email opcional - si se especifica, solo ese email puede usar la invitación */
        email: text('email'),
        /** Configuración JSON con esquema Zod - define el comportamiento de la invitación */
        config: text('config', { mode: 'json' }).$type<InviteConfig>().notNull(),
        createdBy: text('created_by')
            .notNull()
            .references(() => user.id),
        /** Número máximo de usos (1 = single-use, >1 = multi-use) */
        maxUses: integer('max_uses').notNull().default(1),
        /** Número actual de usos */
        useCount: integer('use_count').notNull().default(0),
        usedBy: text('used_by').references(() => user.id),
        usedAt: integer('used_at', { mode: 'timestamp' }),
        expiresAt: integer('expires_at', { mode: 'timestamp' }).notNull(),
        createdAt: integer('created_at', { mode: 'timestamp' }).notNull(),
        /** Curso asociado (legacy compatibility + index) */
        courseId: text('course_id').references(() => course.id),
        /** Si la invitación está activa */
        isActive: integer('is_active', { mode: 'boolean' }).notNull().default(true)
    },
    (table) => [
        index('invite_code_idx').on(table.code),
        index('invite_courseId_idx').on(table.courseId),
        index('invite_createdBy_idx').on(table.createdBy)
    ]
);

export const courseFile = sqliteTable(
    'course_file',
    {
        id: text('id').primaryKey(),
        courseId: text('course_id')
            .notNull()
            .references(() => course.id),
        name: text('name').notNull(),
        path: text('path').notNull(),
        type: text('type').$type<keyof typeof fileType>().notNull(),
        size: integer('size').notNull(),
        mimeType: text('mime_type').notNull(),
        createdAt: integer('created_at', { mode: 'timestamp' }).notNull()
    },
    (table) => [index('course_file_idx').on(table.courseId)]
);

// ============================================
// ROLES ESPECÍFICOS POR CURSO (Fase 2)
// ============================================

export const courseRoleType = {
    OWNER: 'owner',
    ADMIN: 'admin',
    TEACHER: 'teacher',
    ASSISTANT: 'assistant',
    GRADER: 'grader',
    STUDENT: 'student'
} as const;

export const courseRole = sqliteTable(
    'course_role',
    {
        id: text('id').primaryKey(),
        courseId: text('course_id')
            .notNull()
            .references(() => course.id, { onDelete: 'cascade' }),
        userId: text('user_id')
            .notNull()
            .references(() => user.id, { onDelete: 'cascade' }),
        role: text('role').notNull().$type<(typeof courseRoleType)[keyof typeof courseRoleType]>(),
        permissions: text('permissions'),
        assignedBy: text('assigned_by').references(() => user.id, { onDelete: 'set null' }),
        assignedAt: integer('assigned_at', { mode: 'timestamp' }).notNull(),
        isActive: integer('is_active', { mode: 'boolean' }).default(true).notNull()
    },
    (table) => [
        index('course_role_courseId_idx').on(table.courseId),
        index('course_role_userId_idx').on(table.userId),
        index('course_role_course_user_idx').on(table.courseId, table.userId)
    ]
);

export type Course = typeof course.$inferSelect;
export type Invite = typeof invite.$inferSelect;
export type NewInvite = typeof invite.$inferInsert;
export type CourseFile = typeof courseFile.$inferSelect;
export type CourseRole = typeof courseRole.$inferSelect;
