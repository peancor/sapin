import { fail } from '@sveltejs/kit';
import { eq } from 'drizzle-orm';
import { nanoid } from 'nanoid';
import { db } from '$lib/server/db';
import * as table from '$lib/server/db/schema';
import { buildToolUrl, getLtiToolName } from '$lib/server/lti/config';
import { ensureActiveToolKey, getPublicJwks } from '$lib/server/lti/keys';
import type { Actions, PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ url }) => {
	const [platforms, deployments, jwks] = await Promise.all([
		db.select().from(table.ltiPlatformRegistration).orderBy(table.ltiPlatformRegistration.name),
		db.select().from(table.ltiDeployment).orderBy(table.ltiDeployment.name),
		getPublicJwks()
	]);

	return {
		toolName: getLtiToolName(),
		urls: {
			login: buildToolUrl(url, '/lti/login'),
			launch: buildToolUrl(url, '/lti/launch'),
			deepLink: buildToolUrl(url, '/lti/launch'),
			jwks: buildToolUrl(url, '/lti/jwks.json')
		},
		platforms,
		deployments,
		jwks
	};
};

export const actions: Actions = {
	createPlatform: async ({ request }) => {
		const form = await request.formData();
		const name = String(form.get('name') ?? '').trim();
		const issuer = String(form.get('issuer') ?? '').trim();
		const clientId = String(form.get('clientId') ?? '').trim();
		const authLoginUrl = String(form.get('authLoginUrl') ?? '').trim();
		const tokenUrl = String(form.get('tokenUrl') ?? '').trim();
		const jwksUrl = String(form.get('jwksUrl') ?? '').trim();
		const deploymentId = String(form.get('deploymentId') ?? '').trim();
		const deploymentName = String(form.get('deploymentName') ?? name).trim();

		if (!name || !issuer || !clientId || !authLoginUrl || !tokenUrl || !jwksUrl || !deploymentId) {
			return fail(400, { message: 'Completa todos los campos requeridos.' });
		}

		const now = new Date();
		const platformId = nanoid();
		await db.insert(table.ltiPlatformRegistration).values({
			id: platformId,
			name,
			issuer,
			clientId,
			authLoginUrl,
			tokenUrl,
			jwksUrl,
			status: table.ltiRegistrationStatus.ACTIVE,
			createdAt: now,
			updatedAt: now
		});

		await db.insert(table.ltiDeployment).values({
			id: nanoid(),
			platformId,
			deploymentId,
			name: deploymentName || name,
			status: table.ltiDeploymentStatus.ACTIVE,
			createdAt: now,
			updatedAt: now
		});

		return { message: 'Plataforma LTI registrada.' };
	},
	ensureKey: async () => {
		await ensureActiveToolKey();
		return { message: 'Clave LTI activa disponible.' };
	},
	togglePlatform: async ({ request }) => {
		const form = await request.formData();
		const id = String(form.get('id') ?? '');
		const status = String(form.get('status') ?? '');

		if (!id || !['active', 'paused', 'disabled'].includes(status)) {
			return fail(400, { message: 'Estado de plataforma inválido.' });
		}

		await db
			.update(table.ltiPlatformRegistration)
			.set({ status: status as table.LtiRegistrationStatus, updatedAt: new Date() })
			.where(eq(table.ltiPlatformRegistration.id, id));

		return { message: 'Plataforma actualizada.' };
	}
};
