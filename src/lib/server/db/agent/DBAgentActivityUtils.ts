import { db } from '..';
import { eq, and, desc } from 'drizzle-orm';
import * as schema from '../schema';
import { nanoid } from 'nanoid';
import type { ToolDefinitionResolved } from '$lib/types/agent';

interface SharedImageResource {
	resourceId: string;
	fileId: string;
	name: string;
	mimeType: string;
}

type SharedImageResourceResolution =
	| { ok: true; resource: SharedImageResource }
	| { ok: false; error: string };

type SharedImageCandidate = typeof schema.interactiveLearningFile.$inferSelect;

export default class DBAgentActivityUtils {
	// ─── Actividad Agéntica ───

	static async getAgentActivity(
		activityId: string
	): Promise<typeof schema.interactiveLearningAgent.$inferSelect | null> {
		const [record] = await db
			.select()
			.from(schema.interactiveLearningAgent)
			.where(eq(schema.interactiveLearningAgent.id, activityId));
		return record ?? null;
	}

	static async createAgentActivity(data: typeof schema.interactiveLearningAgent.$inferInsert) {
		return await db.insert(schema.interactiveLearningAgent).values(data);
	}

	static async updateAgentActivity(
		activityId: string,
		data: Partial<typeof schema.interactiveLearningAgent.$inferInsert>
	) {
		return await db
			.update(schema.interactiveLearningAgent)
			.set(data)
			.where(eq(schema.interactiveLearningAgent.id, activityId));
	}

	// ─── Herramientas Habilitadas por Actividad ───

	static async getEnabledToolsForActivity(activityId: string): Promise<ToolDefinitionResolved[]> {
		const rows = await db
			.select({
				tool: schema.agentToolDefinition,
				activityTool: schema.agentActivityTool
			})
			.from(schema.agentActivityTool)
			.innerJoin(
				schema.agentToolDefinition,
				eq(schema.agentActivityTool.toolDefinitionId, schema.agentToolDefinition.id)
			)
			.where(
				and(
					eq(schema.agentActivityTool.agentActivityId, activityId),
					eq(schema.agentActivityTool.isEnabled, true),
					eq(schema.agentToolDefinition.isActive, true)
				)
			);

		return rows.map((row) => {
			const tool = row.tool;
			const activityTool = row.activityTool;

			let parametersSchema: Record<string, unknown> = {};
			let responseSchema: Record<string, unknown> | undefined = undefined;
			let executorConfig: Record<string, unknown> = {};
			let configOverride: Record<string, unknown> | undefined = undefined;

			try {
				parametersSchema = JSON.parse(tool.parametersSchema) as Record<string, unknown>;
			} catch {
				// Use empty schema as fallback
			}
			if (tool.responseSchema) {
				try {
					responseSchema = JSON.parse(tool.responseSchema) as Record<string, unknown>;
				} catch {
					// ignore
				}
			}
			try {
				executorConfig = JSON.parse(tool.executorConfig) as Record<string, unknown>;
			} catch {
				// ignore
			}
			if (activityTool.configOverride) {
				try {
					configOverride = JSON.parse(activityTool.configOverride) as Record<string, unknown>;
				} catch {
					// ignore
				}
			}

			return {
				id: tool.id,
				name: tool.name,
				displayName: tool.displayName,
				description: tool.description,
				category: tool.category,
				parametersSchema,
				responseSchema,
				executorType: tool.executorType as 'builtin' | 'http' | 'script',
				executorConfig,
				requiresConfirmation: tool.requiresConfirmation,
				riskLevel: tool.riskLevel as 'low' | 'medium' | 'high',
				configOverride
			} satisfies ToolDefinitionResolved;
		});
	}

	static async setActivityTools(activityId: string, toolIds: string[]) {
		// Eliminar las existentes
		await db
			.delete(schema.agentActivityTool)
			.where(eq(schema.agentActivityTool.agentActivityId, activityId));

		// Insertar las nuevas
		if (toolIds.length > 0) {
			await db.insert(schema.agentActivityTool).values(
				toolIds.map((toolId) => ({
					id: nanoid(),
					agentActivityId: activityId,
					toolDefinitionId: toolId,
					isEnabled: true,
					createdAt: new Date()
				}))
			);
		}
	}

