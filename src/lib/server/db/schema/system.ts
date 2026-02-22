import { sqliteTable, text, integer } from 'drizzle-orm/sqlite-core';

export const appSetting = sqliteTable('app_setting', {
    id: text('id').primaryKey(),
    key: text('key').notNull().unique(),
    value: text('value').notNull(),
    createdAt: integer('created_at', { mode: 'timestamp' }).notNull()
});

export type AppSetting = typeof appSetting.$inferSelect;
