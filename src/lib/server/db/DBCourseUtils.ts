import { db } from '$lib/server/db';
import * as table from '$lib/server/db/schema';
import { eq, and } from 'drizzle-orm';

export default class DBCourseUtils {
    static async getCourse(courseId: string) {
        try {
            const [course] = await db
                .select()
                .from(table.course)
                .where(eq(table.course.id, courseId));
            return course;
        } catch (error) {
            console.error('Error in getCourse:', error);
            throw error;
        }
    }

    static deleteCourse(courseId: string) {
        try {
            // Use a transaction to ensure all related data is deleted consistently
            return db.transaction((tx) => {
                // 1. Delete course roles (nuevo sistema de roles)
                tx.delete(table.courseRole)
                    .where(eq(table.courseRole.courseId, courseId)).run();

                // 2. Delete course files
                tx.delete(table.courseFile)
                    .where(eq(table.courseFile.courseId, courseId)).run();

                // 4. Delete invites related to the course
                tx.delete(table.invite)
                    .where(eq(table.invite.courseId, courseId)).run();

                // 5. Get all interactive learning IDs associated with this course
                const courseInteractiveLearnings = tx
                    .select({ ilId: table.courseInteractiveLearning.interactiveLearningId })
                    .from(table.courseInteractiveLearning)
                    .where(eq(table.courseInteractiveLearning.courseId, courseId)).all();
                
                const ilIds = courseInteractiveLearnings.map(item => item.ilId);

                if (ilIds.length > 0) {
                    // 6. Delete course-interactive learning relationships
                    tx.delete(table.courseInteractiveLearning)
                        .where(eq(table.courseInteractiveLearning.courseId, courseId)).run();

                    // For each interactive learning item, delete related data
                    for (const ilId of ilIds) {
                        // 7. Get all interactive learning chat IDs (ahora el id del chat ES el ilId)
                        const ilChats = tx
                            .select({ id: table.interactiveLearningChat.id })
                            .from(table.interactiveLearningChat)
                            .where(eq(table.interactiveLearningChat.id, ilId)).all();
                        
                        const ilChatIds = ilChats.map(chat => chat.id);

                        if (ilChatIds.length > 0) {
                            // 8. Delete user interactive learning chats
                            for (const chatId of ilChatIds) {
                                tx.delete(table.userInteractiveLearningChat)
                                    .where(eq(table.userInteractiveLearningChat.interactiveLearningChatId, chatId)).run();
                                
                                // 9. Delete interactive learning chat files
                                tx.delete(table.interactiveLearningChatFile)
                                    .where(eq(table.interactiveLearningChatFile.interactiveLearningChatId, chatId)).run();
                            }

                            // 10. Delete interactive learning chats (ahora el id del chat ES el ilId)
                            tx.delete(table.interactiveLearningChat)
                                .where(eq(table.interactiveLearningChat.id, ilId)).run();
                        }

                        // 11. Delete activity progress records
                        tx.delete(table.learningActivityProgress)
                            .where(and(
                                eq(table.learningActivityProgress.courseId, courseId),
                                eq(table.learningActivityProgress.activityId, ilId)
                            )).run();

                        // 11b. Delete activity progress events
                        tx.delete(table.learningProgressEvent)
                            .where(and(
                                eq(table.learningProgressEvent.courseId, courseId),
                                eq(table.learningProgressEvent.activityId, ilId)
                            )).run();
                    }

                    // 12. Delete the interactive learning items themselves
                    // Only if they're not used in other courses
                    for (const ilId of ilIds) {
                        const otherCourseUses = tx
                            .select()
                            .from(table.courseInteractiveLearning)
                            .where(eq(table.courseInteractiveLearning.interactiveLearningId, ilId)).all();
                        
                        if (otherCourseUses.length === 0) {
                            tx.delete(table.interactiveLearning)
                                .where(eq(table.interactiveLearning.id, ilId)).run();
                        }
                    }
                }

                // 13. Delete student progress records
                tx.delete(table.courseProgressSummary)
                    .where(eq(table.courseProgressSummary.courseId, courseId)).run();

                // 14. Finally, delete the course itself
                tx.delete(table.course)
                    .where(eq(table.course.id, courseId)).run();

                return true;
            });
        } catch (error) {
            console.error('Error in deleteCourse:', error);
            throw error;
        }
    }
}