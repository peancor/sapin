import test from 'node:test';
import assert from 'node:assert/strict';

import { createFrameBatcher, isImeComposing, toAnnouncementText } from './composer';

test('isImeComposing detecta composición nativa y el keyCode 229 de Safari', () => {
	assert.equal(isImeComposing({ isComposing: false, keyCode: 13 }), false);
	assert.equal(isImeComposing({ isComposing: true, keyCode: 13 }), true);
	assert.equal(isImeComposing({ isComposing: false, keyCode: 229 }), true);
});

function createManualScheduler() {
	const pending = new Map<number, () => void>();
	let nextHandle = 1;
	return {
		pending,
		scheduler: {
			request(callback: () => void) {
				const handle = nextHandle++;
				pending.set(handle, callback);
				return handle;
			},
			cancel(handle: number) {
				pending.delete(handle);
			}
		},
		runFrame() {
			const callbacks = [...pending.values()];
			pending.clear();
			for (const callback of callbacks) callback();
		}
	};
}

test('createFrameBatcher agrupa varias peticiones en un único volcado por frame', () => {
	const manual = createManualScheduler();
	let flushes = 0;
	const batcher = createFrameBatcher(() => flushes++, manual.scheduler);

	batcher.schedule();
	batcher.schedule();
	batcher.schedule();
	assert.equal(manual.pending.size, 1);
	assert.equal(flushes, 0);

	manual.runFrame();
	assert.equal(flushes, 1);

	batcher.schedule();
	manual.runFrame();
	assert.equal(flushes, 2);
});

test('flushNow vuelca de inmediato y cancel descarta el frame pendiente', () => {
	const manual = createManualScheduler();
	let flushes = 0;
	const batcher = createFrameBatcher(() => flushes++, manual.scheduler);

	batcher.schedule();
	batcher.flushNow();
	assert.equal(flushes, 1);
	assert.equal(manual.pending.size, 0);
	manual.runFrame();
	assert.equal(flushes, 1);

	batcher.schedule();
	batcher.cancel();
	manual.runFrame();
	assert.equal(flushes, 1);

	batcher.flushNow();
	assert.equal(flushes, 2);
});

test('toAnnouncementText quita la sintaxis de Markdown y los marcadores internos', () => {
	assert.equal(
		toAnnouncementText(
			'# Hola **mundo**\n\n- uno\n- `dos`\n> cita [enlace](https://example.invalid) [[DONE]]'
		),
		'Respuesta del asistente: Hola mundo uno dos cita enlace'
	);
	assert.equal(toAnnouncementText('  \n '), '');
});
