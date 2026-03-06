import { and, asc, eq, isNull, or } from 'drizzle-orm';
import { db } from '..';
import * as schema from '../schema';
import { nanoid } from 'nanoid';
import { getBuiltinToolManifestsByDomain, getAllBuiltinToolManifests } from '$lib/server/agent/tools/registry';
import {
	BUILTIN_TOOL_USAGE_DOMAIN_AGENT_CHAT,
	BUILTIN_TOOL_USAGE_DOMAIN_INSIGHTS
} from '$lib/server/agent/tools/constants';
import type { ToolManifest } from '$lib/server/agent/tools/types';

export default class DBAgentToolUtils {
	// ─── Catálogo Global de Herramientas (Admin) ───
	static async getAllToolDefinitions(usageDomain?: string) {
		let query = db
			.select()
			.from(schema.agentToolDefinition)
			.orderBy(asc(schema.agentToolDefinition.category), asc(schema.agentToolDefinition.name));

		if (usageDomain !== undefined) {
			const usageClause = or(
				eq(schema.agentToolDefinition.usageDomain, usageDomain),
				isNull(schema.agentToolDefinition.usageDomain)
			);
			query = query.where(usageClause);
		}

		return await query;
	}

	static async getActiveToolDefinitions(usageDomain?: string) {
		let query = db
			.select()
			.from(schema.agentToolDefinition)
			.where(eq(schema.agentToolDefinition.isActive, true))
			.orderBy(asc(schema.agentToolDefinition.category), asc(schema.agentToolDefinition.name));

		if (usageDomain !== undefined) {
			const usageClause = or(
				eq(schema.agentToolDefinition.usageDomain, usageDomain),
				isNull(schema.agentToolDefinition.usageDomain)
			);
			query = query.where(usageClause);
		}

		return await query;
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

	// ─── Seed de herramientas builtin ───

	static async seedBuiltinTools(usageDomain: string = BUILTIN_TOOL_USAGE_DOMAIN_AGENT_CHAT) {
		const toolManifests =
			usageDomain === BUILTIN_TOOL_USAGE_DOMAIN_AGENT_CHAT || usageDomain === BUILTIN_TOOL_USAGE_DOMAIN_INSIGHTS
				? getBuiltinToolManifestsByDomain(usageDomain)
				: getAllBuiltinToolManifests();

		for (const manifest of toolManifests) {
			const existing = await this.getToolDefinitionByName(manifest.name);
			const payload = this.manifestToDbPayload(manifest);

			if (!existing) {
				await this.createToolDefinition(payload);
				continue;
			}

			if (existing.isSystem) {
				await this.updateToolDefinition(existing.id, payload);
			}
		}
	}
}
