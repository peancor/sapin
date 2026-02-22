import { and, eq } from 'drizzle-orm';
import { db, DBUserUtils, CourseRoleUtils } from '$lib/server/db';
import { user, courseRole } from '$lib/server/db/schema';
import type { MoodleStudent } from '$lib/server/integrations/moodle/MoodleClient';

export type MoodleImportAction =
    | 'create_and_enroll'
    | 'enroll_only'
    | 'link_and_enroll'
    | 'link_only'
    | 'already_enrolled'
    | 'conflict'
    | 'invalid';

export interface MoodleImportPreviewRow {
    moodleUserId: string;
    email: string;
    firstname: string;
    lastname: string;
    fullname: string;
    action: MoodleImportAction;
    message: string;
    userId?: string;
}

export interface MoodleImportSummary {
    total: number;
    createAndEnroll: number;
    enrollOnly: number;
    linkAndEnroll: number;
    linkOnly: number;
    alreadyEnrolled: number;
    conflicts: number;
    invalid: number;
}

export interface MoodleImportExecutionRow {
    moodleUserId: string;
    email: string;
    status: 'success' | 'skipped' | 'error';
    message: string;
}

function trim(value: string): string {
    return value.trim();
}

function isValidEmail(email: string): boolean {
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

function emptySummary(total = 0): MoodleImportSummary {
    return {
        total,
        createAndEnroll: 0,
        enrollOnly: 0,
        linkAndEnroll: 0,
        linkOnly: 0,
        alreadyEnrolled: 0,
        conflicts: 0,
        invalid: 0
    };
}

function addToSummary(summary: MoodleImportSummary, action: MoodleImportAction) {
    if (action === 'create_and_enroll') summary.createAndEnroll += 1;
    if (action === 'enroll_only') summary.enrollOnly += 1;
    if (action === 'link_and_enroll') summary.linkAndEnroll += 1;
    if (action === 'link_only') summary.linkOnly += 1;
    if (action === 'already_enrolled') summary.alreadyEnrolled += 1;
    if (action === 'conflict') summary.conflicts += 1;
    if (action === 'invalid') summary.invalid += 1;
}

async function isStudentAlreadyEnrolled(courseId: string, userId: string): Promise<boolean> {
    const existingRole = await db
        .select({ id: courseRole.id })
        .from(courseRole)
        .where(
            and(
                eq(courseRole.courseId, courseId),
                eq(courseRole.userId, userId),
                eq(courseRole.role, 'student'),
                eq(courseRole.isActive, true)
            )
        )
        .get();

    return Boolean(existingRole);
}

async function findUserByEmail(email: string) {
    return db.select().from(user).where(eq(user.email, email)).get();
}

export async function buildMoodleImportPreview(
    courseId: string,
    rawStudents: MoodleStudent[]
): Promise<{ rows: MoodleImportPreviewRow[]; summary: MoodleImportSummary }> {
    const rows: MoodleImportPreviewRow[] = [];
    const summary = emptySummary(rawStudents.length);

    for (const raw of rawStudents) {
        const moodleUserId = trim(raw.moodleUserId);
        const email = trim(raw.email).toLowerCase();
        const firstname = trim(raw.firstname);
        const lastname = trim(raw.lastname);
        const fullname = trim(raw.fullname) || `${firstname} ${lastname}`.trim();

        if (!moodleUserId || !email || !firstname || !lastname || !fullname || !isValidEmail(email)) {
            const row: MoodleImportPreviewRow = {
                moodleUserId,
                email,
                firstname,
                lastname,
                fullname,
                action: 'invalid',
                message: 'Datos obligatorios faltantes o email inválido'
            };
            rows.push(row);
            addToSummary(summary, row.action);
            continue;
        }

        const userIdByExternalId = await DBUserUtils.existsUserWithExternalId(moodleUserId);
        if (userIdByExternalId) {
            const alreadyEnrolled = await isStudentAlreadyEnrolled(courseId, userIdByExternalId);
            const row: MoodleImportPreviewRow = {
                moodleUserId,
                email,
                firstname,
                lastname,
                fullname,
                action: alreadyEnrolled ? 'already_enrolled' : 'enroll_only',
                message: alreadyEnrolled
                    ? 'Ya está inscrito con este externalId'
                    : 'Usuario existente por externalId, se inscribirá',
                userId: userIdByExternalId
            };
            rows.push(row);
            addToSummary(summary, row.action);
            continue;
        }

        const userByEmail = await findUserByEmail(email);
        if (userByEmail) {
            if (userByEmail.externalId && userByEmail.externalId !== moodleUserId) {
                const row: MoodleImportPreviewRow = {
                    moodleUserId,
                    email,
                    firstname,
                    lastname,
                    fullname,
                    action: 'conflict',
                    message: 'El email ya existe con otro externalId',
                    userId: userByEmail.id
                };
                rows.push(row);
                addToSummary(summary, row.action);
                continue;
            }

            const alreadyEnrolled = await isStudentAlreadyEnrolled(courseId, userByEmail.id);
            const row: MoodleImportPreviewRow = {
                moodleUserId,
                email,
                firstname,
                lastname,
                fullname,
                action: alreadyEnrolled ? 'link_only' : 'link_and_enroll',
                message: alreadyEnrolled
                    ? 'Se vinculará externalId (ya inscrito)'
                    : 'Usuario existente por email: se vinculará externalId y se inscribirá',
                userId: userByEmail.id
            };
            rows.push(row);
            addToSummary(summary, row.action);
            continue;
        }

        const row: MoodleImportPreviewRow = {
            moodleUserId,
            email,
            firstname,
            lastname,
            fullname,
            action: 'create_and_enroll',
            message: 'Se creará usuario nuevo y se inscribirá'
        };
        rows.push(row);
        addToSummary(summary, row.action);
    }

    return { rows, summary };
}

async function setExternalIdIfMissing(userId: string, externalId: string) {
    const targetUser = await db.select().from(user).where(eq(user.id, userId)).get();
    if (!targetUser) throw new Error('Usuario no encontrado');
    if (targetUser.externalId && targetUser.externalId !== externalId) {
        throw new Error('Conflicto: el usuario ya tiene otro externalId');
    }
    if (!targetUser.externalId) {
        await db
            .update(user)
            .set({ externalId, updatedAt: new Date() })
            .where(eq(user.id, userId))
            .run();
    }
}

export async function executeMoodleImport(
    courseId: string,
    previewRows: MoodleImportPreviewRow[]
): Promise<{
    results: MoodleImportExecutionRow[];
    summary: { total: number; success: number; skipped: number; errors: number };
}> {
    const results: MoodleImportExecutionRow[] = [];

    for (const row of previewRows) {
        try {
            if (row.action === 'invalid' || row.action === 'conflict') {
                results.push({
                    moodleUserId: row.moodleUserId,
                    email: row.email || 'N/A',
                    status: 'error',
                    message: row.message
                });
                continue;
            }

            if (row.action === 'already_enrolled') {
                results.push({
                    moodleUserId: row.moodleUserId,
                    email: row.email,
                    status: 'skipped',
                    message: 'Ya estaba inscrito'
                });
                continue;
            }

            if (row.action === 'create_and_enroll') {
                const userId = await DBUserUtils.registerUserFromEmailAndExternalId(
                    row.email,
                    row.moodleUserId,
                    row.fullname,
                    row.firstname,
                    row.lastname
                );
                const assignResult = await CourseRoleUtils.assignCourseRole(courseId, userId, 'student');
                if (!assignResult.success) {
                    throw new Error(assignResult.error || 'No se pudo inscribir al estudiante');
                }

                results.push({
                    moodleUserId: row.moodleUserId,
                    email: row.email,
                    status: 'success',
                    message: 'Usuario creado e inscrito'
                });
                continue;
            }

            if (!row.userId) {
                throw new Error('No se pudo resolver el usuario destino');
            }

            if (row.action === 'link_only' || row.action === 'link_and_enroll') {
                await setExternalIdIfMissing(row.userId, row.moodleUserId);
            }

            if (row.action === 'enroll_only' || row.action === 'link_and_enroll') {
                const assignResult = await CourseRoleUtils.assignCourseRole(courseId, row.userId, 'student');
                if (!assignResult.success && assignResult.error !== 'El usuario ya tiene este rol en el curso') {
                    throw new Error(assignResult.error || 'No se pudo inscribir al estudiante');
                }
            }

            results.push({
                moodleUserId: row.moodleUserId,
                email: row.email,
                status: 'success',
                message:
                    row.action === 'link_only'
                        ? 'externalId vinculado'
                        : row.action === 'link_and_enroll'
                            ? 'externalId vinculado e inscripción realizada'
                            : 'Inscripción realizada'
            });
        } catch (error) {
            results.push({
                moodleUserId: row.moodleUserId,
                email: row.email || 'N/A',
                status: 'error',
                message: error instanceof Error ? error.message : 'Error desconocido'
            });
        }
    }

    return {
        results,
        summary: {
            total: results.length,
            success: results.filter((r) => r.status === 'success').length,
            skipped: results.filter((r) => r.status === 'skipped').length,
            errors: results.filter((r) => r.status === 'error').length
        }
    };
}
