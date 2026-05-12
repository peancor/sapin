import { and, desc, eq, isNull } from 'drizzle-orm';
import { nanoid } from 'nanoid';
import { db } from '$lib/server/db';
import * as table from '$lib/server/db/schema';
import type { LtiAgsEndpointClaim, LtiLaunchClaims } from './claims';
import { LTI_CLAIMS } from './claims';
import { LTI_SCORE_SCOPE } from './config';

export async function findActivePlatform(issuer: string, clientId: string) {
	const [platform] = await db
		.select()
		.from(table.ltiPlatformRegistration)
		.where(
			and(
				eq(table.ltiPlatformRegistration.issuer, issuer),
				eq(table.ltiPlatformRegistration.clientId, clientId),
				eq(table.ltiPlatformRegistration.status, table.ltiRegistrationStatus.ACTIVE)
			)
		)
		.limit(1);

	return platform ?? null;
}

export async function findPlatformByIssuer(issuer: string) {
	const [platform] = await db
		.select()
		.from(table.ltiPlatformRegistration)
		.where(
			and(
				eq(table.ltiPlatformRegistration.issuer, issuer),
				eq(table.ltiPlatformRegistration.status, table.ltiRegistrationStatus.ACTIVE)
			)
		)
		.limit(1);

	return platform ?? null;
}

export async function findActiveDeployment(platformId: string, deploymentId: string) {
	const [deployment] = await db
		.select()
		.from(table.ltiDeployment)
		.where(
			and(
				eq(table.ltiDeployment.platformId, platformId),
				eq(table.ltiDeployment.deploymentId, deploymentId),
				eq(table.ltiDeployment.status, table.ltiDeploymentStatus.ACTIVE)
			)
		)
		.limit(1);

	return deployment ?? null;
}

export async function createLoginState(input: {
	platformId: string;
	deploymentId?: string | null;
	targetLinkUri: string;
	loginHint?: string | null;
	messageHint?: string | null;
	clientId: string;
}) {
	const now = new Date();
	const loginState: typeof table.ltiLoginState.$inferInsert = {
		id: nanoid(),
		state: nanoid(32),
		nonce: nanoid(32),
		platformId: input.platformId,
		deploymentId: input.deploymentId ?? null,
		targetLinkUri: input.targetLinkUri,
		loginHint: input.loginHint ?? null,
		messageHint: input.messageHint ?? null,
		clientId: input.clientId,
		expiresAt: new Date(now.getTime() + 10 * 60 * 1000),
		createdAt: now
	};

	await db.insert(table.ltiLoginState).values(loginState);
	return loginState as table.LtiLoginState;
}

export async function consumeLoginState(state: string) {
	const [loginState] = await db
		.select()
		.from(table.ltiLoginState)
		.where(eq(table.ltiLoginState.state, state))
		.limit(1);

	if (!loginState) return { ok: false as const, reason: 'state_not_found' };
	if (loginState.usedAt) return { ok: false as const, reason: 'state_already_used' };
	if (loginState.expiresAt.getTime() < Date.now())
		return { ok: false as const, reason: 'state_expired' };

	await db
		.update(table.ltiLoginState)
		.set({ usedAt: new Date() })
		.where(and(eq(table.ltiLoginState.id, loginState.id), isNull(table.ltiLoginState.usedAt)));

	return { ok: true as const, loginState };
}

export async function findUserIdentity(platformId: string, deploymentId: string, sub: string) {
	const [identity] = await db
		.select()
		.from(table.ltiUserIdentity)
		.where(
			and(
				eq(table.ltiUserIdentity.platformId, platformId),
				eq(table.ltiUserIdentity.deploymentId, deploymentId),
				eq(table.ltiUserIdentity.sub, sub)
			)
		)
		.limit(1);

	return identity ?? null;
}

