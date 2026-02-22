import { nanoid } from 'nanoid';
import { db } from '$lib/server/db';
import * as table from '$lib/server/db/schema';
import { eq, or } from 'drizzle-orm';
import { hash, verify } from '@node-rs/argon2';
import {remove as diacriticsRemove} from 'diacritics';

const avatarFiles = import.meta.glob('/static/images/avatar_icons/delapouite/*')


export default class DBUserUtils {

    static async getRamdomAvatar() {
        try {
            const svgFiles = Object.keys(avatarFiles).filter((file: string) => file.endsWith('.svg'));
            if (svgFiles.length === 0) {
                throw new Error("No SVG files found in the directory");
            }
            const randomIndex = Math.floor(Math.random() * svgFiles.length);
            //remove the static prefix
            return svgFiles[randomIndex].replace('/static', '');

        } catch (error) {
            console.error("Error in getRamdomAvatar:", error);
            throw error;
        }
    }

    static async existsUserWithExternalId(externalId: string): Promise<string | null> {
        try {
            const [existingUser] = await db
                .select()
                .from(table.user)
                .where(eq(table.user.externalId, externalId));

            return existingUser ? existingUser.id : null;
        } catch (error) {
            console.error('Error in ExistsUserWithExternalId:', error);
            throw error;
        }
    }

    static async registerUserFromEmailAndExternalId(email: string, externalId: string, fullname: string, firstname: string,
        lastname: string, useRandomAvatar: boolean = true) {
        try {
            // Check if a user with the given email or externalId already exists
            const [existingUser] = await db
                .select()
                .from(table.user)
                .where(or(eq(table.user.email, email), eq(table.user.externalId, externalId)));

            if (existingUser) {
                throw new Error('User with the given email or external ID already exists');
            }

            // Create a new user object
            const userId = nanoid();
            // Generate a secure random password for external auth users
            const randomPassword = crypto.getRandomValues(new Uint8Array(32));
            const passwordHash = await hash(Buffer.from(randomPassword).toString('base64'), {
                memoryCost: 65536,
                timeCost: 3,
                parallelism: 4,
                outputLen: 32,
            });

            const now = new Date();

            let avatarPath: string | null = null;
            if (useRandomAvatar) {
                avatarPath = await this.getRamdomAvatar();
            }

            await db.insert(table.user).values({
                id: userId,
                username: fullname || null,
                alias: firstname || null,
                externalId,
                image: avatarPath,
                passwordHash,
                email,
                createdAt: now,
                updatedAt: now
            });
            return userId;
        } catch (error) {
            console.error('Error in registerUserFromEmailAndExternalId:', error);
            throw error;
        }
    }

    static async registerUser({
        username,
        password,
        email,
        inviteCode
    }: {
        username?: string;
        password: string;
        email: string;
        inviteCode?: string;
    }) {
        const userId = nanoid();
        // Argon2 automatically generates and embeds a secure random salt in the hash
        const passwordHash = await hash(password, {
            memoryCost: 65536,
            timeCost: 3,
            parallelism: 4,
            outputLen: 32,
        });

        const now = new Date();

        await db.insert(table.user).values({
            id: userId,
            username: username || null,
            passwordHash,
            email,
            inviteCode,
            createdAt: now,
            updatedAt: now
        });

        return userId;
    }

    static async verifyPassword(userId: string, password: string): Promise<boolean> {
        const [user] = await db
            .select({ passwordHash: table.user.passwordHash })
            .from(table.user)
            .where(eq(table.user.id, userId));

        if (!user) {
            return false;
        }

        // Argon2 extracts the salt from the encoded hash automatically
        return await verify(user.passwordHash, password);
    }

    static async changePassword(userId: string, newPassword: string) {
        // Argon2 automatically generates and embeds a secure random salt in the hash
        const passwordHash = await hash(newPassword, {
            memoryCost: 65536,
            timeCost: 3,
            parallelism: 4,
            outputLen: 32,
        });

        await db.update(table.user)
            .set({
                passwordHash,
                updatedAt: new Date()
            })
            .where(eq(table.user.id, userId));

        return true;
    }

    static deleteUser(userId: string) {
        try {
            return db.transaction((tx) => {
                // Delete all sessions for this user
                tx.delete(table.session).where(eq(table.session.userId, userId)).run();

                // Delete course roles
                tx.delete(table.courseRole).where(eq(table.courseRole.userId, userId)).run();

                // Delete student progress records
                tx.delete(table.courseProgressSummary).where(eq(table.courseProgressSummary.userId, userId)).run();

                // Delete activity progress records
                tx.delete(table.learningActivityProgress).where(eq(table.learningActivityProgress.userId, userId)).run();

                // Delete chat-related data

                // Delete user interactive learning chat relationships
                tx.delete(table.userInteractiveLearningChat).where(eq(table.userInteractiveLearningChat.userId, userId)).run();

                // First get all chats owned by the user
                const userChats = tx.select().from(table.chat).where(eq(table.chat.userId, userId)).all();

                for (const chat of userChats) {
                    // Delete all messages in each chat
                    tx.delete(table.message).where(eq(table.message.chatId, chat.id)).run();
                }

                // Delete all user's chats
                tx.delete(table.chat).where(eq(table.chat.userId, userId)).run();

                // Delete invites created by or used by this user
                tx.delete(table.invite).where(
                    or(
                        eq(table.invite.createdBy, userId),
                        eq(table.invite.usedBy, userId)
                    )
                ).run();

                // Finally delete the user
                tx.delete(table.user).where(eq(table.user.id, userId)).run();

                return true;
            });
        } catch (error) {
            console.error('Error in deleteUser:', error);
            throw error;
        }
    }

    static async getAllUsers() {
        try {
            const users = await db
                        .select()
                        .from(table.user);
            //order by username with diacritics
            users.sort((a, b) => diacriticsRemove(a.username || '').localeCompare(diacriticsRemove(b.username || '')));
            return users;
        } catch (error) {
            console.error('Error in getAllUsers:', error);
            throw error;
        }
    }

    static async getUserById(userId: string) {
        try {
            return await db
            .select().from(table.user).where(eq(table.user.id, userId));
        } catch (error) {
            console.error('Error in getUserById:', error);
            throw error;
        }
    }

    static async updateUser(userId: string, updates: Partial<{ 
        username: string; 
        email: string;
    }>) {
        try {
            await db.update(table.user)
                .set({
                    ...updates,
                    updatedAt: new Date(),
                })
                .where(eq(table.user.id, userId));
            return true;
        } catch (error) {
            console.error('Error in updateUser:', error);
            throw error;
        }
    }
}
