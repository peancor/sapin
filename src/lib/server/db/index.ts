import { drizzle } from 'drizzle-orm/better-sqlite3';
import Database from 'better-sqlite3';
import { env } from '$env/dynamic/private';
import fs from 'node:fs';
import path from 'node:path';
import DBUserUtils from './DBUserUtils';
import DBCourseUtils from './DBCourseUtils';
import LoginUtils from './LoginUtils';
import DBChatUtils from './DBChatUtils';
import RoleUtils from './RoleUtils';
import CourseRoleUtils from './CourseRoleUtils';
import InteractiveChatAuthUtils from './InteractiveChatAuthUtils';
import CourseInteractiveAuthUtils from './CourseInteractiveAuthUtils';
import InvitationUtils from './InvitationUtils';
import type { ChatInstanceInterface, InteractiveChatInterface } from './DBChatUtils';
import type { Permission, Permissions, UserWithRoles } from './RoleUtils';
import * as schema from './schema';
if (!env.DATABASE_URL) throw new Error('DATABASE_URL is not set');

const dbPath = env.DATABASE_URL;
const dbDir = path.dirname(dbPath);

if (!fs.existsSync(dbDir)) {
  fs.mkdirSync(dbDir, { recursive: true });
}

const client = new Database(env.DATABASE_URL);
export const db = drizzle(client, { schema });

export {
  DBUserUtils, DBCourseUtils,
  LoginUtils, DBChatUtils, RoleUtils, CourseRoleUtils, InteractiveChatAuthUtils, CourseInteractiveAuthUtils,
  InvitationUtils,
  type ChatInstanceInterface, type InteractiveChatInterface,
  type Permission, type Permissions, type UserWithRoles
};