import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { eq } from 'drizzle-orm';
import { zodSchema } from 'ai';
import {
	radarActionExecution,
	radarObservation,
	radarRun,
	message,
	user
} from '$lib/server/db/schema';
import { radarActionAvailability } from '$lib/utils/radarActionAvailability';
import type { RadarActionInput } from '$lib/types/radarActions';
import { RadarActionRepository } from './RadarActionRepository';
import { RadarActionWorker, type RadarActionAI } from './RadarActionWorker';
import {
	actionPlanSchema,
	actionReportSchema,
	computeActionDatasets,
	type ActionPlan
} from './actionDomain';
import { invalidateRadarChats } from './RadarRepository';
import { radarFixture } from './testing';

const definition: RadarActionInput = {
	name: 'Participación',
	prompt: 'Cuenta mensajes y estudiantes',
	scope: 'activity',
	window: 'all',
	minutes: 5,
	presentation: 'auto'
};
const plan: ActionPlan = {
	queries: [
		{ id: 'messages', groupBy: 'total', metric: 'messages', topicIds: [], intents: [] },
		{ id: 'students', groupBy: 'total', metric: 'students', topicIds: [], intents: [] }
	],
	calculations: [{ id: 'ratio', operation: 'ratio', left: 'messages', right: 'students' }],
	limitations: []
};
function setup() {
	const f = radarFixture();
	const repo = new RadarActionRepository(f.repository);
	const action = repo.save('course', 'activity', definition);
	const enqueue = (requestId = randomUUID()) =>
		repo.enqueue(f.run.id, 'teacher', action.id, action.revision, requestId);
	return { ...f, repo, action, enqueue };
}
function fakeAI(hook?: (stage: string) => void): RadarActionAI {
	return {
		async generate(schema) {
			const stage = Object.is(schema, actionPlanSchema) ? 'plan' : 'report';
			hook?.(stage);
			return schema.parse(
				stage === 'plan'
					? plan
					: {
							text: 'Participación observada.',
							evidenceIds: [],
							blocks: [{ datasetId: 'messages', kind: 'bar' }]
						}
			);
		}
	};
}

test('action schemas retain Gemini-compatible array bounds', async () => {
	for (const schema of [zodSchema(actionPlanSchema), zodSchema(actionReportSchema)])
		assert.ok(!JSON.stringify(await schema.jsonSchema).includes('maxItems'));
	assert.equal(
		actionPlanSchema.safeParse({ ...plan, queries: Array(7).fill(plan.queries[0]) }).success,
		false
	);
});

