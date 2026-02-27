import { db } from '..';
import { eq, and, asc, desc } from 'drizzle-orm';
import * as schema from '../schema';
import { nanoid } from 'nanoid';
import type { ToolDefinitionResolved } from '$lib/types/agent';

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

	static async setActivityUIComponents(activityId: string, uiComponentIds: string[]) {
		await db
			.delete(schema.agentActivityUIComponent)
			.where(eq(schema.agentActivityUIComponent.agentActivityId, activityId));

		if (uiComponentIds.length > 0) {
			await db.insert(schema.agentActivityUIComponent).values(
				uiComponentIds.map((uiId) => ({
					id: nanoid(),
					agentActivityId: activityId,
					uiComponentId: uiId,
					isEnabled: true,
					createdAt: new Date()
				}))
			);
		}
	}

	static async getEnabledUIComponentsForActivity(activityId: string) {
		const rows = await db
			.select({ component: schema.agentUIComponent })
			.from(schema.agentActivityUIComponent)
			.innerJoin(
				schema.agentUIComponent,
				eq(schema.agentActivityUIComponent.uiComponentId, schema.agentUIComponent.id)
			)
			.where(
				and(
					eq(schema.agentActivityUIComponent.agentActivityId, activityId),
					eq(schema.agentActivityUIComponent.isEnabled, true),
					eq(schema.agentUIComponent.isActive, true)
				)
			);
		return rows.map((r) => r.component);
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

		const uiComponents = await DBAgentUIUtils.getAllUIComponents();
		const defaultGlobalUIComponents = uiComponents.filter((component) =>
			['quiz_card', 'timed_quiz_card', 'flashcard_deck', 'graph_plot_card'].includes(component.name)
		);

		if (defaultGlobalTools.length === 0 && defaultGlobalUIComponents.length === 0) return;

		if (!existing) {
			if (defaultGlobalTools.length > 0) {
				await this.setActivityTools(
					this.GLOBAL_TUTOR_ID,
					defaultGlobalTools.map((t) => t.id)
				);
			}

			if (defaultGlobalUIComponents.length > 0) {
				await this.setActivityUIComponents(
					this.GLOBAL_TUTOR_ID,
					defaultGlobalUIComponents.map((component) => component.id)
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

		if (defaultGlobalUIComponents.length > 0) {
			const enabledUIComponents = await this.getEnabledUIComponentsForActivity(
				this.GLOBAL_TUTOR_ID
			);
			const mergedUIComponentIds = [...enabledUIComponents.map((component) => component.id)];

			for (const component of defaultGlobalUIComponents) {
				if (!mergedUIComponentIds.includes(component.id)) {
					mergedUIComponentIds.push(component.id);
				}
			}

			if (mergedUIComponentIds.length !== enabledUIComponents.length) {
				await this.setActivityUIComponents(this.GLOBAL_TUTOR_ID, mergedUIComponentIds);
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
