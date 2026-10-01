/**
 * Export/import helper for legacy interactive learning tables:
 * - interactive_learning_chat_file
 * - interactive_learning_chat_rag_document
 *
 * Usage:
 *   npx tsx scripts/legacy-interactive-learning-files-transfer.ts export [options]
 *   npx tsx scripts/legacy-interactive-learning-files-transfer.ts import --file=PATH [options]
 *
 * Common options:
 *   --db=PATH                Database path (default: DATABASE_URL or ./sapin.db)
 *   --dry-run                Show what would happen without writing
 *
 * Export options:
 *   --out=PATH               Output JSON file
 *
 * Import options:
 *   --backup                 Create a backup of the target DB before importing
 *   --on-conflict=MODE       MODE: error | skip | replace (default: error)
 *   --skip-missing-il        Skip rows whose interactive_learning_id does not exist
 *   --no-link-storage        Do not infer file_storage_id from /api/files/<id> paths
 */

import Database from 'better-sqlite3';
import fs from 'node:fs';
import path from 'node:path';

type Command = 'export' | 'import';
type ConflictMode = 'error' | 'skip' | 'replace';

type LegacyChatFileRow = {
	id: string;
	interactive_learning_chat_id: string;
	name: string;
	path: string;
	type: string;
	size: number;
	mime_type: string;
	created_at: number;
};

type LegacyRagDocumentRow = {
	id: string;
	interactive_learning_chat_id: string;
	name: string;
	original_path: string | null;
	file_type: string;
	file_size: number | null;
	chunk_count: number | null;
	total_characters: number | null;
	status: string;
	error_message: string | null;
	qdrant_point_ids: string | null;
	metadata: string | null;
	created_at: number;
	updated_at: number;
};

type ExportedChatFileRow = {
	id: string;
	interactiveLearningChatId: string;
	interactiveLearningId: string | null;
	name: string;
	path: string;
	type: string;
	size: number;
	mimeType: string;
	createdAt: number;
};

type ExportedRagDocumentRow = {
	id: string;
	interactiveLearningChatId: string;
	interactiveLearningId: string | null;
	name: string;
	originalPath: string | null;
	fileType: string;
	fileSize: number | null;
	chunkCount: number | null;
	totalCharacters: number | null;
	status: string;
	errorMessage: string | null;
	qdrantPointIds: string | null;
	metadata: string | null;
	createdAt: number;
	updatedAt: number;
};

type ExportPayload = {
	version: 1;
	exportedAt: string;
	sourceDatabasePath: string;
	legacySchema: {
		chatHasInteractiveLearningIdColumn: boolean;
	};
	summary: {
		chatFiles: number;
		ragDocuments: number;
		unresolvedInteractiveLearningIds: number;
	};
	data: {
		chatFiles: ExportedChatFileRow[];
		ragDocuments: ExportedRagDocumentRow[];
	};
};

const rawArgs = process.argv.slice(2);
const command = rawArgs[0] as Command | undefined;

const DB_PATH = getOption('db') || process.env.DATABASE_URL || './sapin.db';
const DRY_RUN = hasFlag('dry-run');

if (!command || !['export', 'import'].includes(command)) {
	printUsage();
	process.exit(1);
}

if (!fs.existsSync(DB_PATH)) {
	console.error(`Error: database not found at "${DB_PATH}"`);
	process.exit(1);
}

if (command === 'export') {
	runExport();
} else {
	runImport();
}

