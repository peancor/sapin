/**
 * Migration: Upgrade invite table for the new invitation system
 * 
 * Changes:
 * - Add `config` column (JSON, NOT NULL with default)
 * - Add `max_uses` column (integer, default 1)
 * - Add `use_count` column (integer, default 0) 
 * - Add `used_at` column (timestamp)
 * - Add `is_active` column (boolean, default true)
 * - Make `course_id` nullable
 * - Migrate existing `used` data to `use_count`
 * - Drop old `used` column
 * - Add new indexes
 */
import Database from 'better-sqlite3';
import path from 'path';

const DB_PATH = process.env.DATABASE_URL || path.resolve('local.db');
const db = new Database(DB_PATH);

console.log('Starting invite table migration...');
console.log('Database:', DB_PATH);

db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = OFF');

const migrate = db.transaction(() => {
    // Check current table structure
    const columns = db.prepare("PRAGMA table_info('invite')").all() as any[];
    const columnNames = columns.map((c: any) => c.name);
    console.log('Current columns:', columnNames.join(', '));

    const hasConfig = columnNames.includes('config');
    const hasMaxUses = columnNames.includes('max_uses');
    const hasUseCount = columnNames.includes('use_count');
    const hasUsedAt = columnNames.includes('used_at');
    const hasIsActive = columnNames.includes('is_active');
    const hasUsed = columnNames.includes('used');

    if (hasConfig && hasMaxUses && hasUseCount && hasUsedAt && hasIsActive) {
        console.log('Migration already applied. Skipping.');
        return;
    }

    // Step 1: Create the new table
    db.exec(`
        CREATE TABLE IF NOT EXISTS invite_new (
            id TEXT PRIMARY KEY NOT NULL,
            code TEXT NOT NULL UNIQUE,
            campaign TEXT,
            email TEXT,
            config TEXT NOT NULL DEFAULT '{"type":"course_student","courseId":""}',
            created_by TEXT NOT NULL REFERENCES user(id),
            max_uses INTEGER NOT NULL DEFAULT 1,
            use_count INTEGER NOT NULL DEFAULT 0,
            used_by TEXT REFERENCES user(id),
            used_at INTEGER,
            expires_at INTEGER NOT NULL,
            created_at INTEGER NOT NULL,
            course_id TEXT REFERENCES course(id),
            is_active INTEGER NOT NULL DEFAULT 1
        )
    `);

    // Step 2: Copy data from old table, transforming used -> use_count, generating config
    const existingRows = db.prepare('SELECT * FROM invite').all() as any[];
    console.log(`Migrating ${existingRows.length} existing invites...`);

    const insertStmt = db.prepare(`
        INSERT INTO invite_new (id, code, campaign, email, config, created_by, max_uses, use_count, used_by, used_at, expires_at, created_at, course_id, is_active)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    for (const row of existingRows) {
        const config = JSON.stringify({
            type: 'course_student',
            courseId: row.course_id || ''
        });
        const useCount = row.used ? 1 : 0;
        const isActive = row.used ? 0 : 1;

        insertStmt.run(
            row.id,
            row.code,
            row.campaign,
            row.email,
            config,
            row.created_by,
            1,              // max_uses
            useCount,       // use_count
            row.used_by,
            null,           // used_at (no data in old schema)
            row.expires_at,
            row.created_at,
            row.course_id,
            isActive
        );
    }

    // Step 3: Drop old table and rename new one
    db.exec('DROP TABLE invite');
    db.exec('ALTER TABLE invite_new RENAME TO invite');

    // Step 4: Create indexes
    db.exec('CREATE INDEX IF NOT EXISTS invite_code_idx ON invite(code)');
    db.exec('CREATE INDEX IF NOT EXISTS invite_courseId_idx ON invite(course_id)');
    db.exec('CREATE INDEX IF NOT EXISTS invite_createdBy_idx ON invite(created_by)');

    console.log('Migration completed successfully!');
});

try {
    migrate();
} catch (error) {
    console.error('Migration failed:', error);
    process.exit(1);
} finally {
    db.pragma('foreign_keys = ON');
    db.close();
}
