import { SignJWT } from 'jose';
import { and, desc, eq } from 'drizzle-orm';
import { nanoid } from 'nanoid';
import { db } from '$lib/server/db';
import * as table from '$lib/server/db/schema';
import { LTI_SCORE_SCOPE, isLtiEnabled } from './config';
import { getActiveSigningKey } from './keys';

export type AgsScorePayload = {
	userId: string;
	activityProgress: 'Initialized' | 'Started' | 'InProgress' | 'Submitted' | 'Completed';
	gradingProgress: 'NotReady' | 'Failed' | 'Pending' | 'PendingManual' | 'FullyGraded';
	scoreGiven: number;
	scoreMaximum: number;
	timestamp: string;
	comment?: string;
};

export function buildAgsScorePayload(input: {
	ltiUserId: string;
	scoreNormalized?: number | null;
	completedAt?: Date | null;
	now?: Date;
}): AgsScorePayload {
	const timestamp = input.completedAt ?? input.now ?? new Date();
	return {
		userId: input.ltiUserId,
		activityProgress: 'Completed',
		gradingProgress: 'FullyGraded',
		scoreGiven: input.scoreNormalized ?? 100,
		scoreMaximum: 100,
		timestamp: timestamp.toISOString()
	};
}

async function logGradeSync(input: {
	status: table.LtiGradeSyncStatus;
	platformId?: string | null;
	deploymentId?: string | null;
	resourceLinkDbId?: string | null;
	userIdentityId?: string | null;
	progressId?: string | null;
	courseId: string;
	activityId: string;
	userId: string;
	lineItemUrl?: string | null;
	httpStatus?: number | null;
	payload?: unknown;
	responseBody?: string | null;
	errorMessage?: string | null;
}) {
	const now = new Date();
	await db.insert(table.ltiGradeSyncLog).values({
		id: nanoid(),
		status: input.status,
		platformId: input.platformId ?? null,
		deploymentId: input.deploymentId ?? null,
		resourceLinkDbId: input.resourceLinkDbId ?? null,
		userIdentityId: input.userIdentityId ?? null,
		progressId: input.progressId ?? null,
		courseId: input.courseId,
		activityId: input.activityId,
		userId: input.userId,
		lineItemUrl: input.lineItemUrl ?? null,
		httpStatus: input.httpStatus ?? null,
		payloadJson: input.payload ? JSON.stringify(input.payload) : null,
		responseBody: input.responseBody ?? null,
		errorMessage: input.errorMessage ?? null,
		createdAt: now,
		updatedAt: now
	});
}

async function findSyncTarget(input: { userId: string; courseId: string; activityId: string }) {
	const [target] = await db
		.select({
			platform: table.ltiPlatformRegistration,
			deployment: table.ltiDeployment,
			resourceLink: table.ltiResourceLink,
			identity: table.ltiUserIdentity
		})
		.from(table.ltiResourceLink)
		.innerJoin(
			table.ltiPlatformRegistration,
			eq(table.ltiResourceLink.platformId, table.ltiPlatformRegistration.id)
		)
		.innerJoin(table.ltiDeployment, eq(table.ltiResourceLink.deploymentId, table.ltiDeployment.id))
		.innerJoin(
			table.ltiUserIdentity,
			and(
				eq(table.ltiUserIdentity.platformId, table.ltiResourceLink.platformId),
				eq(table.ltiUserIdentity.deploymentId, table.ltiResourceLink.deploymentId),
				eq(table.ltiUserIdentity.userId, input.userId)
			)
		)
		.where(
			and(
				eq(table.ltiResourceLink.courseId, input.courseId),
				eq(table.ltiResourceLink.activityId, input.activityId),
				eq(table.ltiPlatformRegistration.status, table.ltiRegistrationStatus.ACTIVE),
				eq(table.ltiDeployment.status, table.ltiDeploymentStatus.ACTIVE)
			)
		)
		.orderBy(desc(table.ltiResourceLink.updatedAt))
		.limit(1);

	return target ?? null;
}

