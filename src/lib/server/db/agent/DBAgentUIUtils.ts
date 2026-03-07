import { db } from '..';
import { eq, and, asc } from 'drizzle-orm';
import * as schema from '../schema';
import { nanoid } from 'nanoid';

export default class DBAgentUIUtils {
	// ─── Catálogo Global de Componentes UI (Admin) ───

	static async getAllUIComponents() {
		return await db
			.select()
			.from(schema.agentUIComponent)
			.orderBy(asc(schema.agentUIComponent.category), asc(schema.agentUIComponent.name));
	}

	static async getUIComponentById(id: string) {
		const [record] = await db
			.select()
			.from(schema.agentUIComponent)
			.where(eq(schema.agentUIComponent.id, id));
		return record ?? null;
	}

	static async getUIComponentByName(name: string) {
		const [record] = await db
			.select()
			.from(schema.agentUIComponent)
			.where(eq(schema.agentUIComponent.name, name));
		return record ?? null;
	}

	static async getUIComponentByKey(componentKey: string) {
		const [record] = await db
			.select()
			.from(schema.agentUIComponent)
			.where(eq(schema.agentUIComponent.componentKey, componentKey));
		return record ?? null;
	}

	static async createUIComponent(
		data: Omit<typeof schema.agentUIComponent.$inferInsert, 'id' | 'createdAt' | 'updatedAt'>
	) {
		const id = nanoid();
		await db.insert(schema.agentUIComponent).values({
			id,
			...data,
			createdAt: new Date(),
			updatedAt: new Date()
		});
		return id;
	}

	static async updateUIComponent(
		id: string,
		data: Partial<typeof schema.agentUIComponent.$inferInsert>
	) {
		await db
			.update(schema.agentUIComponent)
			.set({ ...data, updatedAt: new Date() })
			.where(eq(schema.agentUIComponent.id, id));
	}

	static async deleteUIComponent(id: string) {
		await db
			.delete(schema.agentUIComponent)
			.where(and(eq(schema.agentUIComponent.id, id), eq(schema.agentUIComponent.isSystem, false)));
	}

	// ─── Instancias de UI ───

	static async saveUIInstance(data: {
		id?: string;
		messageId: string;
		uiComponentId: string;
		componentKey: string;
		props: string;
		metadata?: string;
	}): Promise<string> {
		const id = data.id ?? nanoid();
		await db.insert(schema.agentUIInstance).values({
			id,
			messageId: data.messageId,
			uiComponentId: data.uiComponentId,
			props: data.props,
			metadata: data.metadata ?? JSON.stringify({ componentKey: data.componentKey }),
			createdAt: new Date()
		});
		return id;
	}

	static async getUIInstance(instanceId: string) {
		const [record] = await db
			.select()
			.from(schema.agentUIInstance)
			.where(eq(schema.agentUIInstance.id, instanceId));
		return record ?? null;
	}

	static async updateUIInstance(
		instanceId: string,
		data: Partial<typeof schema.agentUIInstance.$inferInsert>
	) {
		await db
			.update(schema.agentUIInstance)
			.set(data)
			.where(eq(schema.agentUIInstance.id, instanceId));
	}

	// ─── Seed de Componentes UI builtin ───