	private static extractFileIdFromPath(path: string | null | undefined): string | null {
		if (!path) return null;
		const match = path.match(/\/api\/files\/([^/?#]+)/i);
		return match?.[1] ?? null;
	}

	private static normalizeResourceName(value: string): string {
		return value
			.normalize('NFD')
			.replace(/[\u0300-\u036f]/g, '')
			.trim()
			.toLowerCase()
			.replace(/[^a-z0-9]+/g, ' ')
			.replace(/\s+/g, ' ');
	}

	private static removeExtension(value: string): string {
		return value.replace(/\.[a-z0-9]{1,6}$/i, '');
	}

	private static scoreImageNameMatch(query: string, candidateName: string): number {
		const q = this.normalizeResourceName(query);
		const c = this.normalizeResourceName(candidateName);
		const qNoExt = this.removeExtension(q);
		const cNoExt = this.removeExtension(c);

		if (q.length === 0 || c.length === 0) return 0;
		if (q === c) return 140;
		if (qNoExt === cNoExt) return 130;
		if (c.startsWith(q) || cNoExt.startsWith(qNoExt)) return 110;
		if (c.includes(q) || cNoExt.includes(qNoExt)) return 90;

		const queryTokens = qNoExt.split(' ').filter((token) => token.length > 1);
		if (queryTokens.length === 0) return 0;

		let overlap = 0;
		for (const token of queryTokens) {
			if (cNoExt.includes(token)) overlap++;
		}

		return overlap > 0 ? 40 + overlap * 10 : 0;
	}

	private static toSharedImageResource(
		resource: SharedImageCandidate,
		errorContext: string
	): SharedImageResourceResolution {
		if (!resource.mimeType.startsWith('image/')) {
			return {
				ok: false,
				error: `Shared resource "${errorContext}" is not an image.`
			};
		}

		const fileId = resource.fileStorageId ?? this.extractFileIdFromPath(resource.path);
		if (!fileId) {
			return {
				ok: false,
				error: `Shared resource "${errorContext}" has no valid file reference.`
			};
		}

		return {
			ok: true,
			resource: {
				resourceId: resource.id,
				fileId,
				name: resource.name,
				mimeType: resource.mimeType
			}
		};
	}

	static async resolveSharedImageResource(
		activityId: string,
		resourceId: string
	): Promise<SharedImageResourceResolution> {
		const [resource] = await db
			.select()
			.from(schema.interactiveLearningFile)
			.where(
				and(
					eq(schema.interactiveLearningFile.id, resourceId),
					eq(schema.interactiveLearningFile.interactiveLearningId, activityId)
				)
			)
			.limit(1);

		if (!resource) {
			return {
				ok: false,
				error: `Shared resource "${resourceId}" was not found in this activity.`
			};
		}

		return this.toSharedImageResource(resource, resourceId);
	}

	static async resolveSharedImageResourceByName(
		activityId: string,
		resourceName: string
	): Promise<SharedImageResourceResolution> {
		const resources = await db
			.select()
			.from(schema.interactiveLearningFile)
			.where(eq(schema.interactiveLearningFile.interactiveLearningId, activityId));

		const imageResources = resources.filter((resource) => resource.mimeType.startsWith('image/'));
		if (imageResources.length === 0) {
			return {
				ok: false,
				error: `No shared images are available in this activity for "${resourceName}".`
			};
		}

		const scored = imageResources
			.map((resource) => ({
				resource,
				score: this.scoreImageNameMatch(resourceName, resource.name)
			}))
			.filter((entry) => entry.score > 0)
			.sort((a, b) => {
				if (b.score !== a.score) return b.score - a.score;
				return b.resource.createdAt.getTime() - a.resource.createdAt.getTime();
			});

		const bestMatch = scored[0]?.resource;
		if (!bestMatch) {
			return {
				ok: false,
				error: `No shared image matching "${resourceName}" was found in this activity.`
			};
		}

		return this.toSharedImageResource(bestMatch, resourceName);
	}

	static async resolveSharedImageResourceFlexible(
		activityId: string,
		params: { resourceId?: string; resourceName?: string }
	): Promise<SharedImageResourceResolution> {
		if (params.resourceName) {
			const byName = await this.resolveSharedImageResourceByName(activityId, params.resourceName);
			if (byName.ok) return byName;
			if (!params.resourceId) return byName;
		}

		if (params.resourceId) {
			const byId = await this.resolveSharedImageResource(activityId, params.resourceId);
			if (byId.ok) return byId;

			// Compatibilidad: si llega un nombre en resourceId, intentar resolverlo por nombre.
			const byNameFallback = await this.resolveSharedImageResourceByName(activityId, params.resourceId);
			if (byNameFallback.ok) return byNameFallback;

			return byId;
		}

		return {
			ok: false,
			error: 'Either resourceId or resourceName is required to resolve a shared image.'
		};
	}

	// ─── Seed del Asistente Global de Tutoría ───

	static readonly GLOBAL_TUTOR_ID = 'system-global-tutor-v1';

	static async seedGlobalTutor() {
		const { default: DBAgentToolUtils } = await import('./DBAgentToolUtils');
		const { default: DBAgentUIUtils } = await import('./DBAgentUIUtils');

		await DBAgentToolUtils.seedBuiltinTools();
		await DBAgentUIUtils.seedBuiltinUIComponents();

		const existing = await db
			.select({ id: schema.interactiveLearning.id })
			.from(schema.interactiveLearning)
			.where(eq(schema.interactiveLearning.id, this.GLOBAL_TUTOR_ID))
			.get();

		const now = new Date();

		if (!existing) {
			await db.insert(schema.interactiveLearning).values({
				id: this.GLOBAL_TUTOR_ID,
				name: 'Asistente de Tutoría',
				slug: 'asistente-tutoria-global',
				description: 'Asistente inteligente de tutoría para uso general.',
				type: 'agent',
				content: '{}',
				status: 'published',
				createdAt: now,
				updatedAt: now
			});
		}

		const existingAgent = await this.getAgentActivity(this.GLOBAL_TUTOR_ID);
		if (!existingAgent) {
			await db.insert(schema.interactiveLearningAgent).values({
				id: this.GLOBAL_TUTOR_ID,
				llmRole: 'Asistente de Tutoría',
				llmInstructions:
					'Eres un asistente de tutoría inteligente y empático. Ayudas a estudiantes con sus dudas académicas, explicas conceptos complejos de forma clara y los guías en su aprendizaje. Puedes usar herramientas para consultar recursos, calcular expresiones matemáticas y más. Sé amable, paciente y adaptativo al nivel del estudiante.',
				maxToolRoundtrips: 5,
				parallelToolCalls: false,
				toolChoice: 'auto',
				createdAt: now
			});
		}

		// Keep baseline tools synced in existing global tutor installations.
		const tools = await DBAgentToolUtils.getActiveToolDefinitions();
		const defaultGlobalTools = tools.filter((t) =>
			[
				'calculate_expression',
				'render_quiz',
				'render_timed_quiz',
				'render_flashcards',
				'render_graph_plot'
			].includes(t.name)
		);

		if (defaultGlobalTools.length === 0) return;

		if (!existing) {
			if (defaultGlobalTools.length > 0) {
				await this.setActivityTools(
					this.GLOBAL_TUTOR_ID,
					defaultGlobalTools.map((t) => t.id)
				);
			}

			return;
		}

		if (defaultGlobalTools.length > 0) {
			const enabledTools = await this.getEnabledToolsForActivity(this.GLOBAL_TUTOR_ID);
			const mergedToolIds = [...enabledTools.map((t) => t.id)];

			for (const tool of defaultGlobalTools) {
				if (!mergedToolIds.includes(tool.id)) {
					mergedToolIds.push(tool.id);
				}
			}

			if (mergedToolIds.length !== enabledTools.length) {
				await this.setActivityTools(this.GLOBAL_TUTOR_ID, mergedToolIds);
			}
		}

	}

	static async getOrCreateTutorChat(userId: string): Promise<string> {
		// Check for existing chat
		const existing = await db
			.select({ chatId: schema.userInteractiveLearningChat.chatId })
			.from(schema.userInteractiveLearningChat)
			.where(
				and(
					eq(schema.userInteractiveLearningChat.userId, userId),
					eq(schema.userInteractiveLearningChat.interactiveLearningChatId, this.GLOBAL_TUTOR_ID)
				)
			)
			.orderBy(desc(schema.userInteractiveLearningChat.createdAt))
			.limit(1)
			.get();

		if (existing) return existing.chatId;

		// Create new chat
		const [newChat] = await db
			.insert(schema.chat)
			.values({
				id: nanoid(),
				userId,
				title: 'Asistente de Tutoría',
				metadata: JSON.stringify({ tutorMode: true }),
				createdAt: new Date(),
				updatedAt: new Date()
			})
			.returning();

		await db.insert(schema.userInteractiveLearningChat).values({
			id: nanoid(),
			userId,
			interactiveLearningChatId: this.GLOBAL_TUTOR_ID,
			chatId: newChat.id,
			createdAt: new Date()
		});

		return newChat.id;
	}
}