async function createPlatformAccessToken(platform: table.LtiPlatformRegistration) {
	const signingKey = await getActiveSigningKey();
	const assertion = await new SignJWT({})
		.setProtectedHeader({ alg: signingKey.algorithm, kid: signingKey.kid, typ: 'JWT' })
		.setIssuer(platform.clientId)
		.setSubject(platform.clientId)
		.setAudience(platform.tokenUrl)
		.setJti(nanoid())
		.setIssuedAt()
		.setExpirationTime('5m')
		.sign(signingKey.key);

	const form = new URLSearchParams({
		grant_type: 'client_credentials',
		client_assertion_type: 'urn:ietf:params:oauth:client-assertion-type:jwt-bearer',
		client_assertion: assertion,
		scope: LTI_SCORE_SCOPE
	});

	const response = await fetch(platform.tokenUrl, {
		method: 'POST',
		headers: {
			'content-type': 'application/x-www-form-urlencoded'
		},
		body: form
	});

	const body = await response.text();
	if (!response.ok) {
		throw new Error(`Token endpoint responded ${response.status}: ${body.slice(0, 500)}`);
	}

	const parsed = JSON.parse(body) as { access_token?: string };
	if (!parsed.access_token) {
		throw new Error('Token endpoint did not return access_token');
	}

	return parsed.access_token;
}

export async function syncForProgress(input: {
	userId: string;
	courseId: string;
	activityId: string;
	progressId?: string | null;
	scoreNormalized?: number | null;
	completedAt?: Date | null;
}) {
	if (!isLtiEnabled()) {
		return { status: 'disabled' as const };
	}

	const target = await findSyncTarget(input);

	if (!target) {
		await logGradeSync({
			status: table.ltiGradeSyncStatus.NOOP,
			courseId: input.courseId,
			activityId: input.activityId,
			userId: input.userId,
			progressId: input.progressId ?? null,
			errorMessage: 'No LTI resource link and user identity found for this progress record.'
		});
		return { status: 'noop' as const };
	}

	const scopeText = target.resourceLink.agsScope ?? '';
	if (!target.resourceLink.lineItemUrl || !scopeText.includes(LTI_SCORE_SCOPE)) {
		await logGradeSync({
			status: table.ltiGradeSyncStatus.NOOP,
			platformId: target.platform.id,
			deploymentId: target.deployment.id,
			resourceLinkDbId: target.resourceLink.id,
			userIdentityId: target.identity.id,
			courseId: input.courseId,
			activityId: input.activityId,
			userId: input.userId,
			progressId: input.progressId ?? null,
			lineItemUrl: target.resourceLink.lineItemUrl,
			errorMessage: 'LTI resource link has no AGS line item or score scope.'
		});
		return { status: 'noop' as const };
	}

	const payload = buildAgsScorePayload({
		ltiUserId: target.identity.sub,
		scoreNormalized: input.scoreNormalized,
		completedAt: input.completedAt
	});

	try {
		const accessToken = await createPlatformAccessToken(target.platform);
		const response = await fetch(`${target.resourceLink.lineItemUrl}/scores`, {
			method: 'POST',
			headers: {
				authorization: `Bearer ${accessToken}`,
				'content-type': 'application/vnd.ims.lis.v1.score+json'
			},
			body: JSON.stringify(payload)
		});
		const responseBody = await response.text();

		await logGradeSync({
			status: response.ok ? table.ltiGradeSyncStatus.SUCCESS : table.ltiGradeSyncStatus.ERROR,
			platformId: target.platform.id,
			deploymentId: target.deployment.id,
			resourceLinkDbId: target.resourceLink.id,
			userIdentityId: target.identity.id,
			courseId: input.courseId,
			activityId: input.activityId,
			userId: input.userId,
			progressId: input.progressId ?? null,
			lineItemUrl: target.resourceLink.lineItemUrl,
			httpStatus: response.status,
			payload,
			responseBody,
			errorMessage: response.ok ? null : responseBody.slice(0, 500)
		});

		return {
			status: response.ok ? ('success' as const) : ('error' as const),
			httpStatus: response.status
		};
	} catch (error) {
		await logGradeSync({
			status: table.ltiGradeSyncStatus.ERROR,
			platformId: target.platform.id,
			deploymentId: target.deployment.id,
			resourceLinkDbId: target.resourceLink.id,
			userIdentityId: target.identity.id,
			courseId: input.courseId,
			activityId: input.activityId,
			userId: input.userId,
			progressId: input.progressId ?? null,
			lineItemUrl: target.resourceLink.lineItemUrl,
			payload,
			errorMessage: error instanceof Error ? error.message : String(error)
		});

		return { status: 'error' as const };
	}
}
