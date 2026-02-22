import { db } from ".";
import { eq, and } from "drizzle-orm";
import * as schema from "./schema";
import { nanoid } from "nanoid";

export interface InteractiveChatInterface {
    interactive_learning: typeof schema.interactiveLearning.$inferSelect;
    interactive_learning_chat: typeof schema.interactiveLearningChat.$inferSelect;
    course: typeof schema.course.$inferSelect | null;
}

export interface ChatInstanceInterface {
    chat: typeof schema.chat.$inferSelect;
    user: typeof schema.user.$inferSelect;
    messages: typeof schema.message.$inferSelect[];
}

// Define interfaces for filtering and sorting options
export interface ChatFilterOptions {
    userId?: string;
    startDate?: Date;
    endDate?: Date;
    searchTerm?: string;
}

export interface ChatSortOptions {
    field: 'createdAt' | 'username' | 'messageCount';
    direction: 'asc' | 'desc';
}

export interface ChatPaginationOptions {
    page: number;
    pageSize: number;
}

export interface PaginatedChatResult {
    chats: ChatInstanceInterface[];
    totalCount: number;
    totalPages: number;
    currentPage: number;
}

export default class DBChatUtils {

    // Save a message to the database on the chat instance with the provided chat id    
    static async saveMessage(chatId: string, content: string, type: keyof typeof schema.messageType, metadata?: string) {
        return await db.insert(schema.message).values({
            id: nanoid(),
            chatId,
            content,
            type,
            tokenCount: 0,
            finishReason: 'stop',
            metadata,
            createdAt: new Date()
        });
    }

    static async loadInteractiveChatFromChatId(interactive_learning_chat_id: string): Promise<InteractiveChatInterface> {
        const [interactive_learning_chat] = await db
            .select()
            .from(schema.interactiveLearningChat)
            .where(eq(schema.interactiveLearningChat.id, interactive_learning_chat_id))

        if (!interactive_learning_chat) {
            throw new Error("No interactive learning chat found with the provided ID.");
        }

        const [interactive_learning] = await db
            .select()
            .from(schema.interactiveLearning)
            .where(eq(schema.interactiveLearning.id, interactive_learning_chat.id))

        if (!interactive_learning) {
            throw new Error("No interactive learning found with the provided ID.");
        }

        //get course for this interactive learning
        const [{ course_id }] = await db
            .select({ course_id: schema.courseInteractiveLearning.courseId })
            .from(schema.courseInteractiveLearning)
            .where(eq(schema.courseInteractiveLearning.interactiveLearningId, interactive_learning.id))

        let course = null;
        if (course_id) {
            [course] = await db
                .select()
                .from(schema.course)
                .where(eq(schema.course.id, course_id))
                .limit(1);

        }

        return { interactive_learning, interactive_learning_chat, course };
    }

    /**
     * Carga una actividad interactiva de tipo chat desde su ID.
     * @param interactive_learning_id ID de la actividad interactiva
     * @param options Opciones de carga
     * @param options.bypassStatusCheck Si es true, no valida el status (para staff/admins)
     */
    static async loadInteractiveChatFromInteractiveId(
        interactive_learning_id: string,
        options?: { bypassStatusCheck?: boolean }
    ): Promise<InteractiveChatInterface> {
        const result = await db
            .select()
            .from(schema.interactiveLearning)
            .where(eq(schema.interactiveLearning.id, interactive_learning_id))
            .limit(1);

        if (result.length === 0) {
            throw new Error("No interactive learning found with the provided ID.");
        }

        const interactive_learning = result[0];

        if (interactive_learning.type !== "chat") {
            throw new Error("Interactive learning is not a chat.");
        }

        // Verificar que la actividad esté disponible para acceso
        // Staff y admins pueden acceder a actividades en cualquier estado (bypassStatusCheck)
        // Estudiantes pueden acceder a:
        // - published: acceso completo (crear chats, enviar mensajes)
        // - closed: solo lectura (ver historial, no crear nuevos chats)
        // - draft/archived: sin acceso
        if (!options?.bypassStatusCheck) {
            const status = interactive_learning.status;
            if (status !== 'published' && status !== 'closed') {
                throw new Error("Interactive learning is not available. Status: " + status);
            }
        }

        const result2 = await db
            .select()
            .from(schema.interactiveLearningChat)
            .where(eq(schema.interactiveLearningChat.id, interactive_learning_id))
            .limit(1);


        if (result2.length === 0) {
            throw new Error("No interactive learning chat found for the provided interactive learning ID.");
        }

        const interactive_learning_chat = result2[0];

        //get course for this interactive learning
        const result3 = await db
            .select()
            .from(schema.courseInteractiveLearning)
            .where(eq(schema.courseInteractiveLearning.interactiveLearningId, interactive_learning.id))
            .limit(1);

        let course = null;
        if (result3.length > 0) {
            const course_id = result3[0].courseId;
            const result4 = await db
                .select()
                .from(schema.course)
                .where(eq(schema.course.id, course_id))
                .limit(1);

            if (result4.length > 0) {
                course = result4[0];
            }
        }

        return { interactive_learning, interactive_learning_chat, course };
    }