export async function upsertUserIdentity(input: {
	platformId: string;
	deploymentId: string;
	sub: string;
	userId: string;
	email?: string | null;
	name?: string | null;
	roles?: string[];
}) {
	const now = new Date();
	const existing = await findUserIdentity(input.platformId, input.deploymentId, input.sub);

	if (existing) {
		await db
			.update(table.ltiUserIdentity)
			.set({
				userId: input.userId,
				email: input.email ?? existing.email,
				name: input.name ?? existing.name,
				rolesJson: input.roles ? JSON.stringify(input.roles) : existing.rolesJson,
				updatedAt: now,
				lastLaunchAt: now
			})
			.where(eq(table.ltiUserIdentity.id, existing.id));
		return { ...existing, userId: input.userId, lastLaunchAt: now };
	}

	const identity: typeof table.ltiUserIdentity.$inferInsert = {
		id: nanoid(),
		platformId: input.platformId,
		deploymentId: input.deploymentId,
		sub: input.sub,
		userId: input.userId,
		email: input.email ?? null,
		name: input.name ?? null,
		rolesJson: input.roles ? JSON.stringify(input.roles) : null,
		createdAt: now,
		updatedAt: now,
		lastLaunchAt: now
	};

	await db.insert(table.ltiUserIdentity).values(identity);
	return identity as table.LtiUserIdentity;
}

export async function findResourceLink(input: {
	platformId: string;
	deploymentId: string;
	contextId: string;
	resourceLinkId: string;
}) {
	const [link] = await db
		.select()
		.from(table.ltiResourceLink)
		.where(
			and(
				eq(table.ltiResourceLink.platformId, input.platformId),
				eq(table.ltiResourceLink.deploymentId, input.deploymentId),
				eq(table.ltiResourceLink.contextId, input.contextId),
				eq(table.ltiResourceLink.resourceLinkId, input.resourceLinkId)
			)
		)
		.limit(1);

	return link ?? null;
}

export async function upsertResourceLinkFromLaunch(input: {
	platformId: string;
	deploymentId: string;
	contextId: string;
	resourceLinkId: string;
	courseId: string;
	activityId: string;
	title?: string | null;
	agsEndpoint?: LtiAgsEndpointClaim;
	custom?: Record<string, string>;
	metadata?: Record<string, unknown>;
}) {
	const now = new Date();
	const existing = await findResourceLink(input);
	const agsEndpoint = input.agsEndpoint;
	const values = {
		courseId: input.courseId,
		activityId: input.activityId,
		title: input.title ?? null,
		lineItemUrl: agsEndpoint?.lineitem ?? null,
		lineItemsUrl: agsEndpoint?.lineitems ?? null,
		agsScope: agsEndpoint?.scope?.join(' ') ?? null,
		customJson: input.custom ? JSON.stringify(input.custom) : null,
		metadataJson: input.metadata ? JSON.stringify(input.metadata) : null,
		updatedAt: now
	};

	if (existing) {
		await db
			.update(table.ltiResourceLink)
			.set(values)
			.where(eq(table.ltiResourceLink.id, existing.id));
		return { ...existing, ...values };
	}

	const link: typeof table.ltiResourceLink.$inferInsert = {
		id: nanoid(),
		platformId: input.platformId,
		deploymentId: input.deploymentId,
		resourceLinkId: input.resourceLinkId,
		contextId: input.contextId,
		createdAt: now,
		...values
	};

	await db.insert(table.ltiResourceLink).values(link);
	return link as table.LtiResourceLink;
}

export async function createDeepLinkSession(input: {
	platformId: string;
	deploymentId: string;
	teacherUserId?: string | null;
	contextId?: string | null;
	deepLinkReturnUrl: string;
	data?: string | null;
	settings?: table.LtiDeepLinkSettings | null;
	launchClaims?: LtiLaunchClaims;
}) {
	const now = new Date();
	const session: typeof table.ltiDeepLinkSession.$inferInsert = {
		id: nanoid(32),
		platformId: input.platformId,
		deploymentId: input.deploymentId,
		teacherUserId: input.teacherUserId ?? null,
		contextId: input.contextId ?? null,
		deepLinkReturnUrl: input.deepLinkReturnUrl,
		data: input.data ?? null,
		settings: input.settings ?? null,
		launchClaimsJson: input.launchClaims ? JSON.stringify(input.launchClaims) : null,
		expiresAt: new Date(now.getTime() + 30 * 60 * 1000),
		createdAt: now
	};

	await db.insert(table.ltiDeepLinkSession).values(session);
	return session as table.LtiDeepLinkSession;
}

