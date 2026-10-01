import test from 'node:test';
import assert from 'node:assert/strict';
import { zodSchema } from 'ai';
import { eq } from 'drizzle-orm';
import * as schema from '$lib/server/db/schema';
import { invalidateRadarChats, RadarRepository } from './RadarRepository';
import {
	aggregateTopics,
	extractionSchema,
	normalizeTitle,
	statistics,
	synthesisSchema,
	validateExtraction,
	type RadarInput
} from './domain';
import { prepareBatch, RadarWorker, type RadarAI } from './RadarWorker';
import { fakeRadarAI, radarFixture } from './testing';

test('esquemas compatibles con Gemini conservan límites de listas en servidor', async () => {
	for (const definition of [zodSchema(extractionSchema), zodSchema(synthesisSchema)]) {
		const exported = await definition.jsonSchema;
		assert.ok(!JSON.stringify(exported).includes('"maxItems"'));
	}
	const observation = {
		id: 'message',
		intent: 'concept',
		topics: [],
		confusion: null,
		evidenceIds: ['message'],
		insufficientContext: false
	};
	assert.ok(extractionSchema.safeParse({ observations: [observation] }).success);
	assert.ok(!extractionSchema.safeParse({ observations: Array(51).fill(observation) }).success);
	assert.ok(
		!extractionSchema.safeParse({
			observations: [{ ...observation, evidenceIds: Array(8).fill('message') }]
		}).success
	);
	const topic = { existingId: null, title: 'Derivadas', description: 'Significado' };
	assert.ok(
		!extractionSchema.safeParse({
			observations: [{ ...observation, topics: Array(4).fill(topic) }]
		}).success
	);
	const clarification = {
		topicId: 'topic',
		suggestion: 'Mostrar un ejemplo',
		evidenceIds: ['message']
	};
	assert.ok(
		synthesisSchema.safeParse({ summary: 'Resumen', clarifications: [clarification] }).success
	);
	assert.ok(
		!synthesisSchema.safeParse({ summary: 'Resumen', clarifications: Array(9).fill(clarification) })
			.success
	);
	for (const length of [0, 6]) {
		assert.ok(
			!synthesisSchema.safeParse({
				summary: 'Resumen',
				clarifications: [{ ...clarification, evidenceIds: Array(length).fill('message') }]
			}).success
		);
	}
});

for (const type of ['chat', 'agent'] as const)
	test(`${type}: intervalo por mensaje, chats antiguos, contexto y exclusiones`, () => {
		const f = radarFixture(type);
		try {
			f.addMessage('before', 'Contexto previo', new Date(+f.now() - 1000), 'assistant');
			f.addMessage('first', '¿Qué significa derivar?');
			f.addMessage('same-second', 'Un ejemplo');
			// Messages in the current second are visible on the very next refresh.
			f.repository.ingest(f.run);
			assert.equal(f.repository.observations(f.run.id).length, 2);
			f.addMessage('internal', '[[start]]');
			f.addMessage('image', null);
			f.addMessage('assistant', 'Respuesta', f.now(), 'assistant');
			if (type === 'agent') f.addMessage('tool', '{"result":1}', f.now(), 'tool');
			f.addChat('teacher-chat', 'teacher');
			f.addMessage('teacher', 'Pregunta del docente', f.now(), 'user', 'teacher-chat');
			// A teacher who also has a student role must still be excluded.
			f.database
				.insert(schema.courseRole)
				.values({
					id: 'teacher-student',
					courseId: 'course',
					userId: 'teacher',
					role: 'student',
					assignedAt: f.now()
				})
				.run();
			f.addChat('second-chat');
			f.addMessage('second', 'Otra duda', f.now(), 'user', 'second-chat');
			f.addMessage('end', 'Fuera', f.run.endsAt);
			f.advance(1000);
			const snapshot = f.repository.snapshot(f.run.id, 'all');
			assert.equal(snapshot.statistics.messages, 4);
			assert.equal(snapshot.statistics.students, 1);
			assert.equal(snapshot.statistics.coverage.notAnalyzable, 1);
			const first = f.repository
				.observations(f.run.id)
				.find((o) => (o.messageId ?? o.agentMessageId) === 'first')!;
			const input = f.repository.input(f.run, first);
			assert.equal(input.text, '¿Qué significa derivar?');
			assert.equal(input.context[0].text, 'Contexto previo');
			assert.ok(!input.context.some((c) => c.text === 'Un ejemplo'));
			f.repository.ingest(f.run);
			assert.equal(f.repository.observations(f.run.id).length, 4);
			assert.deepEqual(f.client.pragma('foreign_key_check'), []);
		} finally {
			f.client.close();
		}
	});

