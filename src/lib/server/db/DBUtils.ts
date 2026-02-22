import { db } from ".";
import { eq, and } from "drizzle-orm";
import * as schema from "./schema";


export default class DBUtils {
    static async getSetting(key: string, defaultValue: string = ''): Promise<string> {
        const result = await db.select().from(schema.appSetting).where(eq(schema.appSetting.key, key));
        return result[0]?.value ?? defaultValue;
    }
}