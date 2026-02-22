import type { PageServerLoad, Actions } from './$types';
import { db, CourseRoleUtils } from '$lib/server/db';
import { interactiveLearning, courseInteractiveLearning, userInteractiveLearningChat } from '$lib/server/db/schema';
import { eq, inArray } from 'drizzle-orm';
import { fail } from '@sveltejs/kit';

export const load = (async ({ params }) => {
    // Get enrolled students usando el nuevo sistema de roles por curso
    const courseUsers = await CourseRoleUtils.getCourseUsers(params.cid);
    const students = courseUsers
        .filter(u => u.role === 'student')
        .map(u => ({
            id: u.userId,
            visitorId: u.userId,
            userId: u.userId,
            username: u.username,
            email: u.email,
            image: u.image
        }));
    const studentIds = students.map(s => s.userId);

    // Get course activities
    const activities = await db
        .select({
            id: interactiveLearning.id,
            name: interactiveLearning.name,
            type: interactiveLearning.type,
            order: courseInteractiveLearning.order
        })
        .from(courseInteractiveLearning)
        .innerJoin(
            interactiveLearning,
            eq(courseInteractiveLearning.interactiveLearningId, interactiveLearning.id)
        )
        .where(eq(courseInteractiveLearning.courseId, params.cid))
        .orderBy(courseInteractiveLearning.order);

    // Get student progress
    const studentProgress = await db
        .select({
            userId: userInteractiveLearningChat.userId,
            activityId: interactiveLearning.id,
            lastAccessed: userInteractiveLearningChat.createdAt
        })
        .from(userInteractiveLearningChat)
        .innerJoin(
            interactiveLearning,
            eq(interactiveLearning.id, userInteractiveLearningChat.interactiveLearningChatId)
        )
        .where(inArray(userInteractiveLearningChat.userId, studentIds));

    return {
        students,
        activities,
        studentProgress,
        courseId: params.cid
    };
}) satisfies PageServerLoad;

export const actions = {
    /**
     * Unenroll a single student from the course
     */
    unenrollStudent: async ({ request }) => {
        const formData = await request.formData();
        const studentId = formData.get('studentId') as string;
        const courseId = formData.get('courseId') as string;
        
        if (!studentId || !courseId) {
            return fail(400, { message: 'Se requieren el ID del estudiante y el ID del curso' });
        }
        
        try {
            // Revocar rol de estudiante usando el nuevo sistema
            const result = await CourseRoleUtils.revokeCourseRole(courseId, studentId, 'student');
            
            if (!result.success) {
                return fail(400, { message: result.error || 'Error al dar de baja al estudiante' });
            }
                
            return {
                status: 200,
                body: { message: 'Estudiante dado de baja exitosamente' },
                type: 'success'
            };
        } catch (error) {
            console.error('Error al dar de baja al estudiante:', error);
            return fail(500, { 
                message: 'Error al dar de baja al estudiante',
                error: error instanceof Error ? error.message : String(error)
            });
        }
    },
    
    /**
     * Unenroll multiple students from the course in bulk
     */
    unenrollBulk: async ({ request }) => {
        const formData = await request.formData();
        const studentIdsJSON = formData.get('studentIds') as string;
        const courseId = formData.get('courseId') as string;
        
        if (!studentIdsJSON || !courseId) {
            return fail(400, { message: 'Se requieren los IDs de los estudiantes y el ID del curso' });
        }
        
        let studentIds: string[];
        try {
            studentIds = JSON.parse(studentIdsJSON);
            if (!Array.isArray(studentIds)) {
                throw new Error('Los IDs de los estudiantes deben ser un array');
            }
        } catch {
            return fail(400, { message: 'Formato inválido de IDs de estudiantes' });
        }
        
        if (studentIds.length === 0) {
            return fail(400, { message: 'No hay estudiantes seleccionados para dar de baja' });
        }
        
        try {
            // Revocar roles de estudiante en bloque usando el nuevo sistema
            let successCount = 0;
            for (const studentId of studentIds) {
                const result = await CourseRoleUtils.revokeCourseRole(courseId, studentId, 'student');
                if (result.success) successCount++;
            }
                
            return {
                status: 200,
                body: { 
                    message: `${successCount} estudiantes dados de baja exitosamente`,
                    count: successCount
                },
                type: 'success'
            };
        } catch (error) {
            console.error('Error al dar de baja a los estudiantes en bloque:', error);
            return fail(500, { 
                message: 'Error al dar de baja a los estudiantes',
                error: error instanceof Error ? error.message : String(error)
            });
        }
    }
} satisfies Actions;