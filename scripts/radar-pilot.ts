import { existsSync, mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { hash } from '@node-rs/argon2';
import { eq } from 'drizzle-orm';
import * as schema from '../src/lib/server/db/schema/index';
import { radarFixture, fakeRadarAI } from '../src/lib/server/radar/testing';
import { radarPilotCases } from '../src/lib/server/radar/pilotCases';
import { RadarWorker, type RadarAI } from '../src/lib/server/radar/RadarWorker';
import { extractionSchema, type RadarInput } from '../src/lib/server/radar/domain';

const destination = process.argv[2];
if (!destination || !destination.endsWith('.db'))
	throw new Error('Indica una ruta nueva .db para la demostración aislada.');
const path = resolve(destination);
if (existsSync(path)) throw new Error('La ruta ya existe; no se sobrescriben bases de datos.');
mkdirSync(dirname(path), { recursive: true });
const f = radarFixture();
try {
	// Keep the demonstration in the past relative to the server's real clock.
	f.advance(Math.floor(Date.now() / 1000) * 1000 - +f.now() - 15 * 60000);
	f.database
		.update(schema.radarRun)
		.set({ startsAt: f.now(), endsAt: new Date(+f.now() + 90 * 60000), nextAnalysisAt: f.now() })
		.run();
	f.addChat('second', 'student2');
	f.database
		.update(schema.user)
		.set({ passwordHash: await hash('Radar-pilot-2026!'), alias: 'Docente de prueba' })
		.where(eq(schema.user.id, 'teacher'))
		.run();
	f.database
		.insert(schema.interactiveLearningChat)
		.values({ id: 'activity', createdAt: f.now() })
		.run();
	f.database.update(schema.course).set({ status: 'published' }).run();
	f.database.update(schema.interactiveLearning).set({ status: 'published' }).run();
	for (const [i, c] of radarPilotCases.entries())
		f.addMessage(
			`case-${i}`,
			c.text,
			new Date(+f.now() + c.minute * 60000),
			'user',
			c.student === 'student' ? 'chat' : 'second'
		);
	f.advance(12 * 60000);
	f.repository.stop(f.run.id);
	const canned = fakeRadarAI();
	const ai: RadarAI = {
		async generate(schema, messages, ...args) {
			if (!Object.is(schema, extractionSchema)) return canned.generate(schema, messages, ...args);
			const data = JSON.parse(messages[1].content as string);
			return schema.parse({
				observations: (data.observations as RadarInput[]).map((input) => {
					const label = radarPilotCases.find((c) => c.text === input.text)!;
					return {
						id: input.id,
						intent: label.intent,
						confusion: label.confusion,
						insufficientContext: 'insufficientContext' in label,
						evidenceIds: [input.id],
						topics:
							label.intent === 'social' || label.intent === 'other'
								? []
								: [
										{
											existingId: null,
											title:
												label.intent === 'notation'
													? 'Notación de derivadas'
													: 'Derivada y pendiente',
											description: 'Consultas sobre el significado y el cálculo de la derivada.'
										}
									]
					};
				})
			});
		}
	};
	await new RadarWorker(f.repository, ai, async () => true).tick();
	await f.client.backup(path);
	console.log(
		`BD de demostración creada: ${path}\nCuenta ficticia: teacher@example.invalid / Radar-pilot-2026!\nRuta: /course/course/admin/interactives/activity/radar?run=${f.run.id}\nAnálisis precargado simulado: no se ha llamado a ningún proveedor.`
	);
} finally {
	f.client.close();
}