function runExport() {
	const db = new Database(DB_PATH, { readonly: true });
	try {
		const chatFileTableExists = tableExists(db, 'interactive_learning_chat_file');
		const ragDocTableExists = tableExists(db, 'interactive_learning_chat_rag_document');
		const chatTableExists = tableExists(db, 'interactive_learning_chat');

		if (!chatFileTableExists && !ragDocTableExists) {
			throw new Error(
				'No se encontraron tablas legacy: interactive_learning_chat_file / interactive_learning_chat_rag_document'
			);
		}

		const chatHasInteractiveLearningIdColumn = chatTableExists
			? columnExists(db, 'interactive_learning_chat', 'interactive_learning_id')
			: false;

		const chatToInteractiveMap = new Map<string, string>();
		if (chatTableExists) {
			if (chatHasInteractiveLearningIdColumn) {
				const rows = db
					.prepare(
						`SELECT id, interactive_learning_id
                         FROM interactive_learning_chat`
					)
					.all() as Array<{ id: string; interactive_learning_id: string }>;

				for (const row of rows) {
					chatToInteractiveMap.set(row.id, row.interactive_learning_id);
				}
			} else {
				const rows = db.prepare(`SELECT id FROM interactive_learning_chat`).all() as Array<{ id: string }>;
				for (const row of rows) {
					chatToInteractiveMap.set(row.id, row.id);
				}
			}
		}

		const legacyChatFiles = chatFileTableExists
			? (db
					.prepare(
						`SELECT
                            id,
                            interactive_learning_chat_id,
                            name,
                            path,
                            type,
                            size,
                            mime_type,
                            created_at
                         FROM interactive_learning_chat_file`
					)
					.all() as LegacyChatFileRow[])
			: [];

		const legacyRagDocs = ragDocTableExists
			? (db
					.prepare(
						`SELECT
                            id,
                            interactive_learning_chat_id,
                            name,
                            original_path,
                            file_type,
                            file_size,
                            chunk_count,
                            total_characters,
                            status,
                            error_message,
                            qdrant_point_ids,
                            metadata,
                            created_at,
                            updated_at
                         FROM interactive_learning_chat_rag_document`
					)
					.all() as LegacyRagDocumentRow[])
			: [];

		const exportedChatFiles: ExportedChatFileRow[] = legacyChatFiles.map((row) => ({
			id: row.id,
			interactiveLearningChatId: row.interactive_learning_chat_id,
			interactiveLearningId: chatToInteractiveMap.get(row.interactive_learning_chat_id) ?? null,
			name: row.name,
			path: row.path,
			type: row.type,
			size: row.size,
			mimeType: row.mime_type,
			createdAt: row.created_at
		}));

		const exportedRagDocs: ExportedRagDocumentRow[] = legacyRagDocs.map((row) => ({
			id: row.id,
			interactiveLearningChatId: row.interactive_learning_chat_id,
			interactiveLearningId: chatToInteractiveMap.get(row.interactive_learning_chat_id) ?? null,
			name: row.name,
			originalPath: row.original_path,
			fileType: row.file_type,
			fileSize: row.file_size,
			chunkCount: row.chunk_count,
			totalCharacters: row.total_characters,
			status: row.status,
			errorMessage: row.error_message,
			qdrantPointIds: row.qdrant_point_ids,
			metadata: row.metadata,
			createdAt: row.created_at,
			updatedAt: row.updated_at
		}));

		const unresolved = countUnresolved(exportedChatFiles, exportedRagDocs);

		const payload: ExportPayload = {
			version: 1,
			exportedAt: new Date().toISOString(),
			sourceDatabasePath: path.resolve(DB_PATH),
			legacySchema: {
				chatHasInteractiveLearningIdColumn
			},
			summary: {
				chatFiles: exportedChatFiles.length,
				ragDocuments: exportedRagDocs.length,
				unresolvedInteractiveLearningIds: unresolved
			},
			data: {
				chatFiles: exportedChatFiles,
				ragDocuments: exportedRagDocs
			}
		};

		const outputPath =
			getOption('out') || `./legacy-interactive-learning-files-export-${Date.now()}.json`;
		const resolvedOutputPath = path.resolve(outputPath);

		if (DRY_RUN) {
			console.log('DRY RUN (export)');
			console.log(`- DB: ${path.resolve(DB_PATH)}`);
			console.log(`- Output file: ${resolvedOutputPath}`);
			console.log(`- Chat files: ${payload.summary.chatFiles}`);
			console.log(`- RAG documents: ${payload.summary.ragDocuments}`);
			console.log(`- Unresolved interactive IDs: ${payload.summary.unresolvedInteractiveLearningIds}`);
			return;
		}

		fs.writeFileSync(resolvedOutputPath, JSON.stringify(payload, null, 2), 'utf8');

		console.log('Export completed');
		console.log(`- DB: ${path.resolve(DB_PATH)}`);
		console.log(`- File: ${resolvedOutputPath}`);
		console.log(`- Chat files: ${payload.summary.chatFiles}`);
		console.log(`- RAG documents: ${payload.summary.ragDocuments}`);
		console.log(`- Unresolved interactive IDs: ${payload.summary.unresolvedInteractiveLearningIds}`);
	} finally {
		db.close();
	}
}

