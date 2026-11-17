import test from 'node:test';
import assert from 'node:assert/strict';

import { AttemptLimiter } from './rateLimit';

test('bloquea al alcanzar el máximo y libera al terminar la ventana', () => {
	const limiter = new AttemptLimiter(3, 60_000);
	const start = 1_000_000;

	assert.equal(limiter.check('a', start).limited, false);
	limiter.hit('a', start);
	limiter.hit('a', start + 1);
	assert.equal(limiter.check('a', start + 2).limited, false);
	limiter.hit('a', start + 2);

	const blocked = limiter.check('a', start + 3);
	assert.equal(blocked.limited, true);
	assert.equal(blocked.retryAfterSeconds, 60);
	assert.equal(limiter.check('b', start + 3).limited, false);

	assert.equal(limiter.check('a', start + 60_000).limited, false);
	limiter.hit('a', start + 60_000);
	assert.equal(limiter.check('a', start + 60_001).limited, false);
});

test('reset limpia la clave y el tamaño queda acotado', () => {
	const limiter = new AttemptLimiter(1, 60_000, 5);
	limiter.hit('a', 0);
	assert.equal(limiter.check('a', 1).limited, true);
	limiter.reset('a');
	assert.equal(limiter.check('a', 1).limited, false);

	for (let i = 0; i < 50; i++) limiter.hit(`k${i}`, 10);
	// La más reciente sigue contando; las antiguas se descartaron sin crecer sin límite.
	assert.equal(limiter.check('k49', 11).limited, true);
	assert.equal(limiter.check('k0', 11).limited, false);
});
