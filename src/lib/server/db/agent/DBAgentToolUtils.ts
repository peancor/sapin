import { and, asc, eq, inArray, isNull, or } from 'drizzle-orm';
import { db } from '..';
import * as schema from '../schema';
import { nanoid } from 'nanoid';
import { getBuiltinToolManifestsByDomain, getAllBuiltinToolManifests } from '$lib/server/agent/tools/registry';
import {
	BUILTIN_TOOL_USAGE_DOMAIN_AGENT_CHAT,
	BUILTIN_TOOL_USAGE_DOMAIN_INSIGHTS,
	BUILTIN_TOOL_USAGE_DOMAIN_INTERNAL,
	type BuiltinToolUsageDomain
} from '$lib/server/agent/tools/constants';
import type { ToolManifest } from '$lib/server/agent/tools/types';

export default class DBAgentToolUtils {
	static readonly ALL_BUILTIN_USAGE_DOMAINS = 'all';

	// ─── Catálogo Global de Herramientas (Admin) ───
	static async getAllToolDefinitions(usageDomain?: BuiltinToolUsageDomain) {
		if (usageDomain !== undefined) {
			const usageClause = or(
				eq(schema.agentToolDefinition.usageDomain, usageDomain),
				isNull(schema.agentToolDefinition.usageDomain)
			);

			return await db
				.select()
				.from(schema.agentToolDefinition)
				.where(usageClause)
				.orderBy(asc(schema.agentToolDefinition.category), asc(schema.agentToolDefinition.name));
		}

		return await db
			.select()
			.from(schema.agentToolDefinition)
			.orderBy(asc(schema.agentToolDefinition.category), asc(schema.agentToolDefinition.name));
	}

	static async getActiveToolDefinitions(usageDomain?: BuiltinToolUsageDomain) {
		if (usageDomain !== undefined) {
			const usageClause = or(
				eq(schema.agentToolDefinition.usageDomain, usageDomain),
				isNull(schema.agentToolDefinition.usageDomain)
			);

			return await db
				.select()
				.from(schema.agentToolDefinition)
				.where(and(eq(schema.agentToolDefinition.isActive, true), usageClause))
				.orderBy(asc(schema.agentToolDefinition.category), asc(schema.agentToolDefinition.name));
		}

		return await db
			.select()
			.from(schema.agentToolDefinition)
			.where(eq(schema.agentToolDefinition.isActive, true))
			.orderBy(asc(schema.agentToolDefinition.category), asc(schema.agentToolDefinition.name));
	}

	static async getToolDefinitionById(id: string) {
		const [record] = await db
			.select()
			.from(schema.agentToolDefinition)
			.where(eq(schema.agentToolDefinition.id, id));
		return record ?? null;
	}

	static async getToolDefinitionByName(name: string) {
		const [record] = await db
			.select()
			.from(schema.agentToolDefinition)
			.where(eq(schema.agentToolDefinition.name, name));
		return record ?? null;
	}

	static async createToolDefinition(
		data: Omit<typeof schema.agentToolDefinition.$inferInsert, 'id' | 'createdAt' | 'updatedAt'>
	) {
		const id = nanoid();
		await db.insert(schema.agentToolDefinition).values({
			id,
			...data,
			createdAt: new Date(),
			updatedAt: new Date()
		});
		return id;
	}

	static async updateToolDefinition(
		id: string,
		data: Partial<typeof schema.agentToolDefinition.$inferInsert>
	) {
		await db
			.update(schema.agentToolDefinition)
			.set({ ...data, updatedAt: new Date() })
			.where(eq(schema.agentToolDefinition.id, id));
	}

	static async deleteToolDefinition(id: string) {
		await db
			.delete(schema.agentToolDefinition)
			.where(and(eq(schema.agentToolDefinition.id, id), eq(schema.agentToolDefinition.isSystem, false)));
	}

	private static manifestToDbPayload(manifest: ToolManifest) {
		return {
			name: manifest.name,
			displayName: manifest.displayName,
			description: manifest.description,
			category: manifest.category,
			parametersSchema: JSON.stringify(manifest.parametersSchema),
			responseSchema: manifest.responseSchema ? JSON.stringify(manifest.responseSchema) : null,
			executorType: manifest.executorType,
			executorConfig: JSON.stringify(manifest.executorConfig),
			requiresConfirmation: manifest.requiresConfirmation,
			riskLevel: manifest.riskLevel,
			usageDomain: manifest.usageDomain,
			isActive: true,
			isSystem: manifest.isSystem ?? true,
			version: manifest.version ?? '1.0.0'
		};
	}