function runImport() {
	const filePath = getOption('file');
	if (!filePath) {
		throw new Error('Import requires --file=PATH');
	}

	const onConflict = parseConflictMode(getOption('on-conflict'));
	const skipMissingInteractive = hasFlag('skip-missing-il');
	const shouldBackup = hasFlag('backup');
	const linkStorage = !hasFlag('no-link-storage');

	const resolvedFilePath = path.resolve(filePath);
	if (!fs.existsSync(resolvedFilePath)) {
		throw new Error(`Import file not found: ${resolvedFilePath}`);
	}

	const raw = fs.readFileSync(resolvedFilePath, 'utf8');
	const payload = JSON.parse(raw) as ExportPayload;
	validatePayload(payload);

	if (shouldBackup && !DRY_RUN) {
		const backupPath = `${DB_PATH}.backup-before-legacy-files-import-${Date.now()}`;
		fs.copyFileSync(DB_PATH, backupPath);
		console.log(`Backup created: ${backupPath}`);
	}

	const db = new Database(DB_PATH);
	try {
		assertTableExists(db, 'interactive_learning_file');
		assertTableExists(db, 'interactive_learning_rag_document');
		assertTableExists(db, 'interactive_learning');

		const hasFileStorageTable = tableExists(db, 'file_storage');
		const interactiveExistsStmt = db.prepare(
			'SELECT 1 FROM interactive_learning WHERE id = ? LIMIT 1'
		);
		const storageExistsStmt = hasFileStorageTable
			? db.prepare('SELECT 1 FROM file_storage WHERE id = ? LIMIT 1')
			: null;

		let insertedChatFiles = 0;
		let insertedRagDocs = 0;
		let skippedConflicts = 0;
		let skippedMissingIl = 0;
		let linkedStorageIds = 0;
		let unresolvedStorageIds = 0;

		const importTx = db.transaction(() => {
			for (const row of payload.data.chatFiles) {
				const interactiveLearningId = row.interactiveLearningId;

				if (!interactiveLearningId || !interactiveExistsStmt.get(interactiveLearningId)) {
					if (skipMissingInteractive) {
						skippedMissingIl += 1;
						continue;
					}
					throw new Error(
						`Interactive learning not found for chat file "${row.id}" (interactiveLearningId=${interactiveLearningId ?? 'null'})`
					);
				}

				let fileStorageId: string | null = null;
				if (linkStorage && storageExistsStmt) {
					const parsed = extractFileIdFromApiPath(row.path);
					if (parsed && storageExistsStmt.get(parsed)) {
						fileStorageId = parsed;
						linkedStorageIds += 1;
					} else if (parsed) {
						unresolvedStorageIds += 1;
					}
				}

				const changes = insertInteractiveLearningFile(db, {
					mode: onConflict,
					row: {
						id: row.id,
						interactiveLearningId,
						fileStorageId,
						name: row.name,
						path: row.path,
						type: row.type,
						size: row.size,
						mimeType: row.mimeType,
						createdAt: row.createdAt
					}
				});

				if (changes > 0) insertedChatFiles += 1;
				else skippedConflicts += 1;
			}

			for (const row of payload.data.ragDocuments) {
				const interactiveLearningId = row.interactiveLearningId;

				if (!interactiveLearningId || !interactiveExistsStmt.get(interactiveLearningId)) {
					if (skipMissingInteractive) {
						skippedMissingIl += 1;
						continue;
					}
					throw new Error(
						`Interactive learning not found for rag document "${row.id}" (interactiveLearningId=${interactiveLearningId ?? 'null'})`
					);
				}

				let fileStorageId: string | null = null;
				if (linkStorage && storageExistsStmt) {
					const parsed = extractFileIdFromApiPath(row.originalPath);
					if (parsed && storageExistsStmt.get(parsed)) {
						fileStorageId = parsed;
						linkedStorageIds += 1;
					} else if (parsed) {
						unresolvedStorageIds += 1;
					}
				}

				const changes = insertInteractiveLearningRagDocument(db, {
					mode: onConflict,
					row: {
						id: row.id,
						interactiveLearningId,
						fileStorageId,
						name: row.name,
						originalPath: row.originalPath,
						fileType: row.fileType,
						fileSize: row.fileSize,
						chunkCount: row.chunkCount,
						totalCharacters: row.totalCharacters,
						status: row.status,
						errorMessage: row.errorMessage,
						qdrantPointIds: row.qdrantPointIds,
						metadata: row.metadata,
						createdAt: row.createdAt,
						updatedAt: row.updatedAt
					}
				});

				if (changes > 0) insertedRagDocs += 1;
				else skippedConflicts += 1;
			}
		});

		if (!DRY_RUN) {
			importTx();
		}

		console.log(DRY_RUN ? 'DRY RUN (import)' : 'Import completed');
		console.log(`- DB: ${path.resolve(DB_PATH)}`);
		console.log(`- Input file: ${resolvedFilePath}`);
		console.log(`- Conflict mode: ${onConflict}`);
		console.log(`- Skip missing interactive learning: ${skipMissingInteractive}`);
		console.log(`- Link file_storage_id from path: ${linkStorage}`);
		console.log(`- Imported chat files: ${insertedChatFiles}`);
		console.log(`- Imported rag documents: ${insertedRagDocs}`);
		console.log(`- Skipped conflicts: ${skippedConflicts}`);
		console.log(`- Skipped missing interactive_learning: ${skippedMissingIl}`);
		if (linkStorage) {
			console.log(`- Linked file_storage_id: ${linkedStorageIds}`);
			console.log(`- Unresolved file_storage_id from path: ${unresolvedStorageIds}`);
		}
	} finally {
		db.close();
	}
}