test('se conservan matrículas históricas y se comprueba pertenencia al incorporar', () => {
	const f = radarFixture();
	try {
		f.addMessage('first', 'Duda');
		f.advance(1000);
		f.repository.ingest(f.run);
		f.database
			.update(schema.courseRole)
			.set({ isActive: false })
			.where(eq(schema.courseRole.id, 'student'))
			.run();
		f.addMessage('second', 'Otra');
		f.advance(1000);
		f.repository.ingest(f.run);
		assert.equal(f.repository.observations(f.run.id).length, 1);
		assert.throws(() => f.repository.activity('another-course', 'activity'), /no encontrada/);
		assert.throws(() => f.repository.get(f.run.id, 'another-course', 'activity'), /no encontrado/);
		assert.throws(() => f.repository.get(f.run.id, 'course', 'another-activity'), /no encontrado/);
		assert.throws(() => f.repository.evidence(f.run.id, 'fake-topic', 'all', 0), /no encontrada/);
	} finally {
		f.client.close();
	}
});

test('unicidad de seguimiento, extensión limitada y cierre automático sin navegador', async () => {
	const f = radarFixture();
	try {
		assert.equal(
			f.repository.create('course', 'activity', 'teacher', {
				title: 'Segunda pestaña',
				durationMinutes: 90,
				modelId: 'model'
			}).id,
			f.run.id
		);
		assert.throws(
			() =>
				f.repository.patch(f.run.id, {
					endsAt: new Date(+f.run.startsAt + 241 * 60000).toISOString()
				}),
			/cuatro horas/
		);
		f.repository.patch(f.run.id, {
			title: 'Nuevo título',
			endsAt: new Date(+f.run.startsAt + 120 * 60000).toISOString()
		});
		let calls = 0;
		f.advance(121 * 60000);
		await new RadarWorker(
			f.repository,
			fakeRadarAI(() => calls++),
			async () => true
		).tick();
		assert.equal(f.repository.get(f.run.id).state, 'finalized');
		assert.equal(calls, 0);
		assert.equal(f.repository.history('course', 'activity').runs.length, 1);
		assert.throws(() => f.repository.patch(f.run.id, { title: 'Tarde' }), /cerrado/);
	} finally {
		f.client.close();
	}
});

test('incremental, temas estables, no reclasificar y síntesis única por ciclo', async () => {
	const f = radarFixture();
	let extracts = 0,
		syntheses = 0;
	try {
		const worker = new RadarWorker(
			f.repository,
			fakeRadarAI((stage) => (stage === 'extract' ? extracts++ : syntheses++)),
			async () => true
		);
		f.addMessage('one', '¿Qué es la derivada?');
		f.addMessage('thanks', 'gracias');
		f.advance(1000);
		await worker.tick();
		const first = f.repository.snapshot(f.run.id, 'all');
		assert.equal(first.statistics.coverage.processed, 2);
		assert.equal(first.topics.length, 1);
		assert.equal(first.topics[0].messages, 1);
		assert.equal(first.usage.estimatedCost, null);
		f.repository.queue(f.run.id);
		await worker.tick();
		assert.equal(extracts, 1);
		assert.equal(syntheses, 1);
		f.addMessage('two', '¿Puedes poner un ejemplo?');
		f.advance(1000);
		f.repository.queue(f.run.id);
		await worker.tick();
		const second = f.repository.snapshot(f.run.id, 'all');
		assert.equal(second.topics[0].id, first.topics[0].id);
		assert.equal(second.topics[0].students, 1);
		assert.equal(second.topics[0].intents.example, 1);
		assert.equal(second.topics[0].confusionCount, 0);
		assert.equal(extracts, 2);
		assert.equal(syntheses, 2);
		assert.equal(f.repository.evidence(f.run.id, second.topics[0].id, 'all', 0).evidence.length, 2);
	} finally {
		f.client.close();
	}
});