	private static matchesManifestPayload(
		record: typeof schema.agentToolDefinition.$inferSelect,
		payload: ReturnType<typeof DBAgentToolUtils.manifestToDbPayload>
	) {
		return (
			record.name === payload.name &&
			record.displayName === payload.displayName &&
			record.description === payload.description &&
			record.category === payload.category &&
			record.parametersSchema === payload.parametersSchema &&
			record.responseSchema === payload.responseSchema &&
			record.executorType === payload.executorType &&
			record.executorConfig === payload.executorConfig &&
			record.requiresConfirmation === payload.requiresConfirmation &&
			record.riskLevel === payload.riskLevel &&
			record.usageDomain === payload.usageDomain &&
			record.isActive === payload.isActive &&
			record.isSystem === payload.isSystem &&
			record.version === payload.version
		);
	}

	static async syncBuiltinTools(options?: {
		usageDomain?: BuiltinToolUsageDomain | typeof DBAgentToolUtils.ALL_BUILTIN_USAGE_DOMAINS;
		dryRun?: boolean;
	}) {
		const usageDomain = options?.usageDomain;
		const dryRun = options?.dryRun ?? false;
		const toolManifests =
			usageDomain === undefined || usageDomain === this.ALL_BUILTIN_USAGE_DOMAINS
				? getAllBuiltinToolManifests()
				: getBuiltinToolManifestsByDomain(usageDomain);

		const summary = {
			totalBuiltin: toolManifests.length,
			created: 0,
			updated: 0,
			skipped: 0,
			removed: 0,
			conflicts: 0,
			domains: Object.fromEntries(
				toolManifests.reduce(
					(acc, manifest) => acc.set(manifest.usageDomain, (acc.get(manifest.usageDomain) ?? 0) + 1),
					new Map<string, number>()
				)
			),
			tools: [] as Array<{
				name: string;
				usageDomain: string;
				action: 'create' | 'update' | 'skip' | 'conflict' | 'remove';
			}>
		};

		const manifestNames = new Set(toolManifests.map((manifest) => manifest.name));
		const existingSystemTools =
			usageDomain === undefined || usageDomain === this.ALL_BUILTIN_USAGE_DOMAINS
				? await db
						.select()
						.from(schema.agentToolDefinition)
						.where(eq(schema.agentToolDefinition.isSystem, true))
				: await db
						.select()
						.from(schema.agentToolDefinition)
						.where(
							and(
								eq(schema.agentToolDefinition.isSystem, true),
								eq(schema.agentToolDefinition.usageDomain, usageDomain)
							)
						);

		const removedTools = existingSystemTools.filter((tool) => !manifestNames.has(tool.name));
		if (removedTools.length > 0) {
			const removedIds = removedTools.map((tool) => tool.id);

			for (const removedTool of removedTools) {
				summary.removed++;
				summary.tools.push({
					name: removedTool.name,
					usageDomain: removedTool.usageDomain,
					action: 'remove'
				});
			}

			if (!dryRun) {
				await db
					.delete(schema.agentActivityTool)
					.where(inArray(schema.agentActivityTool.toolDefinitionId, removedIds));

				await db
					.update(schema.agentToolCall)
					.set({ toolDefinitionId: null })
					.where(inArray(schema.agentToolCall.toolDefinitionId, removedIds));

				await db
					.delete(schema.agentToolDefinition)
					.where(inArray(schema.agentToolDefinition.id, removedIds));
			}
		}

		for (const manifest of toolManifests) {
			const existing = await this.getToolDefinitionByName(manifest.name);
			const payload = this.manifestToDbPayload(manifest);

			if (!existing) {
				if (!dryRun) {
					await this.createToolDefinition(payload);
				}
				summary.created++;
				summary.tools.push({
					name: manifest.name,
					usageDomain: manifest.usageDomain,
					action: 'create'
				});
				continue;
			}

			if (!existing.isSystem) {
				summary.conflicts++;
				summary.tools.push({
					name: manifest.name,
					usageDomain: manifest.usageDomain,
					action: 'conflict'
				});
				continue;
			}

			if (this.matchesManifestPayload(existing, payload)) {
				summary.skipped++;
				summary.tools.push({
					name: manifest.name,
					usageDomain: manifest.usageDomain,
					action: 'skip'
				});
				continue;
			}

			if (!dryRun) {
				await this.updateToolDefinition(existing.id, payload);
			}
			summary.updated++;
			summary.tools.push({
				name: manifest.name,
				usageDomain: manifest.usageDomain,
				action: 'update'
			});
		}

		return summary;
	}

	// ─── Seed de herramientas builtin ───

	static async seedBuiltinTools(
		usageDomain: BuiltinToolUsageDomain | string = DBAgentToolUtils.ALL_BUILTIN_USAGE_DOMAINS
	) {
		if (
			usageDomain === BUILTIN_TOOL_USAGE_DOMAIN_AGENT_CHAT ||
			usageDomain === BUILTIN_TOOL_USAGE_DOMAIN_INSIGHTS ||
			usageDomain === BUILTIN_TOOL_USAGE_DOMAIN_INTERNAL
		) {
			return await this.syncBuiltinTools({ usageDomain, dryRun: false });
		}

		return await this.syncBuiltinTools({
			usageDomain: this.ALL_BUILTIN_USAGE_DOMAINS,
			dryRun: false
		});
	}
}