function insertInteractiveLearningFile(
	db: Database.Database,
	input: {
		mode: ConflictMode;
		row: {
			id: string;
			interactiveLearningId: string;
			fileStorageId: string | null;
			name: string;
			path: string;
			type: string;
			size: number;
			mimeType: string;
			createdAt: number;
		};
	}
): number {
	const { mode, row } = input;
	const baseSql = `(
        id,
        interactive_learning_id,
        file_storage_id,
        name,
        path,
        type,
        size,
        mime_type,
        created_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`;

	const sql =
		mode === 'skip'
			? `INSERT OR IGNORE INTO interactive_learning_file ${baseSql}`
			: mode === 'replace'
				? `INSERT OR REPLACE INTO interactive_learning_file ${baseSql}`
				: `INSERT INTO interactive_learning_file ${baseSql}`;

	const result = db
		.prepare(sql)
		.run(
			row.id,
			row.interactiveLearningId,
			row.fileStorageId,
			row.name,
			row.path,
			row.type,
			row.size,
			row.mimeType,
			row.createdAt
		);

	return Number(result.changes || 0);
}

function insertInteractiveLearningRagDocument(
	db: Database.Database,
	input: {
		mode: ConflictMode;
		row: {
			id: string;
			interactiveLearningId: string;
			fileStorageId: string | null;
			name: string;
			originalPath: string | null;
			fileType: string;
			fileSize: number | null;
			chunkCount: number | null;
			totalCharacters: number | null;
			status: string;
			errorMessage: string | null;
			qdrantPointIds: string | null;
			metadata: string | null;
			createdAt: number;
			updatedAt: number;
		};
	}
): number {
	const { mode, row } = input;
	const baseSql = `(
        id,
        interactive_learning_id,
        file_storage_id,
        name,
        original_path,
        file_type,
        file_size,
        chunk_count,
        total_characters,
        status,
        error_message,
        qdrant_point_ids,
        metadata,
        created_at,
        updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`;

	const sql =
		mode === 'skip'
			? `INSERT OR IGNORE INTO interactive_learning_rag_document ${baseSql}`
			: mode === 'replace'
				? `INSERT OR REPLACE INTO interactive_learning_rag_document ${baseSql}`
				: `INSERT INTO interactive_learning_rag_document ${baseSql}`;

	const result = db
		.prepare(sql)
		.run(
			row.id,
			row.interactiveLearningId,
			row.fileStorageId,
			row.name,
			row.originalPath,
			row.fileType,
			row.fileSize,
			row.chunkCount,
			row.totalCharacters,
			row.status,
			row.errorMessage,
			row.qdrantPointIds,
			row.metadata,
			row.createdAt,
			row.updatedAt
		);

	return Number(result.changes || 0);
}