test('bloqueo entre workers y recuperación tras caducidad sin duplicados', async () => {
	const f = radarFixture();
	try {
		f.addMessage('one', 'Pregunta');
		f.advance(1000);
		const claimed = f.repository.claim(f.run.id, 'old-owner');
		assert.ok(claimed);
		assert.equal(f.repository.claim(f.run.id, 'other'), undefined);
		f.advance(180001);
		const recovered = new RadarRepository(f.database, f.now);
		let calls = 0;
		const worker1 = new RadarWorker(
			recovered,
			fakeRadarAI(() => calls++),
			async () => true
		);
		const worker2 = new RadarWorker(
			recovered,
			fakeRadarAI(() => calls++),
			async () => true
		);
		await Promise.all([worker1.tick(), worker2.tick()]);
		assert.equal(calls, 2);
		assert.equal(recovered.observations(f.run.id).length, 1);
		assert.throws(() => recovered.renew(f.run.id, 'old-owner'), /caducado/);
	} finally {
		f.client.close();
	}
});

test('fallo de síntesis conserva clasificaciones y permite reintento sobre intervalo cerrado', async () => {
	const f = radarFixture();
	const good = fakeRadarAI();
	try {
		f.addMessage('one', 'Pregunta');
		f.advance(1000);
		f.repository.stop(f.run.id);
		const ai: RadarAI = {
			async generate(schema, ...args) {
				if (!Object.is(schema, extractionSchema)) throw new Error('synthesis failed');
				return good.generate(schema, ...args);
			}
		};
		await new RadarWorker(f.repository, ai, async () => true).tick();
		const snapshot = f.repository.snapshot(f.run.id, 'all');
		assert.equal(snapshot.run.state, 'finalized');
		assert.equal(snapshot.run.analysisState, 'blocked');
		assert.equal(snapshot.statistics.coverage.processed, 1);
		assert.equal(snapshot.topics.length, 1);
		assert.equal(snapshot.run.summary, null);
		let extracts = 0;
		f.repository.queue(f.run.id);
		await new RadarWorker(
			f.repository,
			fakeRadarAI((s) => {
				if (s === 'extract') extracts++;
			}),
			async () => true
		).tick();
		assert.equal(extracts, 0);
		assert.ok(f.repository.get(f.run.id).summary);
	} finally {
		f.client.close();
	}
});

test('timeout transitorio reintenta dos veces; cuota y permiso revocado bloquean', async () => {
	const f = radarFixture();
	try {
		f.addMessage('one', 'Pregunta');
		f.advance(1000);
		let calls = 0;
		await new RadarWorker(
			f.repository,
			{
				generate: async () => {
					calls++;
					return await new Promise(() => {});
				}
			},
			async () => true,
			async () => {},
			5
		).tick();
		assert.equal(calls, 3);
		assert.equal(f.repository.get(f.run.id).analysisState, 'blocked');
		f.repository.queue(f.run.id);
		calls = 0;
		await new RadarWorker(
			f.repository,
			{
				generate: async () => {
					calls++;
					throw new Error('Cuota excedida: límite');
				}
			},
			async () => true
		).tick();
		assert.equal(calls, 1);
		assert.match(f.repository.get(f.run.id).error!, /Cuota/);
		f.repository.queue(f.run.id);
		calls = 0;
		await new RadarWorker(
			f.repository,
			fakeRadarAI(() => calls++),
			async () => false
		).tick();
		assert.equal(calls, 0);
		assert.match(f.repository.get(f.run.id).error!, /permiso/);
	} finally {
		f.client.close();
	}
});

