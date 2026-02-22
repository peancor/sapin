/**
 * Script para inicializar los roles del sistema y migrar usuarios existentes
 * 
 * Ejecutar con: npx tsx scripts/seed-roles.ts
 * 
 * Este script:
 * 1. Crea los roles predefinidos del sistema (super_admin, admin, teacher, assistant, student)
 * 2. Migra los usuarios existentes asignándoles roles según su campo 'role' actual
 */

import 'dotenv/config';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import Database from 'better-sqlite3';
import { role, userRoleAssignment, roleAuditLog, user } from '../src/lib/server/db/schema';
import { eq } from 'drizzle-orm';

const DATABASE_URL = process.env.DATABASE_URL;
if (!DATABASE_URL) {
    console.error('❌ Error: DATABASE_URL no está configurado');
    process.exit(1);
}

const client = new Database(DATABASE_URL);
const db = drizzle(client);

// Roles predefinidos del sistema
const SYSTEM_ROLES = [
    {
        id: 'role_super_admin',
        name: 'super_admin',
        displayName: 'Super Administrador',
        description: 'Control total del sistema',
        level: 100,
        isSystem: true,
        permissions: JSON.stringify({
            users: { create: true, read: true, update: true, delete: true },
            courses: { create: true, read: true, update: true, delete: true, publish: true },
            settings: { read: true, update: true },
            analytics: { viewOwn: true, viewAll: true, export: true },
            roles: { create: true, read: true, update: true, delete: true, assign: true }
        })
    },
    {
        id: 'role_admin',
        name: 'admin',
        displayName: 'Administrador',
        description: 'Gestión de usuarios y configuración',
        level: 90,
        isSystem: true,
        permissions: JSON.stringify({
            users: { create: true, read: true, update: true, delete: false },
            courses: { create: true, read: true, update: true, delete: false, publish: true },
            settings: { read: true, update: false },
            analytics: { viewOwn: true, viewAll: true, export: false },
            roles: { create: false, read: true, update: false, delete: false, assign: true }
        })
    },
    {
        id: 'role_teacher',
        name: 'teacher',
        displayName: 'Profesor',
        description: 'Crear y gestionar cursos',
        level: 50,
        isSystem: true,
        permissions: JSON.stringify({
            users: { create: false, read: true, update: false, delete: false },
            courses: { create: true, read: true, update: true, delete: false, publish: true },
            settings: { read: false, update: false },
            analytics: { viewOwn: true, viewAll: false, export: false },
            roles: { create: false, read: false, update: false, delete: false, assign: false }
        })
    },
    {
        id: 'role_assistant',
        name: 'assistant',
        displayName: 'Asistente',
        description: 'Ayudar en cursos sin poder crear',
        level: 40,
        isSystem: true,
        permissions: JSON.stringify({
            users: { create: false, read: true, update: false, delete: false },
            courses: { create: false, read: true, update: true, delete: false, publish: false },
            settings: { read: false, update: false },
            analytics: { viewOwn: true, viewAll: false, export: false },
            roles: { create: false, read: false, update: false, delete: false, assign: false }
        })
    },
    {
        id: 'role_student',
        name: 'student',
        displayName: 'Estudiante',
        description: 'Acceso a cursos matriculados',
        level: 10,
        isSystem: true,
        permissions: JSON.stringify({
            users: { create: false, read: false, update: false, delete: false },
            courses: { create: false, read: true, update: false, delete: false, publish: false },
            settings: { read: false, update: false },
            analytics: { viewOwn: true, viewAll: false, export: false },
            roles: { create: false, read: false, update: false, delete: false, assign: false }
        })
    },
    {
        id: 'role_user',
        name: 'user',
        displayName: 'Usuario',
        description: 'Usuario básico sin permisos especiales',
        level: 0,
        isSystem: true,
        permissions: JSON.stringify({
            users: { create: false, read: false, update: false, delete: false },
            courses: { create: false, read: false, update: false, delete: false, publish: false },
            settings: { read: false, update: false },
            analytics: { viewOwn: false, viewAll: false, export: false },
            roles: { create: false, read: false, update: false, delete: false, assign: false }
        })
    }
];

function generateId(): string {
    return `ur_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
}

async function seedSystemRoles(): Promise<void> {
    const now = new Date();
    
    for (const systemRole of SYSTEM_ROLES) {
        const existingRole = db.select().from(role).where(eq(role.name, systemRole.name)).get();
        
        if (!existingRole) {
            db.insert(role).values({
                ...systemRole,
                isActive: true,
                createdAt: now,
                updatedAt: now
            }).run();
            console.log(`✓ Rol '${systemRole.displayName}' creado`);
        } else {
            console.log(`→ Rol '${systemRole.displayName}' ya existe`);
        }
    }
}

function mapLegacyRoleToRoleId(legacyRole: string): string {
    switch (legacyRole) {
        case 'admin':
            return 'role_admin';
        case 'teacher':
            return 'role_teacher';
        case 'student':
            return 'role_student';
        default:
            return 'role_user'; // Usuarios sin rol definido obtienen rol básico
    }
}

async function migrateExistingUsersToRoles(): Promise<void> {
    const now = new Date();
    const users = db.select().from(user).all();
    
    let migratedCount = 0;
    let skippedCount = 0;
    
    for (const u of users) {
        const existingAssignment = db
            .select()
            .from(userRoleAssignment)
            .where(eq(userRoleAssignment.userId, u.id))
            .get();
        
        if (existingAssignment) {
            skippedCount++;
            continue;
        }
        
        const roleId = mapLegacyRoleToRoleId(u.role);
        
        db.insert(userRoleAssignment).values({
            id: generateId(),
            userId: u.id,
            roleId: roleId,
            assignedAt: now,
            isActive: true,
            reason: 'Migración automática desde sistema legacy'
        }).run();
        
        const assignedRole = SYSTEM_ROLES.find(r => r.id === roleId);
        db.insert(roleAuditLog).values({
            id: `ral_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`,
            userId: u.id,
            roleId: roleId,
            roleName: assignedRole?.name || roleId,
            action: 'assigned',
            reason: 'Migración automática desde sistema legacy',
            metadata: JSON.stringify({ legacyRole: u.role }),
            createdAt: now
        }).run();
        
        migratedCount++;
    }
    
    console.log(`✓ Migración completada: ${migratedCount} usuarios migrados, ${skippedCount} omitidos`);
}

async function main() {
    console.log('=== Seed de Roles del Sistema - SAPIN ===\n');
    
    console.log('1. Creando roles del sistema...');
    await seedSystemRoles();
    
    console.log('\n2. Migrando usuarios existentes...');
    await migrateExistingUsersToRoles();
    
    console.log('\n=== Seed completado exitosamente ===');
    
    client.close();
}

main().catch((error) => {
    console.error('❌ Error durante el seed:', error);
    client.close();
    process.exit(1);
});