function countUnresolved(
	chatFiles: ExportedChatFileRow[],
	ragDocs: ExportedRagDocumentRow[]
): number {
	let unresolved = 0;
	for (const row of chatFiles) {
		if (!row.interactiveLearningId) unresolved += 1;
	}
	for (const row of ragDocs) {
		if (!row.interactiveLearningId) unresolved += 1;
	}
	return unresolved;
}

function extractFileIdFromApiPath(filePath: string | null | undefined): string | null {
	if (!filePath) return null;
	const match = filePath.match(/\/api\/files\/([^/?#]+)/i);
	return match?.[1] || null;
}

function tableExists(db: Database.Database, tableName: string): boolean {
	const row = db
		.prepare(
			`SELECT name
             FROM sqlite_master
             WHERE type = 'table' AND name = ?`
		)
		.get(tableName) as { name?: string } | undefined;

	return !!row?.name;
}

function assertTableExists(db: Database.Database, tableName: string): void {
	if (!tableExists(db, tableName)) {
		throw new Error(`Required table not found: ${tableName}`);
	}
}

function columnExists(db: Database.Database, tableName: string, columnName: string): boolean {
	const rows = db.prepare(`PRAGMA table_info(${tableName})`).all() as Array<{ name: string }>;
	return rows.some((row) => row.name === columnName);
}

function parseConflictMode(raw: string | undefined): ConflictMode {
	if (!raw) return 'error';
	if (raw === 'error' || raw === 'skip' || raw === 'replace') return raw;
	throw new Error(`Invalid --on-conflict value "${raw}". Use: error | skip | replace`);
}

function validatePayload(payload: ExportPayload): void {
	if (!payload || typeof payload !== 'object') {
		throw new Error('Invalid import file: expected object payload');
	}
	if (payload.version !== 1) {
		throw new Error(`Unsupported payload version: ${String((payload as { version?: unknown }).version)}`);
	}
	if (!payload.data || !Array.isArray(payload.data.chatFiles) || !Array.isArray(payload.data.ragDocuments)) {
		throw new Error('Invalid import file: missing data.chatFiles / data.ragDocuments arrays');
	}
}

function hasFlag(name: string): boolean {
	return rawArgs.includes(`--${name}`);
}

function getOption(name: string): string | undefined {
	const prefix = `--${name}=`;
	const arg = rawArgs.find((entry) => entry.startsWith(prefix));
	return arg ? arg.slice(prefix.length) : undefined;
}

function printUsage() {
	console.log(`
Legacy Interactive Learning Files Transfer

Commands:
  export
  import --file=PATH

Options:
  --db=PATH                Database path (default: DATABASE_URL or ./sapin.db)
  --dry-run

Export:
  --out=PATH

Import:
  --backup
  --on-conflict=error|skip|replace
  --skip-missing-il
  --no-link-storage
`);
}
