import { hash } from '@node-rs/argon2';
import { eq } from 'drizzle-orm';
import { existsSync } from 'node:fs';
import * as s from '../src/lib/server/db/schema/index';
import { radarFixture } from '../src/lib/server/radar/testing';

const destination = process.argv[2];
if (!destination || existsSync(destination)) throw new Error('Se requiere una BD nueva.');
const f = radarFixture();
try {
	const now = new Date();
	f.database
		.update(s.user)
		.set({ passwordHash: await hash('Sapin-e2e-2026!') })
		.run();
	f.database.update(s.course).set({ status: 'published' }).run();
	f.database.update(s.interactiveLearning).set({ status: 'published' }).run();
	f.database.insert(s.interactiveLearningChat).values({ id: 'activity', createdAt: now }).run();
	for (const type of ['lesson', 'agent']) {
		f.database
			.insert(s.interactiveLearning)
			.values({
				id: type,
				name: `Prueba ${type}`,
				slug: type,
				type,
				content: '{}',
				status: 'published',
				createdAt: now,
				updatedAt: now
			})
			.run();
		f.database
			.insert(s.courseInteractiveLearning)
			.values({
				id: type,
				courseId: 'course',
				interactiveLearningId: type,
				order: 1,
				createdAt: now
			})
			.run();
	}
	const definition = JSON.stringify({
		version: '2',
		entryBlockId: 'intro',
		blocks: [
			{
				id: 'intro',
				kind: 'content',
				title: 'Introducción de prueba',
				body: 'Contenido ficticio para la prueba.',
				next: 'end'
			},
			{ id: 'end', kind: 'end', title: 'Lección terminada', body: 'Has completado la prueba.' }
		]
	});
	f.database
		.update(s.interactiveLearning)
		.set({ content: definition })
		.where(eq(s.interactiveLearning.id, 'lesson'))
		.run();
	f.database
		.insert(s.interactiveLearningLesson)
		.values({ id: 'lesson', createdAt: now, updatedAt: now })
		.run();
	f.database
		.insert(s.interactiveLearningLessonRevision)
		.values({
			id: 'revision',
			interactiveLearningId: 'lesson',
			revisionNumber: 1,
			status: 'published',
			definitionJson: definition,
			publishedAt: now,
			createdAt: now,
			updatedAt: now
		})
		.run();
	f.database
		.update(s.interactiveLearningLesson)
		.set({ publishedRevisionId: 'revision' })
		.where(eq(s.interactiveLearningLesson.id, 'lesson'))
		.run();
	f.database
		.insert(s.interactiveLearningAgent)
		.values({ id: 'agent', createdAt: now, finalizationEnabled: false })
		.run();
	f.database
		.insert(s.chat)
		.values({ id: 'agent-chat', userId: 'student', createdAt: now, updatedAt: now })
		.run();
	f.database
		.insert(s.userInteractiveLearningChat)
		.values({
			id: 'agent-chat',
			userId: 'student',
			chatId: 'agent-chat',
			interactiveLearningChatId: 'agent',
			createdAt: now
		})
		.run();
	f.database
		.insert(s.agentToolDefinition)
		.values({
			id: 'calculator',
			name: 'calculate_expression',
			displayName: 'Calculadora de prueba',
			description: 'Suma sin efectos externos',
			category: 'data',
			parametersSchema: '{}',
			executorType: 'builtin',
			executorConfig: JSON.stringify({ handler: 'calculateExpression' }),
			requiresConfirmation: true,
			createdAt: now,
			updatedAt: now
		})
		.run();
	f.database
		.insert(s.agentActivityTool)
		.values({
			id: 'calculator',
			agentActivityId: 'agent',
			toolDefinitionId: 'calculator',
			createdAt: now
		})
		.run();
	for (const id of ['approve-call', 'reject-call', 'foreign-call']) {
		f.database
			.insert(s.agentMessage)
			.values({
				id,
				chatId: id === 'foreign-call' ? 'chat' : 'agent-chat',
				role: 'assistant',
				textContent: 'Confirmación de prueba',
				createdAt: now
			})
			.run();
		f.database
			.insert(s.agentToolCall)
			.values({
				id,
				messageId: id,
				toolName: 'calculate_expression',
				toolDefinitionId: 'calculator',
				arguments: JSON.stringify({ expression: '2+3' }),
				status: 'awaiting_confirmation',
				createdAt: now
			})
			.run();
	}
	await f.client.backup(destination);
} finally {
	f.client.close();
}
