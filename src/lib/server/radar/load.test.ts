import test from 'node:test';
import assert from 'node:assert/strict';
import { performance } from 'node:perf_hooks';
import * as schema from '$lib/server/db/schema';
import { RadarWorker } from './RadarWorker';
import { fakeRadarAI, radarFixture } from './testing';

test('piloto sintético: 100 estudiantes, 2000 mensajes, ráfaga de 100 y cinco dashboards', async (t) => {
	const f = radarFixture('agent');
	try {
		f.database.transaction(() => {
			for (let i = 0; i < 100; i++) {
				const id = `learner-${i}`;
				f.database
					.insert(schema.user)
					.values({
						id,
						email: `${id}@example.invalid`,
						passwordHash: 'test',
						createdAt: f.now(),
						updatedAt: f.now()
					})
					.run();
				f.database
					.insert(schema.courseRole)
					.values({ id, userId: id, courseId: 'course', role: 'student', assignedAt: f.now() })
					.run();
				f.addChat(id, id);
			}
			for (let i = 0; i < 2000; i++) {
				// 1900 messages over 88 minutes, then a burst sharing the same timestamp.
				const offset = i < 1900 ? Math.floor((i / 1900) * 88 * 60) * 1000 : 88 * 60000;
				f.addMessage(
					`m-${i}`,
					i % 3 === 0
						? '¿Puedes poner un ejemplo de derivada?'
						: '¿Qué significa la pendiente de la tangente?',
					new Date(+f.now() + offset),
					'user',
					`learner-${i % 100}`
				);
			}
		});
		f.advance(89 * 60000);
		const initial = performance.now();
		const first = f.repository.snapshot(f.run.id, 'all');
		const initialMs = performance.now() - initial;
		assert.equal(first.statistics.messages, 2000);
		assert.equal(first.statistics.students, 100);
		assert.equal(first.statistics.coverage.pending, 2000);
		const durations: number[] = [];
		for (let refresh = 0; refresh < 10; refresh++)
			for (let dashboard = 0; dashboard < 5; dashboard++) {
				const started = performance.now();
				const snapshot = f.repository.snapshot(f.run.id, dashboard % 2 ? 'recent' : 'all');
				durations.push(performance.now() - started);
				assert.equal(snapshot.statistics.messages, 2000);
			}
		durations.sort((a, b) => a - b);
		const p95 = durations[Math.floor(durations.length * 0.95)];
		t.diagnostic(
			`SQLite local en memoria: incorporación inicial ${initialMs.toFixed(1)} ms; 50 consultas, p95 ${p95.toFixed(1)} ms. No incluye red ni latencia del proveedor.`
		);
		assert.ok(p95 < 500, `Consulta local p95 ${p95} ms supera objetivo`);
		let calls = 0;
		const worker = new RadarWorker(
			f.repository,
			fakeRadarAI(() => calls++),
			async () => true
		);
		for (let cycle = 0; cycle < 20; cycle++) {
			await worker.tick();
			if (!f.repository.observations(f.run.id).some((o) => o.status === 'pending')) break;
			f.advance(60001);
		}
		const result = f.repository.snapshot(f.run.id, 'all');
		assert.equal(result.statistics.coverage.processed, 2000);
		assert.equal(result.topics[0].messages, 2000);
		assert.equal(result.topics[0].students, 100);
		t.diagnostic(
			`Procesamiento simulado: ${calls} llamadas, 2000 observaciones sin duplicados. La calidad pedagógica requiere revisión docente con el modelo elegido.`
		);
	} finally {
		f.client.close();
	}
});