test('borrado elimina evidencias e interpretaciones derivadas, incluso con análisis en curso', async () => {
	const f = radarFixture();
	try {
		f.addMessage('one', 'Pregunta');
		f.advance(1000);
		await new RadarWorker(f.repository, fakeRadarAI(), async () => true).tick();
		const topic = f.repository.topics(f.run.id)[0];
		f.database.transaction((tx) => invalidateRadarChats(tx, ['chat']));
		f.database.delete(schema.message).where(eq(schema.message.chatId, 'chat')).run();
		const snapshot = f.repository.snapshot(f.run.id, 'all');
		assert.equal(snapshot.statistics.messages, 0);
		assert.equal(snapshot.topics.length, 0);
		assert.equal(snapshot.run.summary, null);
		assert.throws(() => f.repository.evidence(f.run.id, topic.id, 'all', 0), /no encontrada/);
		assert.equal(f.database.select().from(schema.radarAnalysis).get()!.summary, null);
		f.addMessage('new', 'Otra duda');
		f.advance(1000);
		f.repository.queue(f.run.id);
		const good = fakeRadarAI();
		const ai: RadarAI = {
			async generate(schema, ...args) {
				const result = await good.generate(schema, ...args);
				f.database.transaction((tx) => invalidateRadarChats(tx, ['chat']));
				return result;
			}
		};
		await new RadarWorker(f.repository, ai, async () => true).tick();
		assert.equal(f.repository.topics(f.run.id).length, 0);
	} finally {
		f.client.close();
	}
});

test('referencias inventadas, cierres sociales y normalización de temas', () => {
	const input: RadarInput[] = [
		{ id: 'one', student: 's1', text: 'ejemplo', context: [], truncated: false }
	];
	const result = extractionSchema.parse({
		observations: [
			{
				id: 'one',
				intent: 'example',
				topics: [],
				confusion: null,
				evidenceIds: ['one'],
				insufficientContext: false
			}
		]
	});
	assert.equal(validateExtraction(result, input, new Set()).observations[0].intent, 'example');
	assert.throws(
		() =>
			validateExtraction(
				{ observations: [{ ...result.observations[0], evidenceIds: ['foreign'] }] },
				input,
				new Set()
			),
		/ajena/
	);
	assert.throws(
		() =>
			validateExtraction(
				{
					observations: [
						{
							...result.observations[0],
							topics: [{ existingId: 'foreign', title: 't', description: 'd' }]
						}
					]
				},
				input,
				new Set()
			),
		/desconocido/
	);
	assert.throws(
		() =>
			validateExtraction(
				{ observations: [{ ...result.observations[0], confusion: 'Error', evidenceIds: [] }] },
				input,
				new Set()
			),
		/sin evidencia/
	);
	assert.equal(normalizeTitle('  Límites: laterales! '), normalizeTitle('limites laterales'));
	const batch = prepareBatch([{ ...input[0], text: 'a'.repeat(20000) }], 8000, 2000, 1200);
	assert.equal(batch.input[0].truncated, true);
	assert.ok(batch.input[0].text.length < 8000);
});

test('ventanas, tendencias y personas únicas aunque haya varios mensajes y temas', () => {
	const start = new Date('2026-10-01T09:00:00Z'),
		end = new Date(+start + 600000);
	const rows = [10000, 310000, 400000].map((time, index) => ({
		id: `${index}`,
		studentId: 's1',
		at: new Date(+start + time),
		status: 'processed',
		intent: 'concept' as const,
		confusion: null,
		truncated: false
	}));
	const topics = [{ id: 't', title: 'T', description: 'D', suggestion: null }],
		links = rows.map((r) => ({ observationId: r.id, topicId: 't' }));
	assert.equal(statistics(rows, start, end).students, 1);
	const all = aggregateTopics(topics, links, rows, 'all', start, end)[0];
	assert.equal(all.messages, 3);
	assert.equal(all.trend?.percent, 100);
	assert.equal(aggregateTopics(topics, links, rows, 'recent', start, end)[0].messages, 2);
	assert.equal(
		aggregateTopics(topics, links, rows, 'all', start, new Date(+start + 590000))[0].trend,
		null
	);
});

