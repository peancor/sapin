import { db } from './index';
import { role, userRoleAssignment, roleAuditLog, user } from './schema';
import { eq, and, isNull, or, gt, lt } from 'drizzle-orm';
import type { Role, UserRoleAssignment } from './schema';
import { ROLE_LEVELS } from '../roles';

// Tipos para el sistema de permisos
export interface Permission {
    create?: boolean;
    read?: boolean;
    update?: boolean;
    delete?: boolean;
    publish?: boolean;
    assign?: boolean;
    viewOwn?: boolean;
    viewAll?: boolean;
    export?: boolean;
}

export interface Permissions {
    users?: Permission;
    courses?: Permission;
    settings?: Permission;
    analytics?: Permission;
    roles?: Permission;
}

export interface UserWithRoles {
    user: typeof user.$inferSelect;
    roles: (Role & { assignment: UserRoleAssignment })[];
}

/**
 * Obtiene todos los roles activos de un usuario
 */
export async function getUserRoles(userId: string): Promise<Role[]> {
    const now = new Date();
    
    const assignments = await db
        .select({
            role: role,
            assignment: userRoleAssignment
        })
        .from(userRoleAssignment)
        .innerJoin(role, eq(userRoleAssignment.roleId, role.id))
        .where(
            and(
                eq(userRoleAssignment.userId, userId),
                eq(userRoleAssignment.isActive, true),
                eq(role.isActive, true),
                or(
                    isNull(userRoleAssignment.expiresAt),
                    gt(userRoleAssignment.expiresAt, now)
                )
            )
        )
        .all();
    
    return assignments.map(a => a.role);
}

/**
 * Obtiene el rol de mayor nivel de un usuario
 */
export async function getUserHighestRole(userId: string): Promise<Role | null> {
    const roles = await getUserRoles(userId);
    if (roles.length === 0) return null;
    
    return roles.reduce((highest, current) => 
        current.level > highest.level ? current : highest
    );
}

/**
 * Verifica si un usuario tiene un rol específico
 */
export async function userHasRole(userId: string, roleName: string): Promise<boolean> {
    const roles = await getUserRoles(userId);
    return roles.some(r => r.name === roleName);
}

/**
 * Verifica si un usuario tiene al menos un nivel de rol específico
 */
export async function userHasRoleLevel(userId: string, minLevel: number): Promise<boolean> {
    const highestRole = await getUserHighestRole(userId);
    return highestRole !== null && highestRole.level >= minLevel;
}

/**
 * Parsea los permisos JSON de un rol
 */
function parsePermissions(permissionsJson: string | null): Permissions {
    if (!permissionsJson) return {};
    try {
        return JSON.parse(permissionsJson);
    } catch {
        return {};
    }
}

/**
 * Combina permisos de múltiples roles (OR lógico - el permiso más permisivo gana)
 */
function mergePermissions(roles: Role[]): Permissions {
    const merged: Permissions = {};
    
    for (const r of roles) {
        const perms = parsePermissions(r.permissions);
        
        for (const [resource, resourcePerms] of Object.entries(perms)) {
            if (!merged[resource as keyof Permissions]) {
                merged[resource as keyof Permissions] = {};
            }
            
            for (const [action, allowed] of Object.entries(resourcePerms as Permission)) {
                const current = (merged[resource as keyof Permissions] as Permission)?.[action as keyof Permission];
                if (allowed === true || current !== true) {
                    (merged[resource as keyof Permissions] as Permission)[action as keyof Permission] = allowed;
                }
            }
        }
    }
    
    return merged;
}

/**
 * Obtiene los permisos combinados de un usuario
 */
export async function getUserPermissions(userId: string): Promise<Permissions> {
    const roles = await getUserRoles(userId);
    return mergePermissions(roles);
}

/**
 * Verifica si un usuario tiene un permiso específico
 */
export async function userHasPermission(
    userId: string,
    resource: keyof Permissions,
    action: keyof Permission
): Promise<boolean> {
    const permissions = await getUserPermissions(userId);
    return permissions[resource]?.[action] === true;
}

/**
 * Obtiene los roles que un usuario puede asignar según su nivel
 * - Super Admin (100): puede asignar todos los roles
 * - Admin (90): puede asignar roles de nivel < 90 (teacher, assistant, student)
 */
export async function getAssignableRoles(assignerId: string): Promise<Role[]> {
    const assignerRole = await getUserHighestRole(assignerId);
    
    // Usar nivel del rol o 0 si no tiene rol asignado
    const assignerLevel = assignerRole?.level ?? 0;
    
    // Solo usuarios con nivel >= ADMIN pueden asignar roles
    if (assignerLevel < ROLE_LEVELS.ADMIN) {
        return [];
    }
    
    // Super Admin puede asignar todos los roles
    if (assignerLevel >= ROLE_LEVELS.SUPER_ADMIN) {
        return db.select().from(role).where(eq(role.isActive, true)).all();
    }
    
    // Admin solo puede asignar roles de nivel inferior a ADMIN
    return db
        .select()
        .from(role)
        .where(and(
            eq(role.isActive, true),
            lt(role.level, ROLE_LEVELS.ADMIN)
        ))
        .all();
}

