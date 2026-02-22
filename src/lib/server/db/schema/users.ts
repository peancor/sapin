import { sqliteTable, text, integer, index } from 'drizzle-orm/sqlite-core';

// ============================================
// TIPOS PARA PREFERENCIAS DE USUARIO
// Estructura tipada con soporte para extensiones
// ============================================

/**
 * Preferencias de notificaciones del usuario
 */
export type NotificationPreferences = {
    /** Recibir emails de actividad del curso */
    emailCourseUpdates: boolean;
    /** Recibir emails de mensajes directos */
    emailMessages: boolean;
    /** Recibir recordatorios de tareas pendientes */
    emailReminders: boolean;
    /** Frecuencia de resumen: 'instant' | 'daily' | 'weekly' | 'none' */
    digestFrequency: 'instant' | 'daily' | 'weekly' | 'none';
    /** Notificaciones push en navegador */
    pushEnabled: boolean;
};

/**
 * Preferencias de accesibilidad (WCAG compliance)
 */
export type AccessibilityPreferences = {
    /** Tamaño de fuente */
    fontSize: 'small' | 'medium' | 'large' | 'x-large';
    /** Modo de alto contraste */
    highContrast: boolean;
    /** Reducir animaciones */
    reduceMotion: boolean;
    /** Modo dislexia (fuente especial) */
    dyslexiaFont: boolean;
    /** Lector de pantalla optimizado */
    screenReaderOptimized: boolean;
};

/**
 * Preferencias de aprendizaje (EdTech-specific)
 */
export type LearningPreferences = {
    /** Idioma preferido para contenido (ISO 639-1) */
    contentLanguage: string;
    /** Estilo de aprendizaje preferido (modelo VARK) */
    learningStyle: 'visual' | 'auditory' | 'reading' | 'kinesthetic' | null;
    /** Duración preferida de sesiones (minutos) */
    sessionDuration: number;
    /** Hora preferida para estudiar (0-23) */
    preferredStudyHour: number | null;
    /** Mostrar subtítulos en videos */
    showCaptions: boolean;
    /** Velocidad de reproducción de video por defecto */
    defaultPlaybackSpeed: number;
};

/**
 * Preferencias de interfaz/UI
 */
export type UIPreferences = {
    /** Tema de la aplicación */
    theme: 'light' | 'dark' | 'system';
    /** Sidebar colapsado por defecto */
    sidebarCollapsed: boolean;
    /** Densidad de UI */
    density: 'compact' | 'comfortable' | 'spacious';
    /** Mostrar tips de ayuda */
    showHelpTips: boolean;
};

/**
 * Preferencias unificadas del usuario
 * Estructura tipada con soporte para extensiones personalizadas
 */
export type UserPreferences = {
    notifications: NotificationPreferences;
    accessibility: AccessibilityPreferences;
    learning: LearningPreferences;
    ui: UIPreferences;
    /** Extensiones personalizadas (clave-valor genérico) */
    custom?: Record<string, unknown>;
};

/**
 * Valores por defecto para preferencias de usuario
 */
export const defaultUserPreferences: UserPreferences = {
    notifications: {
        emailCourseUpdates: true,
        emailMessages: true,
        emailReminders: true,
        digestFrequency: 'daily',
        pushEnabled: false
    },
    accessibility: {
        fontSize: 'medium',
        highContrast: false,
        reduceMotion: false,
        dyslexiaFont: false,
        screenReaderOptimized: false
    },
    learning: {
        contentLanguage: 'es',
        learningStyle: null,
        sessionDuration: 30,
        preferredStudyHour: null,
        showCaptions: false,
        defaultPlaybackSpeed: 1.0
    },
    ui: {
        theme: 'system',
        sidebarCollapsed: false,
        density: 'comfortable',
        showHelpTips: true
    }
};

// ============================================
// TIPOS PARA METADATA DE USUARIO
// Estructura semi-tipada con extensibilidad
// ============================================

/**
 * Estado de onboarding del usuario
 */
export type OnboardingStatus = {
    /** Onboarding completado */
    completed: boolean;
    /** Pasos completados */
    stepsCompleted: string[];
    /** Fecha de completado (ISO string) */
    completedAt: string | null;
    /** Omitido por el usuario */
    skipped: boolean;
};

/**
 * Información del perfil educativo
 */
export type EducationalProfile = {
    /** Nivel educativo */
    level: 'primary' | 'secondary' | 'university' | 'professional' | 'other' | null;
    /** Áreas de interés (etiquetas) */
    interests: string[];
    /** Objetivos de aprendizaje */
    goals: string[];
    /** Instituciones asociadas */
    institutions: string[];
    /** Biografía/descripción */
    bio: string | null;
};