	static async seedBuiltinUIComponents() {
		const builtinUIComponents = [
			{
				name: 'quiz_card',
				displayName: 'Quiz Interactivo',
				description:
					'Componente de preguntas de opción múltiple para evaluar comprensión del estudiante.',
				category: 'evaluation',
				componentKey: 'QuizCard',
				propsSchema: JSON.stringify({
					type: 'object',
					properties: {
						title: { type: 'string', description: 'Título del quiz' },
						questions: {
							type: 'array',
							description: 'Lista de preguntas del quiz',
							items: {
								type: 'object',
								properties: {
									question: { type: 'string' },
									options: { type: 'array', items: { type: 'string' } },
									correctIndex: { type: 'integer' },
									explanation: { type: 'string' }
								},
								required: ['question', 'options', 'correctIndex']
							}
						}
					},
					required: ['questions']
				}),
				responseSchema: JSON.stringify({
					type: 'object',
					properties: {
						answers: { type: 'array', items: { type: 'integer' } },
						score: { type: 'number' },
						completed: { type: 'boolean' }
					}
				}),
				isSystem: true,
				version: '1.0.0'
			},
			{
				name: 'timed_quiz_card',
				displayName: 'Quiz Contrarreloj',
				description:
					'Componente tipo minijuego que presenta preguntas secuenciales con timer por dificultad.',
				category: 'evaluation',
				componentKey: 'TimedQuizCard',
				propsSchema: JSON.stringify({
					type: 'object',
					properties: {
						title: { type: 'string', description: 'TÃ­tulo del quiz' },
						difficulty: {
							type: 'string',
							enum: ['easy', 'medium', 'hard'],
							description: 'Nivel de dificultad del quiz'
						},
						timerByDifficultySec: {
							type: 'object',
							description: 'ConfiguraciÃ³n opcional de segundos por dificultad',
							properties: {
								easy: { type: 'number' },
								medium: { type: 'number' },
								hard: { type: 'number' }
							}
						},
						autoAdvanceDelayMs: {
							type: 'number',
							description: 'Retraso en milisegundos antes de pasar a la siguiente pregunta'
						},
						questions: {
							type: 'array',
							description: 'Lista de preguntas del quiz',
							items: {
								type: 'object',
								properties: {
									question: { type: 'string' },
									options: { type: 'array', items: { type: 'string' } },
									correctIndex: { type: 'integer' },
									explanation: { type: 'string' }
								},
								required: ['question', 'options', 'correctIndex']
							}
						}
					},
					required: ['questions']
				}),
				responseSchema: JSON.stringify({
					type: 'object',
					properties: {
						answers: { type: 'array', items: { type: 'integer' } },
						difficulty: { type: 'string', enum: ['easy', 'medium', 'hard'] },
						timePerQuestionSec: { type: 'number' },
						questionResults: {
							type: 'array',
							items: {
								type: 'object',
								properties: {
									selectedIndex: { type: 'integer' },
									correctIndex: { type: 'integer' },
									isCorrect: { type: 'boolean' },
									timedOut: { type: 'boolean' },
									responseMs: { type: ['number', 'null'] }
								}
							}
						},
						correctCount: { type: 'integer' },
						timeoutCount: { type: 'integer' },
						score: { type: 'number' },
						completed: { type: 'boolean' }
					}
				}),
				isSystem: true,
				version: '1.0.0'
			},
			{
				name: 'immersive_timed_quiz',
				displayName: 'Quiz Contrarreloj Inmersivo',
				description:
					'Componente inmersivo fullscreen para quizzes contrarreloj con estilo arcade.',
				category: 'evaluation',
				componentKey: 'ImmersiveTimedQuiz',
				propsSchema: JSON.stringify({
					type: 'object',
					properties: {
						title: { type: 'string', description: 'Titulo del quiz' },
						difficulty: {
							type: 'string',
							enum: ['easy', 'medium', 'hard'],
							description: 'Nivel de dificultad del quiz'
						},
						timerByDifficultySec: {
							type: 'object',
							properties: {
								easy: { type: 'number' },
								medium: { type: 'number' },
								hard: { type: 'number' }
							}
						},
						autoAdvanceDelayMs: { type: 'number' },
						questions: {
							type: 'array',
							items: {
								type: 'object',
								properties: {
									question: { type: 'string' },
									options: { type: 'array', items: { type: 'string' } },
									correctIndex: { type: 'integer' },
									explanation: { type: 'string' }
								},
								required: ['question', 'options', 'correctIndex']
							}
						}
					},
					required: ['questions']
				}),
				responseSchema: JSON.stringify({
					type: 'object',
					properties: {
						answers: { type: 'array', items: { type: 'integer' } },
						difficulty: { type: 'string', enum: ['easy', 'medium', 'hard'] },
						timePerQuestionSec: { type: 'number' },
						questionResults: {
							type: 'array',
							items: {
								type: 'object',
								properties: {
									selectedIndex: { type: 'integer' },
									correctIndex: { type: 'integer' },
									isCorrect: { type: 'boolean' },
									timedOut: { type: 'boolean' },
									responseMs: { type: ['number', 'null'] }
								}
							}
						},
						correctCount: { type: 'integer' },
						timeoutCount: { type: 'integer' },
						score: { type: 'number' },
						completed: { type: 'boolean' }
					}
				}),
				isSystem: true,
				version: '1.0.0'
			},
			{
				name: 'sustained_attention_test',
				displayName: 'Test de Atencion Sostenida',
				description:
					'Componente inmersivo para test cognitivos de atencion sostenida, empezando por Go/No-Go.',
				category: 'evaluation',
				componentKey: 'SustainedAttentionTest',
				propsSchema: JSON.stringify({
					type: 'object',
					properties: {
						title: { type: 'string' },
						testType: { type: 'string', enum: ['go_no_go'] },
						difficulty: { type: 'string', enum: ['easy', 'medium', 'hard'] },
						instructions: { type: 'string' },
						practiceTrials: { type: 'number' },
						mainTrials: { type: 'number' },
						goStimulus: { type: 'string' },
						noGoStimulus: { type: 'string' }
					}
				}),
				responseSchema: JSON.stringify({
					type: 'object',
					properties: {
						testType: { type: 'string', enum: ['go_no_go'] },
						difficulty: { type: 'string', enum: ['easy', 'medium', 'hard'] },
						totalTrials: { type: 'integer' },
						goTrials: { type: 'integer' },
						noGoTrials: { type: 'integer' },
						hits: { type: 'integer' },
						commissionErrors: { type: 'integer' },
						omissionErrors: { type: 'integer' },
						meanReactionMs: { type: ['number', 'null'] },
						score: { type: 'number' },
						completed: { type: 'boolean' }
					}
				}),
				isSystem: true,
				version: '1.0.0'
			},
			{
				name: 'attention_control_test',
				displayName: 'Test de Atencion y Control',
				description:
					'Componente inmersivo para pruebas de atencion, inhibicion y control. Incluye Go/No-Go, Stroop y Flanker.',
				category: 'evaluation',
				componentKey: 'AttentionControlTest',
				propsSchema: JSON.stringify({
					type: 'object',
					properties: {
						title: { type: 'string' },
						testType: {
							type: 'string',
							enum: ['go_no_go', 'stroop', 'flanker', 'sdmt']
						},
						difficulty: { type: 'string', enum: ['easy', 'medium', 'hard'] },
						instructions: { type: 'string' },
						practiceTrials: { type: 'number' },
						mainTrials: { type: 'number' },
						goStimulus: { type: 'string' },
						noGoStimulus: { type: 'string' }
					}
				}),
				responseSchema: JSON.stringify({
					type: 'object',
					properties: {
						testType: {
							type: 'string',
							enum: ['go_no_go', 'stroop', 'flanker', 'sdmt']
						},
						difficulty: { type: 'string', enum: ['easy', 'medium', 'hard'] },
						summary: { type: 'object' },
						trialLog: { type: 'array', items: { type: 'object' } },
						score: { type: 'number' },
						completed: { type: 'boolean' }
					}
				}),
				isSystem: true,
				version: '1.0.0'
			},
			{
				name: 'working_memory_test',
				displayName: 'Test de Memoria de Trabajo',
				description:
					'Componente inmersivo para pruebas de memoria de trabajo. La primera variante es Digit Span.',
				category: 'evaluation',
				componentKey: 'WorkingMemoryTest',
				propsSchema: JSON.stringify({
					type: 'object',
					properties: {
						title: { type: 'string' },
						testType: { type: 'string', enum: ['digit_span'] },
						mode: { type: 'string', enum: ['forward', 'backward', 'both'] },
						difficulty: { type: 'string', enum: ['easy', 'medium', 'hard'] },
						instructions: { type: 'string' },
						startLength: { type: 'number' },
						maxLength: { type: 'number' },
						trialsPerLength: { type: 'number' }
					}
				}),
				responseSchema: JSON.stringify({
					type: 'object',
					properties: {
						testType: { type: 'string', enum: ['digit_span'] },
						difficulty: { type: 'string', enum: ['easy', 'medium', 'hard'] },
						mode: { type: 'string', enum: ['forward', 'backward', 'both'] },
						summary: { type: 'object' },
						trialLog: { type: 'array', items: { type: 'object' } },
						score: { type: 'number' },
						completed: { type: 'boolean' }
					}
				}),
				isSystem: true,
				version: '1.0.0'
			},
			{
				name: 'executive_flexibility_test',
				displayName: 'Test de Flexibilidad Ejecutiva',
				description:
					'Componente inmersivo placeholder para la familia de funcion ejecutiva y flexibilidad cognitiva.',
				category: 'evaluation',
				componentKey: 'ExecutiveFlexibilityTest',
				propsSchema: JSON.stringify({
					type: 'object',
					properties: {
						title: { type: 'string' },
						testType: { type: 'string', enum: ['trail_making', 'wcst'] },
						instructions: { type: 'string' }
					}
				}),
				responseSchema: JSON.stringify({
					type: 'object',
					properties: {}
				}),
				isSystem: true,
				version: '1.0.0'
			},
			{
				name: 'flashcard_deck',
				displayName: 'Mazo de Flashcards',
				description: 'Tarjetas de estudio interactivas para memorizar conceptos y definiciones.',
				category: 'practice',
				componentKey: 'FlashcardDeck',
				propsSchema: JSON.stringify({
					type: 'object',
					properties: {
						title: { type: 'string', description: 'Título del mazo' },
						cards: {
							type: 'array',
							description: 'Lista de tarjetas de estudio',
							items: {
								type: 'object',
								properties: {
									front: { type: 'string' },
									back: { type: 'string' }
								},
								required: ['front', 'back']
							}
						}
					},
					required: ['cards']
				}),
				responseSchema: JSON.stringify({
					type: 'object',
					properties: {
						cardsReviewed: { type: 'integer' },
						completed: { type: 'boolean' }
					}
				}),
				isSystem: true,
				version: '1.0.0'
			},
			{
				name: 'graph_plot_card',
				displayName: 'Grafico Educativo',
				description:
					'Visualizacion de graficos educativos basada en formula y=f(x) o lista de datos.',
				category: 'visualization',
				componentKey: 'GraphPlotCard',
				propsSchema: JSON.stringify({
					type: 'object',
					properties: {
						mode: { type: 'string', enum: ['formula', 'data'] },
						title: { type: 'string' },
						formula: {
							type: 'object',
							properties: {
								expression: { type: 'string' },
								domainMin: { type: 'number' },
								domainMax: { type: 'number' },
								samples: { type: 'integer' },
								color: { type: 'string' },
								strokeWidth: { type: 'number' }
							},
							required: ['expression']
						},
						data: {
							type: 'object',
							properties: {
								points: {
									type: 'array',
									items: {
										type: 'object',
										properties: {
											x: { type: 'number' },
											y: { type: 'number' }
										},
										required: ['x', 'y']
									}
								},
								style: { type: 'string', enum: ['line', 'scatter'] },
								color: { type: 'string' }
							},
							required: ['points']
						},
						axes: {
							type: 'object',
							properties: {
								xLabel: { type: 'string' },
								yLabel: { type: 'string' },
								grid: { type: 'boolean' }
							}
						},
						viewport: {
							type: 'object',
							properties: {
								autoFit: { type: 'boolean' },
								xMin: { type: 'number' },
								xMax: { type: 'number' },
								yMin: { type: 'number' },
								yMax: { type: 'number' }
							}
						}
					},
					required: ['mode']
				}),
				isSystem: true,
				version: '1.0.0'
			},
			{
				name: 'shared_image_card',
				displayName: 'Imagen Compartida',
				description:
					'Muestra una imagen compartida de la actividad en el chat, con titulo y pie opcionales.',
				category: 'visualization',
				componentKey: 'SharedImageCard',
				propsSchema: JSON.stringify({
					type: 'object',
					properties: {
						resourceId: { type: 'string', description: 'ID del recurso compartido en la actividad' },
						fileId: { type: 'string', description: 'ID real del archivo para /api/files/{fileId}' },
						name: { type: 'string', description: 'Nombre original del archivo' },
						mimeType: { type: 'string', description: 'MIME type de la imagen' },
						title: { type: 'string', description: 'Titulo opcional para mostrar' },
						caption: { type: 'string', description: 'Pie de foto opcional' }
					},
					required: ['resourceId', 'fileId', 'name', 'mimeType']
				}),
				isSystem: true,
				version: '1.0.0'
			}
		];

		for (const component of builtinUIComponents) {
			const existing = await this.getUIComponentByName(component.name);
			if (!existing) {
				await this.createUIComponent(component);
			}
		}
	}
}