test('actions can be prepared without a run and comparison availability matches server validation', () => {
	const f = radarFixture();
	try {
		f.database.delete(radarRun).where(eq(radarRun.id, f.run.id)).run();
		const repo = new RadarActionRepository(f.repository);
		const action = repo.save('course', 'activity', {
			...definition,
			window: 'compare',
			minutes: 1
		});
		assert.equal(f.repository.history('course', 'activity').active, null);
		assert.equal(repo.list('course', 'activity')[0].id, action.id);
		const run = f.repository.create('course', 'activity', 'teacher', {
			title: 'Clase preparada',
			durationMinutes: 30,
			modelId: 'model'
		});
		const view = f.repository.view(run);
		f.advance(119998);
		assert.equal(radarActionAvailability(action, view, +f.now()).available, false);
		assert.throws(
			() => repo.enqueue(run.id, 'teacher', action.id, 1, randomUUID()),
			/intervalos completos/
		);
		f.advance(1);
		assert.equal(radarActionAvailability(action, view, +f.now()).available, true);
		const execution = repo.enqueue(run.id, 'teacher', action.id, 1, randomUUID());
		assert.equal(execution.state, 'queued');
		assert.equal(execution.actionId, action.id);
	} finally {
		f.client.close();
	}
});
test('actions enforce scopes, revisions and preserve historical definitions after delete', () => {
	const f = setup();
	try {
		assert.throws(() => f.repo.get(f.action.id, 'other', 'activity'));
		assert.throws(() => f.repo.get(f.action.id, 'course', 'other'));
		assert.throws(() => f.repo.save('course', 'activity', definition, f.action.id, 99));
		const execution = f.enqueue();
		const updated = f.repo.save(
			'course',
			'activity',
			{ ...definition, name: 'Editada', scope: 'course' },
			f.action.id,
			1
		);
		assert.equal(f.repo.get(f.action.id, 'course', 'other').revision, 2);
		assert.throws(() => f.repo.delete(f.action.id, 'course', 'activity', 1));
		f.repo.delete(updated.id, 'course', 'activity', 2);
		const stored = f.repo.raw(execution.id, f.run.id);
		assert.equal(stored.actionId, null);
		assert.equal(stored.action.name, definition.name);
	} finally {
		f.client.close();
	}
});
test('enqueue deduplicates requests and freezes counts across new messages/classification', async () => {
	const f = setup();
	try {
		f.addMessage('first', '¿Cómo se calcula?');
		f.addMessage('second', '¿Un ejemplo?');
		const requestId = randomUUID(),
			execution = f.enqueue(requestId);
		assert.equal(f.enqueue(requestId).id, execution.id);
		assert.throws(() => f.enqueue(), /ya se está ejecutando/);
		f.addMessage('later', 'Nueva pregunta');
		f.repository.ingest(f.run);
		f.database.update(radarObservation).set({ status: 'processed', intent: 'concept' }).run();
		await new RadarActionWorker(f.repo, fakeAI(), async () => true).tick();
		const completed = f.repo.view(f.repo.raw(execution.id, f.run.id));
		assert.equal(completed.state, 'completed');
		assert.equal(completed.snapshot?.pending, 2);
		assert.equal(completed.result?.datasets[0].rows[0].value, 2);
		assert.equal(completed.result?.datasets[1].rows[0].value, 1);
		assert.equal(completed.result?.datasets[2].rows[0].value, 2);
		assert.equal('observations' in completed.snapshot!, false);
		assert.throws(() => f.repo.raw(execution.id, 'other'));
		assert.throws(() => f.repo.evidence(f.repo.raw(execution.id, f.run.id), ['later']));
	} finally {
		f.client.close();
	}
});
test('comparison has equal windows, distinct students, zero denominator and validated queries', () => {
	const f = setup();
	try {
		const action = f.repo.save('course', 'activity', {
			...definition,
			window: 'compare',
			minutes: 1
		});
		assert.throws(
			() => f.repo.enqueue(f.run.id, 'teacher', action.id, 1, randomUUID()),
			/intervalos completos/
		);
		f.advance(30000);
		f.addMessage('old', 'Antes');
		f.advance(60000);
		f.addMessage('new', 'Ahora');
		f.addMessage('new2', 'Otra');
		f.advance(30000);
		const execution = f.repo.enqueue(f.run.id, 'teacher', action.id, 1, randomUUID());
		const snapshot = f.repo.raw(execution.id, f.run.id).snapshot!;
		const result = computeActionDatasets(snapshot, plan);
		assert.equal(result[0].rows[0].value, 2);
		assert.equal(result[0].rows[0].previous, 1);
		assert.equal(result[1].rows[0].value, 1);
		assert.equal(
			computeActionDatasets({ ...snapshot, observations: [] }, plan)[2].rows[0].value,
			null
		);
		assert.throws(() =>
			computeActionDatasets(snapshot, {
				...plan,
				queries: [{ ...plan.queries[0], topicIds: ['unknown'] }]
			})
		);
		assert.throws(() =>
			computeActionDatasets(snapshot, {
				...plan,
				calculations: [{ ...plan.calculations[0], left: 'unknown' }]
			})
		);
	} finally {
		f.client.close();
	}
});
test('source deletion invalidates pending and completed output and fences in-flight work', async () => {
	const f = setup();
	try {
		f.addMessage('first', 'Pregunta');
		const execution = f.enqueue();
		await new RadarActionWorker(
			f.repo,
			fakeAI((stage) => {
				if (stage === 'report') f.database.transaction((tx) => invalidateRadarChats(tx, ['chat']));
			}),
			async () => true
		).tick();
		let row = f.repo.raw(execution.id, f.run.id);
		assert.equal(row.state, 'invalidated');
		assert.equal(row.result, null);
		assert.equal(row.snapshot, null);
		const again = f.enqueue();
		await new RadarActionWorker(f.repo, fakeAI(), async () => true).tick();
		f.database.delete(message).where(eq(message.id, 'first')).run();
		row = f.repo.ensureValid(f.repo.raw(again.id, f.run.id));
		assert.equal(row.state, 'invalidated');
		assert.equal(row.result, null);
	} finally {
		f.client.close();
	}
});
test('revoked permission and actor deletion cannot make billed calls', async () => {
	const f = setup();
	try {
		const execution = f.enqueue();
		let calls = 0;
		const worker = new RadarActionWorker(
			f.repo,
			fakeAI(() => calls++),
			async () => false
		);
		await worker.tick();
		assert.equal(calls, 0);
		assert.equal(f.repo.raw(execution.id, f.run.id).state, 'failed');
		const second = f.enqueue();
		f.database.delete(user).where(eq(user.id, 'teacher')).run();
		await worker.tick();
		assert.equal(calls, 0);
		assert.equal(f.repo.raw(second.id, f.run.id).state, 'failed');
	} finally {
		f.client.close();
	}
});
test('expired executions fail without paid replay; invalid report references fail closed', async () => {
	const f = setup();
	try {
		const execution = f.enqueue();
		let calls = 0;
		f.database
			.update(radarActionExecution)
			.set({ state: 'processing', leaseUntil: f.now() })
			.where(eq(radarActionExecution.id, execution.id))
			.run();
		await new RadarActionWorker(
			f.repo,
			fakeAI(() => calls++),
			async () => true
		).tick();
		assert.equal(calls, 0);
		assert.equal(f.repo.raw(execution.id, f.run.id).state, 'failed');
		const second = f.enqueue();
		const ai: RadarActionAI = {
			async generate(schema) {
				return schema.parse(
					Object.is(schema, actionPlanSchema)
						? plan
						: { text: 'Texto', evidenceIds: ['foreign'], blocks: [] }
				);
			}
		};
		await new RadarActionWorker(f.repo, ai, async () => true).tick();
		assert.equal(f.repo.raw(second.id, f.run.id).state, 'failed');
		assert.equal(f.repo.raw(second.id, f.run.id).result, null);
	} finally {
		f.client.close();
	}
});

