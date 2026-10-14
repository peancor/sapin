import test from 'node:test';
import assert from 'node:assert/strict';
import { eq } from 'drizzle-orm';
import { radarAnalysis, radarRun } from '$lib/server/db/schema';
import {
	createRunSchema,
	patchRunSchema,
	presetSchema,
	extractionSchema,
	prioritizeSynthesisTopics
} from './domain';
import type { RadarTopicView } from '$lib/types/radar';
import { RadarWorker, type RadarAI } from './RadarWorker';
import { fakeRadarAI, radarFixture } from './testing';

test('settings schemas bound preferences and require a revision for edits', () => {
	assert.ok(!patchRunSchema.safeParse({ instructions: 'breve' }).success);
	assert.ok(!patchRunSchema.safeParse({ settingsRevision: 1 }).success);
	assert.ok(
		!patchRunSchema.safeParse({ instructions: 'x'.repeat(4001), settingsRevision: 1 }).success
	);
	assert.ok(patchRunSchema.safeParse({ instructions: '', settingsRevision: 1 }).success);
	assert.ok(
		!createRunSchema.safeParse({ title: 'Clase', modelId: 'model', initialView: 'html' }).success
	);
	assert.ok(!presetSchema.safeParse({ name: ' ' }).success);
});

test('explicit focus can prioritize a less frequent topic without changing its data', () => {
	const base = {
		description: '',
		suggestion: null,
		firstAt: '',
		lastAt: '',
		confusionCount: 0,
		trend: null
	};
	const topics: RadarTopicView[] = [
		{
			...base,
			id: 'common',
			title: 'Derivadas',
			students: 12,
			messages: 20,
			intents: { concept: 20 }
		},
		{
			...base,
			id: 'notation',
			title: 'Símbolos',
			students: 1,
			messages: 1,
			intents: { notation: 1 }
		}
	];
	const ordered = prioritizeSynthesisTopics(topics, 'Destaca las dudas de notación');
	assert.equal(ordered[0], topics[1]);
	assert.deepEqual(prioritizeSynthesisTopics(topics, ''), topics);
	assert.equal(topics[0].id, 'common');
});

test('course presets are scoped, copied into runs and independent of deletion', () => {
	const f = radarFixture();
	try {
		const preset = f.repository.createPreset(
			'course',
			presetSchema.parse({
				name: 'Geometría',
				context: 'Bachillerato',
				instructions: 'Usa ejemplos geométricos',
				initialView: 'cloud'
			})
		);
		assert.equal(f.repository.presets('course').length, 1);
		assert.deepEqual(f.repository.presets('another-course'), []);
		assert.throws(() => f.repository.deletePreset('another-course', preset.id), /no encontrada/);
		f.repository.stop(f.run.id);
		const run = f.repository.create('course', 'activity', 'teacher', {
			...preset,
			title: 'Otra clase',
			durationMinutes: 90,
			modelId: 'model'
		});
		f.repository.deletePreset('course', preset.id);
		assert.equal(f.repository.get(run.id).instructions, preset.instructions);
		assert.equal(f.repository.get(run.id).initialView, 'cloud');
	} finally {
		f.client.close();
	}
});

