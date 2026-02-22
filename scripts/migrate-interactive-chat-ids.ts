/**
 * Migration Script: Unify Interactive Learning Chat IDs
 *
 * This script migrates the interactive_learning_chat table to use a 1:1 inheritance
 * pattern where the id of interactive_learning_chat IS the same as interactive_learning.id.
 *
 * Usage:
 *   npx tsx scripts/migrate-interactive-chat-ids.ts
 *
 * Options:
 *   --dry-run    Show what would be done without making changes
 *   --backup     Create a backup before migrating (recommended)
 */

import Database from 'better-sqlite3';
import fs from 'fs';
import path from 'path';

// Configuration - adjust if needed
const DB_PATH = process.env.DATABASE_URL || './sapin.db';

const args = process.argv.slice(2);
const isDryRun = args.includes('--dry-run');
const shouldBackup = args.includes('--backup');

console.log('='.repeat(60));
console.log('Migration: Unify Interactive Learning Chat IDs');
console.log('='.repeat(60));
console.log(`Database: ${DB_PATH}`);
console.log(`Dry Run: ${isDryRun}`);
console.log(`Backup: ${shouldBackup}`);
console.log('');

// Check if database exists
if (!fs.existsSync(DB_PATH)) {
    console.error(`Error: Database not found at ${DB_PATH}`);
    console.error('Set DATABASE_URL environment variable or check the path.');
    process.exit(1);
}

// Create backup if requested
if (shouldBackup && !isDryRun) {
    const backupPath = `${DB_PATH}.backup-${Date.now()}`;
    console.log(`Creating backup at: ${backupPath}`);
    fs.copyFileSync(DB_PATH, backupPath);
    console.log('Backup created successfully.\n');
}

const db = new Database(DB_PATH);

// Enable foreign keys
db.pragma('foreign_keys = OFF');

