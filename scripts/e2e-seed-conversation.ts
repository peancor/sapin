import { hash } from '@node-rs/argon2';
import { dirname, join } from 'node:path';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import type { radarFixture } from '../src/lib/server/radar/testing';
import * as s from '../src/lib/server/db/schema/index';
import { prepareTikzjaxBrowserDiagram } from '../src/lib/utils/tikzjaxBrowserDiagram';
export async function seedConversationExports(
	db: ReturnType<typeof radarFixture>['database'],
	destination: string,
	now: Date
) {
	// A dedicated course keeps PDF tests independent of progress and review lists.
	db.insert(s.course)
		.values({
			id: 'pdf-course',
			slug: 'pdf-course',
			name: 'Curso PDF',
			createdAt: now,
			updatedAt: now
		})
		.run();
	const passwordHash = await hash('Sapin-e2e-2026!');
	for (const role of ['student', 'teacher'] as const) {
		const userId = 'pdf-' + role;
		db.insert(s.user)
			.values({
				id: userId,
				email: userId + '@example.invalid',
				displayName: userId,
				passwordHash,
				createdAt: now,
				updatedAt: now
			})
			.run();
		db.insert(s.userRoleAssignment)
			.values({ id: userId, userId, roleId: role, assignedAt: now })
			.run();
		db.insert(s.courseRole)
			.values({
				id: 'pdf-' + role,
				userId,
				courseId: 'pdf-course',
				role,
				isActive: true,
				assignedAt: now
			})
			.run();
	}
	db.insert(s.courseRole)
		.values({
			id: 'pdf-classmate',
			userId: 'student2',
			courseId: 'pdf-course',
			role: 'student',
			isActive: true,
			assignedAt: now
		})
		.run();
	for (const type of ['chat', 'agent'] as const) {
		const id = 'pdf-' + type;
		db.insert(s.interactiveLearning)
			.values({
				id,
				slug: id,
				type,
				name: 'Repaso de álgebra',
				content: '{}',
				status: 'published',
				createdAt: now,
				updatedAt: now
			})
			.run();
		db.insert(s.courseInteractiveLearning)
			.values({ id, courseId: 'pdf-course', interactiveLearningId: id, order: 0, createdAt: now })
			.run();
		db.insert(s.chat)
			.values({
				id,
				userId: 'pdf-student',
				metadata:
					type === 'agent'
						? JSON.stringify({ agentFinalization: { executedAt: now.toISOString() } })
						: null,
				createdAt: now,
				updatedAt: now
			})
			.run();
		db.insert(s.userInteractiveLearningChat)
			.values({
				id,
				userId: 'pdf-student',
				chatId: id,
				interactiveLearningChatId: id,
				createdAt: now
			})
			.run();
		db.insert(s.chat)
			.values({ id: id + '-open', userId: 'pdf-student', createdAt: now, updatedAt: now })
			.run();
		db.insert(s.userInteractiveLearningChat)
			.values({
				id: id + '-open',
				userId: 'pdf-student',
				chatId: id + '-open',
				interactiveLearningChatId: id,
				createdAt: now
			})
			.run();
		const imageId = type === 'chat' ? 'pdf-chat-image' : 'pdf-image';
		const folder = join(dirname(destination), 'files');
		mkdirSync(folder, { recursive: true });
		const image = readFileSync('static/images/logo_sapin128.png');
		writeFileSync(join(folder, imageId + '.png'), image);
		db.insert(s.fileStorage)
			.values({
				id: imageId,
				name: 'Sapin.png',
				internalPath: imageId + '.png',
				mimeType: 'image/png',
				size: image.length,
				hash: createHash('sha256').update(image).digest('hex'),
				category: 'chat',
				entityType: type === 'chat' ? 'interactive_learning_chat' : 'interactive_learning',
				entityId: id,
				visibility: 'restricted',
				uploadedBy: 'pdf-student',
				uploadedAt: now
			})
			.run();
		if (type === 'chat') {
			db.insert(s.interactiveLearningChat).values({ id, createdAt: now }).run();
			db.insert(s.message)
				.values({
					id: 'pdf-chat-open-message',
					chatId: id + '-open',
					type: 'USER',
					content: 'Mi primera pregunta de álgebra.',
					tokenCount: 0,
					finishReason: 'stop',
					createdAt: now
				})
				.run();
			const texts = [
				'Instrucción interna reservada',
				'¿Cómo cambia la curva?',
				'![Figura del enunciado](https://old-campus.example.invalid/api/files/pdf-chat-image)',
				...Array.from(
					{ length: 12 },
					(_, i) =>
						'**Valor de la función en ' +
						i +
						'**\n\nPara $x=' +
						i +
						'$, se obtiene $y=' +
						i +
						'^2=' +
						i * i +
						'$. '
				),
				'Último turno conservado [[DONE]]'
			];
			for (const [i, content] of texts.entries())
				db.insert(s.message)
					.values({
						id: id + i,
						chatId: id,
						content,
						type: i === 0 ? 'SYSTEM' : i === 1 ? 'USER' : 'ASSISTANT',
						tokenCount: 0,
						finishReason: 'stop',
						createdAt: new Date(+now + i * 1000)
					})
					.run();
		} else {
			db.insert(s.interactiveLearningAgent).values({ id, createdAt: now }).run();
			db.insert(s.agentMessage)
				.values({
					id,
					chatId: id,
					role: 'assistant',
					textContent:
						'Compara la curva con la imagen.\n\n![Imagen de la actividad](/images/logo_sapin128.png)',
					sequenceOrder: 0,
					createdAt: now
				})
				.run();
			db.insert(s.agentMessage)
				.values({
					id: 'pdf-question',
					chatId: id,
					role: 'user',
					textContent: '¿Podemos repasar este ejemplo?',
					createdAt: new Date(+now - 1000)
				})
				.run();
			db.insert(s.agentMessageAttachment)
				.values({
					id: 'pdf-attached',
					chatId: id,
					messageId: 'pdf-question',
					fileStorageId: 'pdf-image',
					status: 'attached',
					uploadedBy: 'pdf-student',
					mimeType: 'image/png',
					size: image.length,
					createdAt: now,
					updatedAt: now
				})
				.run();
			const questions = [
				{
					question: '¿Cuánto vale $3^2$?',
					options: ['Nueve', 'Seis'],
					correctIndex: 0,
					explanation: 'Solución privada pendiente.'
				}
			];
			db.insert(s.agentMessage)
				.values({
					id: 'pdf-agent-open-message',
					chatId: id + '-open',
					role: 'assistant',
					textContent: 'Prueba a resolver esta pregunta.',
					createdAt: now
				})
				.run();
			const quiz = { answers: [0], score: 1, completed: true };
			for (const [key, props, response] of [
				[
					'SharedImageCard',
					{ title: 'Imagen compartida', name: 'Sapin.png', fileId: 'pdf-image' },
					null
				],
				[
					'SvgDiagramCard',
					{
						title: 'Círculo',
						svg: '<svg xmlns="http://www.w3.org/2000/svg" width="90" height="75"><circle cx="44" cy="38" r="30" fill="#30795c"/></svg>'
					},
					null
				],
				[
					'TikzjaxDiagramCard',
					{
						title: 'Triángulo',
						request: prepareTikzjaxBrowserDiagram({
							source: '\\begin{tikzpicture}\\draw (0,0)--(1,0)--(0,1)--cycle;\\end{tikzpicture}'
						}).request
					},
					null
				],
				['TimedQuizCard', { title: 'Práctica cronometrada', questions }, null],
				[
					'ImmersiveTimedQuiz',
					{
						title: 'Práctica inmersiva',
						questions: questions.map((q) => ({ ...q, explanation: 'Tres por tres.' }))
					},
					quiz
				],
				[
					'FlashcardDeck',
					{ title: 'Tarjetas de repaso', cards: [{ front: 'Área del cuadrado', back: '$A=l^2$' }] },
					{ cardsReviewed: 1 }
				],
				['WorkingMemoryTest', { title: 'Memoria de trabajo', mode: 'forward' }, null],
				['AttentionControlTest', { title: 'Atención selectiva', testType: 'stroop' }, null],
				[
					'SustainedAttentionTest',
					{ title: 'Atención sostenida' },
					{ score: 0.75, completed: true, totalTrials: 4 }
				],
				['DrivingPsychotechTest', { title: 'Coordinación' }, null],
				['ExecutiveFlexibilityTest', { title: 'Flexibilidad cognitiva' }, null],
				[
					'GraphPlotCard',
					{ title: 'Curva cuadrática', mode: 'formula', formula: { expression: 'x^2' } },
					null
				],
				[
					'QuizCard',
					{
						title: 'Comprueba tu respuesta',
						questions: [
							{
								question: '¿Cuánto es dos al cuadrado?',
								options: ['Cuatro', 'Ocho'],
								correctIndex: 0,
								explanation: 'Dos por dos son cuatro.'
							}
						]
					},
					{ answers: [0], score: 1, completed: true }
				]
			] as const) {
				const uiId = 'pdf-' + key;
				db.insert(s.agentUIComponent)
					.values({
						id: uiId,
						name: uiId,
						displayName: key,
						componentKey: key,
						description: key,
						category: 'test',
						propsSchema: '{}',
						createdAt: now,
						updatedAt: now
					})
					.run();
				db.insert(s.agentUIInstance)
					.values({
						id: uiId,
						messageId: id,
						uiComponentId: uiId,
						props: JSON.stringify(props),
						userResponse: response ? JSON.stringify(response) : null,
						createdAt: now
					})
					.run();
			}
			db.insert(s.agentUIInstance)
				.values({
					id: 'pdf-agent-open-quiz',
					messageId: 'pdf-agent-open-message',
					uiComponentId: 'pdf-QuizCard',
					props: JSON.stringify({ title: 'Cuestionario en curso', questions }),
					createdAt: now
				})
				.run();
		}
	}
}
