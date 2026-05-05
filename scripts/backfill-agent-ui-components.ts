import 'dotenv/config';
import Database from 'better-sqlite3';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import { eq, and } from 'drizzle-orm';
import { nanoid } from 'nanoid';
import * as schema from '../src/lib/server/db/schema';

const DATABASE_URL = process.env.DATABASE_URL;
const isDryRun = process.argv.includes('--dry-run');

if (!DATABASE_URL) {
	console.error('DATABASE_URL is not configured');
	process.exit(1);
}

interface ToolExecutorConfig {
	handler?: string;
	componentKey?: string;
}

function parseExecutorConfig(raw: string): ToolExecutorConfig {
	try {
		return JSON.parse(raw) as ToolExecutorConfig;
	} catch {
		return {};
	}
}

function toKey(activityId: string, uiComponentId: string): string {
	return `${activityId}:${uiComponentId}`;
}

async function main() {
	const client = new Database(DATABASE_URL);
	const db = drizzle(client, { schema });

	try {
		const activityTools = await db
			.select({
				activityId: schema.agentActivityTool.agentActivityId,
				toolName: schema.agentToolDefinition.name,
				executorConfig: schema.agentToolDefinition.executorConfig
			})
			.from(schema.agentActivityTool)
			.innerJoin(
				schema.agentToolDefinition,
				eq(schema.agentActivityTool.toolDefinitionId, schema.agentToolDefinition.id)
			)
			.where(
				and(
					eq(schema.agentActivityTool.isEnabled, true),
					eq(schema.agentToolDefinition.isActive, true)
				)
			);

		const uiComponents = await db
			.select({
				id: schema.agentUIComponent.id,
				componentKey: schema.agentUIComponent.componentKey
			})
			.from(schema.agentUIComponent)
			.where(eq(schema.agentUIComponent.isActive, true));

		const existingAssignments = await db
			.select({
				activityId: schema.agentActivityUIComponent.agentActivityId,
				uiComponentId: schema.agentActivityUIComponent.uiComponentId
			})
			.from(schema.agentActivityUIComponent)
			.where(eq(schema.agentActivityUIComponent.isEnabled, true));

		const componentKeyToId = new Map<string, string>();
		for (const component of uiComponents) {
			componentKeyToId.set(component.componentKey, component.id);
		}

		const desiredAssignments = new Map<string, Set<string>>();

		for (const row of activityTools) {
			const config = parseExecutorConfig(row.executorConfig);
			if (config.handler !== 'ui_renderer') continue;
			if (!config.componentKey) continue;

			const uiComponentId = componentKeyToId.get(config.componentKey);
			if (!uiComponentId) {
				console.warn(
					`Skipping ${row.activityId}/${row.toolName}: UI component key not found (${config.componentKey})`
				);
				continue;
			}

			const set = desiredAssignments.get(row.activityId) ?? new Set<string>();
			set.add(uiComponentId);
			desiredAssignments.set(row.activityId, set);
		}

		const existingSet = new Set<string>();
		for (const row of existingAssignments) {
			existingSet.add(toKey(row.activityId, row.uiComponentId));
		}

		const rowsToInsert: Array<typeof schema.agentActivityUIComponent.$inferInsert> = [];

		for (const [activityId, uiComponentIds] of desiredAssignments.entries()) {
			for (const uiComponentId of uiComponentIds) {
				const key = toKey(activityId, uiComponentId);
				if (existingSet.has(key)) continue;

				rowsToInsert.push({
					id: nanoid(),
					agentActivityId: activityId,
					uiComponentId,
					isEnabled: true,
					createdAt: new Date()
				});
			}
		}

		console.log(`Detected ${rowsToInsert.length} missing activity UI component assignments.`);

		if (rowsToInsert.length === 0) {
			console.log('No changes required.');
			return;
		}

		if (isDryRun) {
			console.log('Dry run mode enabled. No changes were written.');
			return;
		}

		await db.insert(schema.agentActivityUIComponent).values(rowsToInsert);
		console.log(`Inserted ${rowsToInsert.length} activity UI component assignments.`);
	} finally {
		client.close();
	}
}

main().catch((error) => {
	console.error('Backfill failed:', error);
	process.exit(1);
});
