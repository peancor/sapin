/**
 * Migration Script: Drop Old Enrollment Tables
 *
 * This script removes the deprecated course_enrollment and course_teacher tables
 * that have been replaced by the new course_role system.
 *
 * IMPORTANT: Ensure you have run the migrate-course-roles.ts script first to
 * migrate all data from the old tables to course_role before running this script.
 *
 * Usage:
 *   npx tsx scripts/migrate-drop-old-enrollment-tables.ts
 *
 * Options:
 *   --dry-run    Show what would be done without making changes
 *   --backup     Create a backup before migrating (recommended)
 *   --force      Skip confirmation prompts
 */

import Database from 'better-sqlite3';
import fs from 'fs';
import readline from 'readline';

// Configuration - adjust if needed
const DB_PATH = process.env.DATABASE_URL || './sapin.db';

const args = process.argv.slice(2);
const isDryRun = args.includes('--dry-run');
const shouldBackup = args.includes('--backup');
const forceRun = args.includes('--force');

console.log('='.repeat(60));
console.log('Migration: Drop Old Enrollment Tables');
console.log('='.repeat(60));
console.log(`Database: ${DB_PATH}`);
console.log(`Dry Run: ${isDryRun}`);
console.log(`Backup: ${shouldBackup}`);
console.log(`Force: ${forceRun}`);
console.log('');

// Check if database exists
if (!fs.existsSync(DB_PATH)) {
    console.error(`Error: Database not found at ${DB_PATH}`);
    console.error('Set DATABASE_URL environment variable or check the path.');
    process.exit(1);
}

async function askConfirmation(question: string): Promise<boolean> {
    if (forceRun) return true;

    const rl = readline.createInterface({
        input: process.stdin,
        output: process.stdout
    });

    return new Promise((resolve) => {
        rl.question(question + ' (y/N): ', (answer) => {
            rl.close();
            resolve(answer.toLowerCase() === 'y' || answer.toLowerCase() === 'yes');
        });
    });
}

async function main() {
    // Create backup if requested
    if (shouldBackup && !isDryRun) {
        const backupPath = `${DB_PATH}.backup-${Date.now()}`;
        console.log(`Creating backup at: ${backupPath}`);
        fs.copyFileSync(DB_PATH, backupPath);
        console.log('Backup created successfully.\n');
    }

    const db = new Database(DB_PATH);

    try {
        // Step 1: Check if tables exist
        console.log('Step 1: Checking current database state...');

        const tableCheck = db.prepare(`
            SELECT name FROM sqlite_master
            WHERE type='table' AND name IN ('course_enrollment', 'course_teacher')
        `).all() as Array<{ name: string }>;

        const existingTables = tableCheck.map(t => t.name);

        if (existingTables.length === 0) {
            console.log('Tables course_enrollment and course_teacher do not exist.');
            console.log('Migration already completed or tables were never created.');
            process.exit(0);
        }

        console.log(`  - Found tables to drop: ${existingTables.join(', ')}`);
        console.log('');

        // Step 2: Check data in old tables
        console.log('Step 2: Analyzing data in old tables...');

        let enrollmentCount = 0;
        let teacherCount = 0;

        if (existingTables.includes('course_enrollment')) {
            const result = db.prepare('SELECT COUNT(*) as count FROM course_enrollment').get() as { count: number };
            enrollmentCount = result.count;
            console.log(`  - course_enrollment records: ${enrollmentCount}`);
        }

        if (existingTables.includes('course_teacher')) {
            const result = db.prepare('SELECT COUNT(*) as count FROM course_teacher').get() as { count: number };
            teacherCount = result.count;
            console.log(`  - course_teacher records: ${teacherCount}`);
        }

        // Step 3: Check course_role table exists and has data
        console.log('');
        console.log('Step 3: Verifying course_role table...');

        const courseRoleExists = db.prepare(`
            SELECT name FROM sqlite_master
            WHERE type='table' AND name = 'course_role'
        `).get();

        if (!courseRoleExists) {
            console.error('ERROR: course_role table does not exist!');
            console.error('Please run the migration to create course_role first.');
            process.exit(1);
        }

        const courseRoleCount = db.prepare('SELECT COUNT(*) as count FROM course_role').get() as { count: number };
        console.log(`  - course_role records: ${courseRoleCount.count}`);

        if (courseRoleCount.count === 0 && (enrollmentCount > 0 || teacherCount > 0)) {
            console.warn('');
            console.warn('WARNING: course_role table is empty but old tables have data!');
            console.warn('This suggests the data migration has not been completed.');
            console.warn('Please run migrate-course-roles.ts first to migrate the data.');

            const proceed = await askConfirmation('Do you still want to proceed and DROP the old tables?');
            if (!proceed) {
                console.log('Migration cancelled.');
                process.exit(0);
            }
        }

        console.log('');

        if (isDryRun) {
            console.log('DRY RUN MODE - No changes will be made.\n');
        }

        // Step 4: Drop tables
        console.log('Step 4: Dropping old tables...');

        if (!isDryRun) {
            if (existingTables.includes('course_enrollment')) {
                db.exec('DROP TABLE IF EXISTS course_enrollment');
                console.log('  - Dropped course_enrollment');
            }

            if (existingTables.includes('course_teacher')) {
                db.exec('DROP TABLE IF EXISTS course_teacher');
                console.log('  - Dropped course_teacher');
            }
        } else {
            console.log('  - Would drop course_enrollment');
            console.log('  - Would drop course_teacher');
        }

        console.log('');

        // Step 5: Verify
        console.log('Step 5: Verifying tables were dropped...');

        if (!isDryRun) {
            const remainingTables = db.prepare(`
                SELECT name FROM sqlite_master
                WHERE type='table' AND name IN ('course_enrollment', 'course_teacher')
            `).all() as Array<{ name: string }>;

            if (remainingTables.length > 0) {
                console.error(`  - ERROR: Tables still exist: ${remainingTables.map(t => t.name).join(', ')}`);
                throw new Error('Tables were not dropped properly');
            }

            console.log('  - Verified: Tables have been removed');
        } else {
            console.log('  - Would verify tables were dropped');
        }

        console.log('');
        console.log('='.repeat(60));
        if (isDryRun) {
            console.log('DRY RUN COMPLETE - No changes were made.');
            console.log('Run without --dry-run to apply changes.');
        } else {
            console.log('MIGRATION COMPLETED SUCCESSFULLY!');
            console.log('');
            console.log('The following tables have been dropped:');
            existingTables.forEach(t => console.log(`  - ${t}`));
        }
        console.log('='.repeat(60));

    } catch (error) {
        console.error('\nMIGRATION FAILED!');
        console.error(error);

        if (!isDryRun && shouldBackup) {
            console.log('\nA backup was created before the migration.');
            console.log('You can restore it if needed.');
        }

        process.exit(1);
    } finally {
        db.close();
    }
}

main();