export async function getDeepLinkSession(id: string) {
	const [session] = await db
		.select()
		.from(table.ltiDeepLinkSession)
		.where(eq(table.ltiDeepLinkSession.id, id))
		.limit(1);

	return session ?? null;
}

export async function markDeepLinkSessionUsed(id: string) {
	await db
		.update(table.ltiDeepLinkSession)
		.set({ usedAt: new Date() })
		.where(eq(table.ltiDeepLinkSession.id, id));
}

export async function recordLaunch(input: {
	platformId: string;
	deploymentId: string;
	resourceLinkDbId?: string | null;
	userIdentityId?: string | null;
	userId?: string | null;
	ltiSub: string;
	messageType: string;
	roles?: string[];
	contextId?: string | null;
	resourceLinkId?: string | null;
	claims?: LtiLaunchClaims;
	ipAddress?: string | null;
	userAgent?: string | null;
}) {
	const launch: typeof table.ltiLaunch.$inferInsert = {
		id: nanoid(),
		platformId: input.platformId,
		deploymentId: input.deploymentId,
		resourceLinkDbId: input.resourceLinkDbId ?? null,
		userIdentityId: input.userIdentityId ?? null,
		userId: input.userId ?? null,
		ltiSub: input.ltiSub,
		messageType: input.messageType as table.LtiLaunchMessageType,
		rolesJson: input.roles ? JSON.stringify(input.roles) : null,
		contextId: input.contextId ?? null,
		resourceLinkId: input.resourceLinkId ?? null,
		claimsJson: input.claims ? JSON.stringify(input.claims) : null,
		ipAddress: input.ipAddress ?? null,
		userAgent: input.userAgent ?? null,
		createdAt: new Date()
	};

	await db.insert(table.ltiLaunch).values(launch);
	return launch as table.LtiLaunch;
}

export async function getResourceLinksForCourse(courseId: string) {
	return db
		.select({
			link: table.ltiResourceLink,
			platform: table.ltiPlatformRegistration,
			deployment: table.ltiDeployment,
			activity: table.interactiveLearning
		})
		.from(table.ltiResourceLink)
		.innerJoin(
			table.ltiPlatformRegistration,
			eq(table.ltiResourceLink.platformId, table.ltiPlatformRegistration.id)
		)
		.innerJoin(table.ltiDeployment, eq(table.ltiResourceLink.deploymentId, table.ltiDeployment.id))
		.innerJoin(
			table.interactiveLearning,
			eq(table.ltiResourceLink.activityId, table.interactiveLearning.id)
		)
		.where(eq(table.ltiResourceLink.courseId, courseId))
		.orderBy(desc(table.ltiResourceLink.updatedAt));
}

export async function getGradeSyncLogsForCourse(courseId: string, limit = 50) {
	return db
		.select()
		.from(table.ltiGradeSyncLog)
		.where(eq(table.ltiGradeSyncLog.courseId, courseId))
		.orderBy(desc(table.ltiGradeSyncLog.createdAt))
		.limit(limit);
}

export function extractResourceLinkFields(claims: LtiLaunchClaims) {
	const agsEndpoint = claims[LTI_CLAIMS.AGS_ENDPOINT];
	return {
		lineItemUrl: agsEndpoint?.lineitem ?? null,
		lineItemsUrl: agsEndpoint?.lineitems ?? null,
		agsScope: agsEndpoint?.scope?.join(' ') ?? null,
		hasScoreScope: agsEndpoint?.scope?.includes(LTI_SCORE_SCOPE) ?? false
	};
}