test('grouped datasets preserve overlapping topics, distinct learners and minute boundaries', () => {
	const f = setup();
	try {
		f.addMessage('first', 'Primera');
		f.advance(60000);
		f.addMessage('second', 'Segunda');
		const execution = f.enqueue();
		const snapshot = f.repo.raw(execution.id, f.run.id).snapshot!;
		snapshot.topics = [
			{ id: 'a', title: 'A', description: '' },
			{ id: 'b', title: 'B', description: '' }
		];
		snapshot.observations[0] = {
			...snapshot.observations[0],
			topicIds: ['a', 'b'],
			status: 'processed',
			intent: 'concept',
			confusion: true
		};
		snapshot.observations[1] = {
			...snapshot.observations[1],
			topicIds: ['a'],
			status: 'processed',
			intent: 'example',
			confusion: false
		};
		const result = computeActionDatasets(snapshot, {
			queries: [
				{ ...plan.queries[0], id: 'topics', groupBy: 'topics', metric: 'students' },
				{ ...plan.queries[0], id: 'minute', groupBy: 'minute' },
				{ ...plan.queries[0], id: 'confusions', metric: 'confusions' },
				{ ...plan.queries[0], id: 'examples', intents: ['example'] }
			],
			calculations: [],
			limitations: []
		});
		assert.deepEqual(
			result[0].rows.map((r) => r.value),
			[1, 1]
		);
		assert.deepEqual(
			result[1].rows.map((r) => r.value),
			[1, 1]
		);
		assert.equal(result[2].rows[0].value, 1);
		assert.deepEqual(result[2].rows[0].evidenceIds, [snapshot.observations[0].id]);
		assert.equal(result[3].rows[0].value, 1);
		assert.throws(() =>
			computeActionDatasets(snapshot, { ...plan, queries: [plan.queries[0], plan.queries[0]] })
		);
		assert.throws(() =>
			computeActionDatasets(snapshot, {
				...plan,
				calculations: [{ ...plan.calculations[0], operation: 'sum' }]
			})
		);
	} finally {
		f.client.close();
	}
});

test('two workers share the global concurrency bound and do not claim the same execution', async () => {
	const f = setup();
	let release!: () => void;
	const gate = new Promise<void>((resolve) => {
		release = resolve;
	});
	try {
		const first = f.enqueue();
		const secondAction = f.repo.save('course', 'activity', { ...definition, name: 'Segunda' });
		const second = f.repo.enqueue(f.run.id, 'teacher', secondAction.id, 1, randomUUID());
		const third = f.repo.enqueue(f.run.id, 'student2', secondAction.id, 1, randomUUID());
		let calls = 0;
		const ai: RadarActionAI = {
			async generate(schema) {
				calls++;
				await gate;
				return schema.parse(
					Object.is(schema, actionPlanSchema)
						? plan
						: { text: 'Resultado', evidenceIds: [], blocks: [] }
				);
			}
		};
		const firstTick = new RadarActionWorker(f.repo, ai, async () => true).tick();
		await new RadarActionWorker(f.repo, ai, async () => true).tick();
		const states = [first, second, third].map((e) => f.repo.raw(e.id, f.run.id).state);
		assert.equal(states.filter((s) => s === 'processing').length, 2);
		assert.equal(states.filter((s) => s === 'queued').length, 1);
		release();
		await firstTick;
		assert.equal(calls, 4);
	} finally {
		release();
		f.client.close();
	}
});
