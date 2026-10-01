import Database from 'better-sqlite3';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import { migrate } from 'drizzle-orm/better-sqlite3/migrator';
import * as schema from '$lib/server/db/schema';
import { RadarRepository } from './RadarRepository';
import type { RadarAI } from './RadarWorker';
import { extractionSchema, type RadarInput } from './domain';

/** Real SQLite and the official migration chain, isolated from the application's database. */
export function radarFixture(type: 'chat' | 'agent' = 'chat') {
	const client = new Database(':memory:');
	const database = drizzle(client, { schema });
	migrate(database, { migrationsFolder: 'drizzle' });
	client.pragma('foreign_keys = ON');
	let time = new Date('2026-10-01T09:00:00Z');
	const old = new Date(+time - 86400000);
	for (const id of ['teacher', 'student', 'student2'])
		database
			.insert(schema.user)
			.values({
				id,
				email: `${id}@example.invalid`,
				displayName: id,
				passwordHash: 'test',
				createdAt: old,
				updatedAt: old
			})
			.run();
	database
		.insert(schema.course)
		.values({ id: 'course', name: 'Clase', slug: 'clase', createdAt: old, updatedAt: old })
		.run();
	for (const id of ['teacher', 'student', 'student2'])
		database
			.insert(schema.courseRole)
			.values({
				id,
				courseId: 'course',
				userId: id,
				role: id === 'teacher' ? 'teacher' : 'student',
				assignedAt: old
			})
			.run();
	database
		.insert(schema.interactiveLearning)
		.values({
			id: 'activity',
			name: 'Dudas',
			slug: 'dudas',
			type,
			content: '{}',
			createdAt: old,
			updatedAt: old
		})
		.run();
	database
		.insert(schema.courseInteractiveLearning)
		.values({
			id: 'relation',
			courseId: 'course',
			interactiveLearningId: 'activity',
			order: 0,
			createdAt: old
		})
		.run();
	database
		.insert(schema.aiProvider)
		.values({
			id: 'provider',
			name: 'test',
			displayName: 'Test',
			type: 'custom',
			createdAt: old,
			updatedAt: old
		})
		.run();
	database
		.insert(schema.aiModel)
		.values({
			id: 'model',
			providerId: 'provider',
			name: 'test',
			displayName: 'Test',
			capabilities: '["text"]',
			contextWindow: 64000,
			maxOutputTokens: 16000,
			isDefault: true,
			createdAt: old,
			updatedAt: old
		})
		.run();
	function addChat(id: string, studentId = 'student') {
		database
			.insert(schema.chat)
			.values({ id, userId: studentId, createdAt: old, updatedAt: old })
			.run();
		database
			.insert(schema.userInteractiveLearningChat)
			.values({
				id,
				userId: studentId,
				interactiveLearningChatId: 'activity',
				chatId: id,
				createdAt: old
			})
			.run();
	}
	addChat('chat');
	function addMessage(id: string, text: string | null, at = time, role = 'user', chatId = 'chat') {
		if (type === 'chat')
			database
				.insert(schema.message)
				.values({
					id,
					chatId,
					content: text ?? '',
					type: role.toUpperCase() as 'USER',
					createdAt: at,
					tokenCount: 0,
					finishReason: 'stop'
				})
				.run();
		else
			database
				.insert(schema.agentMessage)
				.values({ id, chatId, textContent: text, role, createdAt: at })
				.run();
	}
	const repository = new RadarRepository(database, () => time);
	const run = repository.create('course', 'activity', 'teacher', {
		title: 'Clase de prueba',
		durationMinutes: 90,
		modelId: 'model'
	});
	return {
		client,
		database,
		repository,
		run,
		addChat,
		addMessage,
		now: () => time,
		advance: (ms: number) => {
			time = new Date(+time + ms);
		}
	};
}

export function fakeRadarAI(onCall?: (stage: 'extract' | 'synthesis') => void): RadarAI {
	return {
		async generate(schema, messages) {
			const payload = JSON.parse(messages[1].content as string);
			if (Object.is(schema, extractionSchema)) {
				onCall?.('extract');
				return schema.parse({
					observations: (payload.observations as RadarInput[]).map((input) => ({
						id: input.id,
						intent:
							input.text === 'gracias'
								? 'social'
								: input.text.includes('ejemplo')
									? 'example'
									: 'concept',
						topics:
							input.text === 'gracias'
								? []
								: [
										{
											existingId: payload.topics[0]?.id ?? null,
											title: 'Derivadas',
											description: 'Significado de la derivada'
										}
									],
						confusion: null,
						evidenceIds: [input.id],
						insufficientContext: false
					}))
				});
			}
			onCall?.('synthesis');
			return schema.parse({
				summary: 'Hay consultas sobre derivadas y peticiones de ejemplos.',
				clarifications: payload.topics
					.slice(0, 1)
					.map((t: { id: string; evidence: { id: string }[] }) => ({
						topicId: t.id,
						suggestion: 'Mostrar un ejemplo de pendiente.',
						evidenceIds: t.evidence.map((e) => e.id)
					}))
			});
		}
	};
}