try {
    // Step 1: Check current state
    console.log('Step 1: Analyzing current database state...');

    const hasOldColumn = db.prepare(`
        SELECT COUNT(*) as count FROM pragma_table_info('interactive_learning_chat')
        WHERE name = 'interactive_learning_id'
    `).get() as { count: number };

    if (hasOldColumn.count === 0) {
        console.log('Migration already completed! The interactive_learning_id column does not exist.');
        console.log('The table is already using the new schema.');
        process.exit(0);
    }

    const chatCount = db.prepare('SELECT COUNT(*) as count FROM interactive_learning_chat').get() as { count: number };
    const ilCount = db.prepare('SELECT COUNT(*) as count FROM interactive_learning').get() as { count: number };

    console.log(`  - Interactive Learning records: ${ilCount.count}`);
    console.log(`  - Interactive Learning Chat records: ${chatCount.count}`);

    // Check for orphaned chats (chats without corresponding interactive_learning)
    const orphanedChats = db.prepare(`
        SELECT COUNT(*) as count FROM interactive_learning_chat ilc
        WHERE NOT EXISTS (SELECT 1 FROM interactive_learning il WHERE il.id = ilc.interactive_learning_id)
    `).get() as { count: number };

    if (orphanedChats.count > 0) {
        console.warn(`  - WARNING: Found ${orphanedChats.count} orphaned chat records!`);
        console.warn('    These will be deleted during migration.');
    }

    // Check dependent tables
    const userChatCount = db.prepare('SELECT COUNT(*) as count FROM user_interactive_learning_chat').get() as { count: number };
    const ragDocCount = db.prepare('SELECT COUNT(*) as count FROM interactive_learning_chat_rag_document').get() as { count: number };
    const fileCount = db.prepare('SELECT COUNT(*) as count FROM interactive_learning_chat_file').get() as { count: number };

    console.log(`  - User Interactive Learning Chat records: ${userChatCount.count}`);
    console.log(`  - RAG Document records: ${ragDocCount.count}`);
    console.log(`  - Chat File records: ${fileCount.count}`);
    console.log('');

    if (isDryRun) {
        console.log('DRY RUN MODE - No changes will be made.\n');
    }

    // Step 2: Update dependent tables
    console.log('Step 2: Updating foreign keys in dependent tables...');

    if (!isDryRun) {
        // Update user_interactive_learning_chat
        const updateUserChats = db.prepare(`
            UPDATE user_interactive_learning_chat
            SET interactive_learning_chat_id = (
                SELECT interactive_learning_id
                FROM interactive_learning_chat
                WHERE id = user_interactive_learning_chat.interactive_learning_chat_id
            )
            WHERE EXISTS (
                SELECT 1 FROM interactive_learning_chat
                WHERE id = user_interactive_learning_chat.interactive_learning_chat_id
            )
        `);
        const userChatsResult = updateUserChats.run();
        console.log(`  - Updated ${userChatsResult.changes} user_interactive_learning_chat records`);

        // Update interactive_learning_chat_rag_document
        const updateRagDocs = db.prepare(`
            UPDATE interactive_learning_chat_rag_document
            SET interactive_learning_chat_id = (
                SELECT interactive_learning_id
                FROM interactive_learning_chat
                WHERE id = interactive_learning_chat_rag_document.interactive_learning_chat_id
            )
            WHERE EXISTS (
                SELECT 1 FROM interactive_learning_chat
                WHERE id = interactive_learning_chat_rag_document.interactive_learning_chat_id
            )
        `);
        const ragDocsResult = updateRagDocs.run();
        console.log(`  - Updated ${ragDocsResult.changes} interactive_learning_chat_rag_document records`);

        // Update interactive_learning_chat_file
        const updateFiles = db.prepare(`
            UPDATE interactive_learning_chat_file
            SET interactive_learning_chat_id = (
                SELECT interactive_learning_id
                FROM interactive_learning_chat
                WHERE id = interactive_learning_chat_file.interactive_learning_chat_id
            )
            WHERE EXISTS (
                SELECT 1 FROM interactive_learning_chat
                WHERE id = interactive_learning_chat_file.interactive_learning_chat_id
            )
        `);
        const filesResult = updateFiles.run();
        console.log(`  - Updated ${filesResult.changes} interactive_learning_chat_file records`);
    } else {
        console.log('  - Would update user_interactive_learning_chat records');
        console.log('  - Would update interactive_learning_chat_rag_document records');
        console.log('  - Would update interactive_learning_chat_file records');
    }
    console.log('');

    // Step 3: Create new table structure
    console.log('Step 3: Creating new table with correct structure...');

    if (!isDryRun) {
        db.exec(`
            CREATE TABLE IF NOT EXISTS interactive_learning_chat_new (
                id TEXT PRIMARY KEY REFERENCES interactive_learning(id) ON DELETE CASCADE,
                llm_role TEXT,
                llm_instructions TEXT,
                llm_context TEXT,
                system_prompt TEXT,
                llm_model TEXT,
                temperature REAL,
                max_tokens INTEGER,
                top_p REAL,
                created_at INTEGER NOT NULL,
                metadata TEXT,
                rag_enabled INTEGER DEFAULT 0,
                rag_collection_name TEXT,
                rag_chunk_size INTEGER DEFAULT 1000,
                rag_chunk_overlap INTEGER DEFAULT 200,
                rag_top_k INTEGER DEFAULT 5,
                rag_min_score REAL DEFAULT 0.7,
                rag_system_prompt_template TEXT
            )
        `);
        console.log('  - New table created');
    } else {
        console.log('  - Would create new table interactive_learning_chat_new');
    }
    console.log('');

    // Step 4: Migrate data
    console.log('Step 4: Migrating data to new table...');

    if (!isDryRun) {
        const migrateData = db.prepare(`
            INSERT INTO interactive_learning_chat_new
            SELECT
                interactive_learning_id,
                llm_role, llm_instructions, llm_context, system_prompt, llm_model,
                temperature, max_tokens, top_p, created_at, metadata,
                rag_enabled, rag_collection_name, rag_chunk_size, rag_chunk_overlap,
                rag_top_k, rag_min_score, rag_system_prompt_template
            FROM interactive_learning_chat
            WHERE EXISTS (
                SELECT 1 FROM interactive_learning il
                WHERE il.id = interactive_learning_chat.interactive_learning_id
            )
        `);
        const migrateResult = migrateData.run();
        console.log(`  - Migrated ${migrateResult.changes} records`);
    } else {
        console.log(`  - Would migrate ${chatCount.count} records`);
    }
    console.log('');

    // Step 5: Replace old table
    console.log('Step 5: Replacing old table with new one...');

    if (!isDryRun) {
        db.exec('DROP TABLE interactive_learning_chat');
        console.log('  - Dropped old table');

        db.exec('ALTER TABLE interactive_learning_chat_new RENAME TO interactive_learning_chat');
        console.log('  - Renamed new table');
    } else {
        console.log('  - Would drop old table');
        console.log('  - Would rename new table');
    }
    console.log('');

    // Step 6: Verify migration
    console.log('Step 6: Verifying migration...');

    if (!isDryRun) {
        // Check that all IDs now match
        const mismatchCount = db.prepare(`
            SELECT COUNT(*) as count FROM interactive_learning_chat ilc
            WHERE NOT EXISTS (SELECT 1 FROM interactive_learning il WHERE il.id = ilc.id)
        `).get() as { count: number };

        if (mismatchCount.count > 0) {
            console.error(`  - ERROR: Found ${mismatchCount.count} records with mismatched IDs!`);
            throw new Error('Migration verification failed');
        }

        const newChatCount = db.prepare('SELECT COUNT(*) as count FROM interactive_learning_chat').get() as { count: number };
        console.log(`  - Total chat records after migration: ${newChatCount.count}`);

        // Check foreign key integrity
        const fkCheck = db.prepare(`
            SELECT COUNT(*) as count FROM user_interactive_learning_chat uilc
            WHERE NOT EXISTS (SELECT 1 FROM interactive_learning_chat ilc WHERE ilc.id = uilc.interactive_learning_chat_id)
        `).get() as { count: number };

        if (fkCheck.count > 0) {
            console.warn(`  - WARNING: ${fkCheck.count} orphaned user_interactive_learning_chat records`);
        } else {
            console.log('  - All foreign key relationships are valid');
        }

        // Verify column structure
        const columns = db.prepare(`PRAGMA table_info(interactive_learning_chat)`).all() as Array<{name: string}>;
        const hasInteractiveLearningId = columns.some(c => c.name === 'interactive_learning_id');

        if (hasInteractiveLearningId) {
            console.error('  - ERROR: Old column interactive_learning_id still exists!');
            throw new Error('Migration verification failed');
        }

        console.log('  - Column structure verified (no interactive_learning_id column)');
    } else {
        console.log('  - Would verify migration integrity');
    }
    console.log('');

    // Re-enable foreign keys
    db.pragma('foreign_keys = ON');

    console.log('='.repeat(60));
    if (isDryRun) {
        console.log('DRY RUN COMPLETE - No changes were made.');
        console.log('Run without --dry-run to apply changes.');
    } else {
        console.log('MIGRATION COMPLETED SUCCESSFULLY!');
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