test('changing instructions resynthesizes without reclassification and preserves provenance', async () => {
	const f = radarFixture();
	const calls: { extraction: boolean; payload: Record<string, unknown> }[] = [];
	const fake = fakeRadarAI();
	const ai: RadarAI = {
		async generate(schema, messages, ...args) {
			calls.push({
				extraction: Object.is(schema, extractionSchema),
				payload: JSON.parse(messages[1].content as string)
			});
			return fake.generate(schema, messages, ...args);
		}
	};
	try {
		f.addMessage('m1', '¿Qué es una derivada?');
		const worker = new RadarWorker(
			f.repository,
			ai,
			async () => true,
			async () => {}
		);
		await worker.process(f.run.id);
		const observations = f.repository.observations(f.run.id);
		const before = f.repository.get(f.run.id);
		const changed = f.repository.patch(
			f.run.id,
			{ instructions: 'Usa ejemplos geométricos', settingsRevision: 1 },
			'teacher'
		);
		assert.equal(changed.summary, before.summary);
		assert.equal(changed.summarySettingsRevision, 1);
		assert.equal(changed.settingsRevision, 2);
		assert.throws(
			() => f.repository.patch(f.run.id, { instructions: 'Otra', settingsRevision: 1 }),
			/ha cambiado/
		);
		await worker.process(f.run.id);
		assert.deepEqual(f.repository.observations(f.run.id), observations);
		assert.equal(calls.filter((c) => c.extraction).length, 1);
		assert.equal(calls.filter((c) => !c.extraction).length, 2);
		assert.ok(!('teacherInstructions' in calls[0].payload));
		assert.equal(calls.at(-1)!.payload.teacherInstructions, changed.instructions);
		assert.equal(calls.at(-1)!.payload.previousSummary, null);
		const result = f.repository.get(f.run.id);
		assert.equal(result.summarySettingsRevision, 2);
		assert.equal(result.summaryInstructions, changed.instructions);
		assert.deepEqual(result.synthesisCoverage, { includedTopics: 1, totalTopics: 1 });
		assert.ok(
			f.database
				.select()
				.from(radarAnalysis)
				.all()
				.some((a) => a.settingsRevision === 2 && a.instructions === changed.instructions)
		);
	} finally {
		f.client.close();
	}
});

test('an instruction edit while synthesis runs fences stale results and schedules latest version', async () => {
	const f = radarFixture();
	let change = false;
	const fake = fakeRadarAI((stage) => {
		if (stage === 'synthesis' && change) {
			change = false;
			f.repository.patch(
				f.run.id,
				{ instructions: 'Ahora ejemplos', settingsRevision: 2 },
				'teacher'
			);
		}
	});
	try {
		f.addMessage('m1', 'Derivada');
		const worker = new RadarWorker(
			f.repository,
			fake,
			async () => true,
			async () => {}
		);
		await worker.process(f.run.id);
		const before = f.repository.get(f.run.id);
		f.repository.patch(f.run.id, { instructions: 'Breve', settingsRevision: 1 });
		change = true;
		await worker.process(f.run.id);
		const stale = f.repository.get(f.run.id);
		assert.equal(stale.summarySettingsRevision, 1);
		assert.equal(stale.summary, before.summary);
		assert.equal(stale.settingsRevision, 3);
		assert.equal(stale.analysisState, 'pending');
		assert.equal(stale.error, null);
		assert.ok(stale.synthesisPending);
		await worker.process(f.run.id);
		assert.equal(f.repository.get(f.run.id).summarySettingsRevision, 3);
		assert.equal(f.repository.observations(f.run.id).length, 1);
	} finally {
		f.client.close();
	}
});

test('synthesis failure keeps previous summary and suggestions for retry', async () => {
	const f = radarFixture();
	try {
		f.addMessage('m1', 'Derivada');
		await new RadarWorker(f.repository, fakeRadarAI(), async () => true).process(f.run.id);
		const before = f.repository.get(f.run.id);
		const topics = f.repository.topics(f.run.id);
		f.repository.patch(f.run.id, { instructions: 'Breve', settingsRevision: 1 });
		const broken: RadarAI = {
			async generate() {
				throw new Error('Provider failure');
			}
		};
		await new RadarWorker(f.repository, broken, async () => true).process(f.run.id);
		assert.equal(f.repository.get(f.run.id).summary, before.summary);
		assert.deepEqual(f.repository.topics(f.run.id), topics);
		assert.equal(f.repository.get(f.run.id).analysisState, 'blocked');
		f.repository.queue(f.run.id);
		await new RadarWorker(f.repository, fakeRadarAI(), async () => true).process(f.run.id);
		assert.equal(f.repository.get(f.run.id).summarySettingsRevision, 2);
		f.database.update(radarRun).set({ state: 'finalized' }).where(eq(radarRun.id, f.run.id)).run();
		assert.throws(
			() => f.repository.patch(f.run.id, { instructions: 'Más', settingsRevision: 2 }),
			/cerrado/
		);
	} finally {
		f.client.close();
	}
});