/**
 * Estadísticas de gamificación
 */
export type GamificationStats = {
    /** Puntos totales acumulados */
    totalPoints: number;
    /** Nivel actual del usuario */
    level: number;
    /** Racha actual (días consecutivos de actividad) */
    currentStreak: number;
    /** Mejor racha histórica */
    bestStreak: number;
    /** Insignias obtenidas (IDs) */
    badges: string[];
    /** Logros desbloqueados (IDs) */
    achievements: string[];
};

/**
 * Metadata del usuario
 * Estructura semi-tipada con extensibilidad genérica
 */
export type UserMetadata = {
    /** Estado de onboarding */
    onboarding?: OnboardingStatus;
    /** Perfil educativo */
    educationalProfile?: EducationalProfile;
    /** Estadísticas de gamificación */
    gamification?: GamificationStats;
    /** Última actividad por curso (courseId -> timestamp ISO) */
    lastCourseActivity?: Record<string, string>;
    /** Dispositivos registrados para notificaciones push */
    pushDevices?: Array<{ id: string; name: string; registeredAt: string }>;
    /** Tokens de integración externa */
    externalTokens?: Record<string, { token: string; expiresAt: string | null }>;
    /** Datos personalizados (extensión libre) */
    custom?: Record<string, unknown>;
};

// ============================================
// ESQUEMA DE USUARIO
// ============================================

export const userStatus = {
    ACTIVE: 'active',
    INACTIVE: 'inactive',
    SUSPENDED: 'suspended',
    PENDING_VERIFICATION: 'pending_verification'
} as const;

export const user = sqliteTable(
    'user',
    {
        // === Identificación ===
        id: text('id').primaryKey(),
        email: text('email').notNull().unique(),
        username: text('username').unique(),
        /** Identificador de proveedor externo (OAuth, SSO) */
        externalId: text('external_id').unique(),

        // === Perfil básico ===
        /** Nombre para mostrar (diferente de username) */
        displayName: text('display_name'),
        /** Alias corto o apodo */
        alias: text('alias'),
        /** Edad del usuario (útil para restricciones de contenido) */
        age: integer('age'),
        /** URL o path de imagen de avatar */
        image: text('image'),
        /** Zona horaria del usuario (IANA timezone, ej: 'Europe/Madrid') */
        timezone: text('timezone').default('UTC'),
        /** Código de idioma preferido (ISO 639-1, ej: 'es', 'en') */
        locale: text('locale').default('es'),

        // === Autenticación ===
        /** Hash de contraseña (Argon2 incluye salt automáticamente) */
        passwordHash: text('password_hash').notNull(),
        /** Email verificado */
        emailVerified: integer('email_verified', { mode: 'boolean' }).default(false).notNull(),
        /** Código de invitación usado para registro */
        inviteCode: text('invite_code').unique(),

        // === Estado de cuenta ===
        /** Estado de la cuenta */
        status: text('status')
            .$type<(typeof userStatus)[keyof typeof userStatus]>()
            .default('active')
            .notNull(),
        /** Último acceso al sistema */
        lastLoginAt: integer('last_login_at', { mode: 'timestamp' }),
        /** Contador de intentos de login fallidos (rate limiting) */
        failedLoginAttempts: integer('failed_login_attempts').default(0),
        /** Bloqueado hasta (suspensiones temporales) */
        lockedUntil: integer('locked_until', { mode: 'timestamp' }),

        // === Preferencias y Metadata (JSON tipado) ===
        /**
         * Preferencias del usuario (notificaciones, accesibilidad, UI, aprendizaje)
         * @see UserPreferences
         */
        preferences: text('preferences', { mode: 'json' }).$type<UserPreferences>(),
        /**
         * Metadata extensible (onboarding, perfil educativo, gamificación)
         * @see UserMetadata
         */
        metadata: text('metadata', { mode: 'json' }).$type<UserMetadata>(),

        // === Timestamps ===
        createdAt: integer('created_at', { mode: 'timestamp' }).notNull(),
        updatedAt: integer('updated_at', { mode: 'timestamp' }).notNull()
    },
    (table) => [
        index('user_status_idx').on(table.status),
        index('user_lastLogin_idx').on(table.lastLoginAt)
    ]
);

export const session = sqliteTable(
    'session',
    {
        id: text('id').primaryKey(),
        userId: text('user_id')
            .notNull()
            .references(() => user.id),
        expiresAt: integer('expires_at', { mode: 'timestamp' }).notNull()
    },
    (table) => [index('session_userId_idx').on(table.userId)]
);

export type User = typeof user.$inferSelect;
export type Session = typeof session.$inferSelect;