/**
 * Asigna un rol a un usuario
 */
export async function assignRoleToUser(
    userId: string,
    roleId: string,
    assignedBy?: string,
    reason?: string,
    expiresAt?: Date
): Promise<UserRoleAssignment> {
    const now = new Date();
    const id = `ur_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
    
    // Verificar que el rol existe
    const targetRole = await db.select().from(role).where(eq(role.id, roleId)).get();
    if (!targetRole) {
        throw new Error(`Rol '${roleId}' no encontrado`);
    }
    
    // Verificar permisos del asignador
    if (assignedBy) {
        const assignerRole = await getUserHighestRole(assignedBy);
        const assignerLevel = assignerRole?.level ?? 0;
        
        // Solo super_admin puede asignar roles de nivel >= ADMIN
        if (targetRole.level >= ROLE_LEVELS.ADMIN && assignerLevel < ROLE_LEVELS.SUPER_ADMIN) {
            throw new Error('Solo Super Admin puede asignar roles de administrador');
        }
        
        // No puede asignar roles de nivel >= al suyo (excepto super_admin)
        if (assignerLevel < ROLE_LEVELS.SUPER_ADMIN && targetRole.level >= assignerLevel) {
            throw new Error('No puede asignar roles de nivel igual o superior al suyo');
        }
    }
    
    // Verificar si ya tiene este rol activo
    const existingAssignment = await db
        .select()
        .from(userRoleAssignment)
        .where(
            and(
                eq(userRoleAssignment.userId, userId),
                eq(userRoleAssignment.roleId, roleId),
                eq(userRoleAssignment.isActive, true)
            )
        )
        .get();
    
    if (existingAssignment) {
        throw new Error(`El usuario ya tiene el rol '${targetRole.name}' asignado`);
    }
    
    // Crear la asignación
    const assignment: typeof userRoleAssignment.$inferInsert = {
        id,
        userId,
        roleId,
        assignedBy: assignedBy || null,
        assignedAt: now,
        expiresAt: expiresAt || null,
        reason: reason || null,
        isActive: true
    };
    
    await db.insert(userRoleAssignment).values(assignment);
    
    // Registrar en el audit log
    await db.insert(roleAuditLog).values({
        id: `ral_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`,
        userId,
        roleId,
        roleName: targetRole.name,
        action: 'assigned',
        performedBy: assignedBy || null,
        reason: reason || null,
        createdAt: now
    });
    
    return { ...assignment, assignedAt: now, expiresAt: expiresAt || null } as UserRoleAssignment;
}

/**
 * Revoca un rol de un usuario
 */
export async function revokeRoleFromUser(
    userId: string,
    roleId: string,
    performedBy: string,
    reason?: string
): Promise<void> {
    const now = new Date();
    
    // Obtener el rol para el audit log
    const targetRole = await db.select().from(role).where(eq(role.id, roleId)).get();
    
    // Desactivar la asignación
    await db
        .update(userRoleAssignment)
        .set({ isActive: false })
        .where(
            and(
                eq(userRoleAssignment.userId, userId),
                eq(userRoleAssignment.roleId, roleId),
                eq(userRoleAssignment.isActive, true)
            )
        );
    
    // Registrar en el audit log
    await db.insert(roleAuditLog).values({
        id: `ral_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`,
        userId,
        roleId,
        roleName: targetRole?.name || roleId,
        action: 'revoked',
        performedBy,
        reason: reason || null,
        createdAt: now
    });
}

/**
 * Verifica si un usuario puede gestionar roles de otro usuario
 * Un usuario solo puede asignar/revocar roles de nivel inferior al suyo
 */
export async function canManageUserRoles(
    managerId: string,
    targetUserId: string
): Promise<boolean> {
    // No puede gestionar sus propios roles
    if (managerId === targetUserId) return false;
    
    // Obtener el nivel del manager desde el nuevo sistema
    const managerRole = await getUserHighestRole(managerId);
    const managerLevel = managerRole?.level ?? 0;
    
    // Solo nivel >= ADMIN puede gestionar roles
    if (managerLevel < ROLE_LEVELS.ADMIN) return false;
    
    // Obtener nivel del target desde el nuevo sistema
    const targetRole = await getUserHighestRole(targetUserId);
    const targetLevel = targetRole?.level ?? 0;
    
    // Solo puede gestionar usuarios de nivel inferior
    return managerLevel > targetLevel;
}

/**
 * Obtiene todos los roles disponibles en el sistema
 */
export async function getAllRoles(includeInactive = false): Promise<Role[]> {
    if (includeInactive) {
        return db.select().from(role).all();
    }
    return db.select().from(role).where(eq(role.isActive, true)).all();
}

export default {
    getUserRoles,
    getUserHighestRole,
    userHasRole,
    userHasRoleLevel,
    getUserPermissions,
    userHasPermission,
    getAssignableRoles,
    assignRoleToUser,
    revokeRoleFromUser,
    canManageUserRoles,
    getAllRoles,
    ROLE_LEVELS
};