    /// Get all chat instances for a given interactive learning chat ID (interactive_learning_chat.id).
    /// Supports filtering, sorting, and pagination.
    static async getAllChatInstancesFromInteractiveId(
        interactive_learning_chat_id: string,
        filterOptions?: ChatFilterOptions,
        sortOptions?: ChatSortOptions,
        paginationOptions?: ChatPaginationOptions
    ): Promise<PaginatedChatResult> {
        // Default values
        const filters = [
            eq(schema.userInteractiveLearningChat.interactiveLearningChatId, interactive_learning_chat_id)
        ];

        // Apply user filter if provided
        if (filterOptions?.userId) {
            filters.push(eq(schema.userInteractiveLearningChat.userId, filterOptions.userId));
        }

        // Get all matching chat IDs
        const userChats = await db
            .select()
            .from(schema.userInteractiveLearningChat)
            .where(and(...filters));

        // Load all chat instances
        const chatInstances = await Promise.all(
            userChats.map(chat => this.loadChatInstanceFromChatId(chat.chatId))
        );

        // Apply date filtering if provided
        let filteredChats = chatInstances;
        if (filterOptions?.startDate || filterOptions?.endDate) {
            filteredChats = filteredChats.filter(chat => {
                const chatDate = new Date(chat.chat.createdAt);
                if (filterOptions.startDate && chatDate < filterOptions.startDate) {
                    return false;
                }
                if (filterOptions.endDate && chatDate > filterOptions.endDate) {
                    return false;
                }
                return true;
            });
        }

        // Apply search term filtering if provided
        if (filterOptions?.searchTerm) {
            const searchTerm = filterOptions.searchTerm.toLowerCase();
            filteredChats = filteredChats.filter(chat => {
                // Search in user information
                if (chat.user.username?.toLowerCase().includes(searchTerm)) return true;
                if (chat.user.email?.toLowerCase().includes(searchTerm)) return true;
                if (chat.user.alias?.toLowerCase().includes(searchTerm)) return true;

                // Search in messages
                return chat.messages.some(msg =>
                    msg.content.toLowerCase().includes(searchTerm)
                );
            });
        }

        // Apply sorting
        if (sortOptions) {
            filteredChats.sort((a, b) => {
                let valueA, valueB;

                switch (sortOptions.field) {
                    case 'createdAt':
                        valueA = new Date(a.chat.createdAt).getTime();
                        valueB = new Date(b.chat.createdAt).getTime();
                        break;
                    case 'username':
                        valueA = a.user.username || '';
                        valueB = b.user.username || '';
                        break;
                    case 'messageCount':
                        valueA = a.messages.length;
                        valueB = b.messages.length;
                        break;
                    default:
                        valueA = new Date(a.chat.createdAt).getTime();
                        valueB = new Date(b.chat.createdAt).getTime();
                }

                const direction = sortOptions.direction === 'asc' ? 1 : -1;

                if (typeof valueA === 'string' && typeof valueB === 'string') {
                    return direction * valueA.localeCompare(valueB);
                }

                return direction * ((valueA as number) - (valueB as number));
            });
        } else {
            // Default sort: most recent first
            filteredChats.sort((a, b) =>
                new Date(b.chat.createdAt).getTime() - new Date(a.chat.createdAt).getTime()
            );
        }

        // Calculate pagination
        const totalCount = filteredChats.length;
        const page = paginationOptions?.page || 1;
        const pageSize = paginationOptions?.pageSize || totalCount;
        const totalPages = Math.ceil(totalCount / pageSize);

        // Apply pagination
        const startIndex = (page - 1) * pageSize;
        const endIndex = startIndex + pageSize;
        const paginatedChats = filteredChats.slice(startIndex, endIndex);

        return {
            chats: paginatedChats,
            totalCount,
            totalPages,
            currentPage: page
        };
    }

    /// Load a chat instance from a chat ID (interactive_learning_chat.id).
    static async loadChatInstanceFromChatId(chatId: string): Promise<ChatInstanceInterface> {
        const [chat] = await db
            .select()
            .from(schema.chat)
            .where(eq(schema.chat.id, chatId))

        if (!chat) {
            throw new Error("No chat found with the provided ID.");
        }

        const messages = await db
            .select()
            .from(schema.message)
            .where(eq(schema.message.chatId, chatId));

        const [user] = await db
            .select()
            .from(schema.user)
            .where(eq(schema.user.id, chat.userId))

        if (!user) {
            throw new Error("No user found with the provided ID.");
        }

        return { chat, messages, user };
    }
}