test('cierre automático mientras hay una llamada al modelo en curso', async () => {
	const f = radarFixture();
	try {
		f.addMessage('one', 'Pregunta');
		f.advance(1000);
		let release!: () => void;
		let entered!: () => void;
		const started = new Promise<void>((resolve) => {
			entered = resolve;
		});
		const gate = new Promise<void>((resolve) => {
			release = resolve;
		});
		const good = fakeRadarAI();
		const ai: RadarAI = {
			async generate(schema, ...args) {
				entered();
				await gate;
				return good.generate(schema, ...args);
			}
		};
		const worker = new RadarWorker(f.repository, ai, async () => true);
		const processing = worker.tick();
		await started;
		f.advance(90 * 60000);
		await worker.tick();
		assert.equal(f.repository.get(f.run.id).state, 'finalizing');
		release();
		await processing;
		assert.equal(f.repository.get(f.run.id).state, 'finalized');
	} finally {
		f.client.close();
	}
});

test('modelo deshabilitado suspende llamadas y textos truncados mantienen cobertura parcial', async () => {
	const f = radarFixture();
	try {
		f.addMessage('long', 'Pregunta '.repeat(10000));
		f.advance(1000);
		f.database
			.update(schema.aiModel)
			.set({ isActive: false })
			.where(eq(schema.aiModel.id, 'model'))
			.run();
		let calls = 0;
		const worker = new RadarWorker(
			f.repository,
			fakeRadarAI(() => calls++),
			async () => true
		);
		await worker.tick();
		assert.equal(calls, 0);
		assert.equal(f.repository.get(f.run.id).analysisState, 'blocked');
		f.database
			.update(schema.aiModel)
			.set({ isActive: true, contextWindow: 16000 })
			.where(eq(schema.aiModel.id, 'model'))
			.run();
		f.repository.queue(f.run.id);
		await worker.tick();
		const snapshot = f.repository.snapshot(f.run.id, 'all');
		assert.equal(snapshot.statistics.coverage.truncated, 1);
		assert.equal(snapshot.run.analysisState, 'partial');
	} finally {
		f.client.close();
	}
});

test('el planificador admite como máximo dos llamadas concurrentes por proceso', async () => {
	const f = radarFixture();
	try {
		for (const id of ['course2', 'course3']) {
			f.database
				.insert(schema.course)
				.values({ id, slug: id, name: id, createdAt: f.now(), updatedAt: f.now() })
				.run();
			f.database
				.insert(schema.courseInteractiveLearning)
				.values({
					id,
					courseId: id,
					interactiveLearningId: 'activity',
					order: 0,
					createdAt: f.now()
				})
				.run();
			f.database
				.insert(schema.courseRole)
				.values({ id, courseId: id, userId: 'student', role: 'student', assignedAt: f.now() })
				.run();
			f.repository.create(id, 'activity', 'teacher', {
				title: id,
				durationMinutes: 90,
				modelId: 'model'
			});
		}
		f.addMessage('one', 'Una duda');
		f.advance(1000);
		let active = 0,
			peak = 0;
		const good = fakeRadarAI();
		const ai: RadarAI = {
			async generate(schema, ...args) {
				active++;
				peak = Math.max(peak, active);
				try {
					await new Promise((resolve) => setTimeout(resolve, 5));
					return await good.generate(schema, ...args);
				} finally {
					active--;
				}
			}
		};
		await new RadarWorker(f.repository, ai, async () => true).tick();
		assert.equal(peak, 2);
		assert.equal(f.database.select().from(schema.radarObservation).all().length, 3);
	} finally {
		f.client.close();
	}
});

test('un fin ampliado con milisegundos conserva el intervalo semiabierto', () => {
	const f = radarFixture();
	try {
		const end = new Date(+f.run.endsAt + 500);
		f.repository.patch(f.run.id, { endsAt: end.toISOString() });
		f.addMessage('within-last-second', 'Duda dentro', new Date(+f.run.endsAt));
		f.addMessage('after-end', 'Duda fuera', new Date(+f.run.endsAt + 1000));
		f.advance(90 * 60000 + 2000);
		f.repository.ingest(f.repository.get(f.run.id));
		assert.equal(f.repository.observations(f.run.id).length, 1);
		assert.equal(f.repository.observations(f.run.id)[0].messageId, 'within-last-second');
	} finally {
		f.client.close();
	}
});
