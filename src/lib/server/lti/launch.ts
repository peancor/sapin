import { createRemoteJWKSet, jwtVerify } from 'jose';
import { error, redirect, type RequestEvent } from '@sveltejs/kit';
import { and, eq } from 'drizzle-orm';
import * as auth from '$lib/server/auth';
import { db } from '$lib/server/db';
import * as table from '$lib/server/db/schema';
import {
	LTI_CLAIMS,
	LTI_MESSAGE_TYPES,
	classifyLtiRoles,
	getLtiContextId,
	getLtiCustom,
	getLtiDeploymentId,
	getLtiMessageType,
	getLtiResourceLinkId,
	getLtiTargetLinkUri,
	hasAgsScoreScope,
	ltiAudiencesInclude,
	type LtiLaunchClaims
} from './claims';
import { LTI_SCORE_SCOPE, buildToolUrl, isLtiEnabled } from './config';
import {
	consumeLoginState,
	createDeepLinkSession,
	createLoginState,
	findActiveDeployment,
	findActivePlatform,
	findPlatformByIssuer,
	getDeepLinkSession,
	recordLaunch,
	upsertResourceLinkFromLaunch,
	upsertUserIdentity
} from './store';
import { getLinkedInstructorIdentity, provisionLearner } from './provisioning';
import { getActivityForLti, startLtiActivity } from './runtime';

function assertLtiEnabled() {
	if (!isLtiEnabled()) {
		error(404, 'LTI no está habilitado en esta instancia.');
	}
}

function normalizeUrlForComparison(value: string): string {
	const url = new URL(value);
	return `${url.origin}${url.pathname}`;
}

function assertTargetLinkUri(expected: string, actual: string | undefined) {
	if (!actual || normalizeUrlForComparison(expected) !== normalizeUrlForComparison(actual)) {
		error(400, 'El target_link_uri del launch LTI no coincide con el login iniciado.');
	}
}

async function createSapinSession(event: RequestEvent, userId: string) {
	const sessionToken = auth.generateSessionToken();
	const session = await auth.createSession(sessionToken, userId);
	auth.setSessionTokenCookie(event, sessionToken, session.expiresAt);
}

export async function redirectToPlatformLogin(event: RequestEvent) {
	assertLtiEnabled();

	const issuer = event.url.searchParams.get('iss');
	const loginHint = event.url.searchParams.get('login_hint');
	const targetLinkUri =
		event.url.searchParams.get('target_link_uri') ?? buildToolUrl(event.url, '/lti/launch');
	const messageHint = event.url.searchParams.get('lti_message_hint');
	const clientId = event.url.searchParams.get('client_id');
	const deploymentHint = event.url.searchParams.get('lti_deployment_id');

	if (!issuer || !loginHint) {
		error(400, 'Faltan parámetros OIDC login requeridos: iss y login_hint.');
	}

	const platform = clientId
		? await findActivePlatform(issuer, clientId)
		: await findPlatformByIssuer(issuer);

	if (!platform) {
		error(400, 'La plataforma LTI no está registrada o está deshabilitada.');
	}

	const deployment = deploymentHint
		? await findActiveDeployment(platform.id, deploymentHint)
		: null;
	const loginState = await createLoginState({
		platformId: platform.id,
		deploymentId: deployment?.id ?? null,
		targetLinkUri,
		loginHint,
		messageHint,
		clientId: platform.clientId
	});

	const redirectUrl = new URL(platform.authLoginUrl);
	redirectUrl.searchParams.set('scope', 'openid');
	redirectUrl.searchParams.set('response_type', 'id_token');
	redirectUrl.searchParams.set('response_mode', 'form_post');
	redirectUrl.searchParams.set('prompt', 'none');
	redirectUrl.searchParams.set('client_id', platform.clientId);
	redirectUrl.searchParams.set('redirect_uri', buildToolUrl(event.url, '/lti/launch'));
	redirectUrl.searchParams.set('login_hint', loginHint);
	redirectUrl.searchParams.set('state', loginState.state);
	redirectUrl.searchParams.set('nonce', loginState.nonce);
	if (messageHint) redirectUrl.searchParams.set('lti_message_hint', messageHint);

	redirect(302, redirectUrl.toString());
}

async function validateLaunchToken(idToken: string, state: string) {
	const consumedState = await consumeLoginState(state);
	if (!consumedState.ok) {
		error(400, `Launch LTI rechazado: ${consumedState.reason}.`);
	}

	const loginState = consumedState.loginState;
	const platform = await findActivePlatformById(loginState.platformId);
	if (!platform) error(400, 'La plataforma LTI ya no está activa.');

	const jwks = createRemoteJWKSet(new URL(platform.jwksUrl));
	const { payload } = await jwtVerify(idToken, jwks, {
		issuer: platform.issuer,
		audience: platform.clientId
	});
	const claims = payload as unknown as LtiLaunchClaims;

	if (!ltiAudiencesInclude(claims.aud, platform.clientId)) {
		error(400, 'El audience del id_token LTI no coincide con el client_id registrado.');
	}
	if (claims.nonce !== loginState.nonce) {
		error(400, 'Nonce LTI inválido o reutilizado.');
	}
	assertTargetLinkUri(loginState.targetLinkUri, getLtiTargetLinkUri(claims));

	const deploymentId = getLtiDeploymentId(claims);
	if (!deploymentId) error(400, 'El launch LTI no incluye deployment_id.');
	const deployment = await findActiveDeployment(platform.id, deploymentId);
	if (!deployment) error(400, 'El deployment LTI no está registrado o activo.');

	return { platform, deployment, loginState, claims };
}

async function findActivePlatformById(platformId: string) {
	const [platform] = await db
		.select()
		.from(table.ltiPlatformRegistration)
		.where(
			and(
				eq(table.ltiPlatformRegistration.id, platformId),
				eq(table.ltiPlatformRegistration.status, table.ltiRegistrationStatus.ACTIVE)
			)
		)
		.limit(1);
	return platform ?? null;
}

async function userHasAssistantCourseAccess(userId: string, courseId: string) {
	const [role] = await db
		.select()
		.from(table.courseRole)
		.where(
			and(
				eq(table.courseRole.userId, userId),
				eq(table.courseRole.courseId, courseId),
				eq(table.courseRole.isActive, true)
			)
		)
		.limit(1);

	if (!role) return false;
	return ['owner', 'admin', 'teacher', 'assistant'].includes(role.role);
}

async function handleDeepLinkingRequest(input: {
	event: RequestEvent;
	platform: table.LtiPlatformRegistration;
	deployment: table.LtiDeployment;
	claims: LtiLaunchClaims;
}) {
	const roles = input.claims[LTI_CLAIMS.ROLES] ?? [];
	const roleKind = classifyLtiRoles(roles);
	if (roleKind === 'learner') {
		error(403, 'El selector Deep Linking solo está disponible para docentes.');
	}

	let teacherUserId = input.event.locals.user?.id ?? null;
	if (!teacherUserId) {
		const identity = await getLinkedInstructorIdentity({
			platformId: input.platform.id,
			deploymentDbId: input.deployment.id,
			sub: input.claims.sub
		});
		teacherUserId = identity?.userId ?? null;
	}

	if (!teacherUserId) {
		redirect(303, '/lti/error?reason=teacher-link-required');
	}

	await upsertUserIdentity({
		platformId: input.platform.id,
		deploymentId: input.deployment.id,
		sub: input.claims.sub,
		userId: teacherUserId,
		email: input.claims.email ?? null,
		name: input.claims.name ?? null,
		roles
	});

	const settings = input.claims[LTI_CLAIMS.DEEP_LINKING_SETTINGS];
	if (!settings?.deep_link_return_url) {
		error(400, 'El launch Deep Linking no incluye deep_link_return_url.');
	}

	const session = await createDeepLinkSession({
		platformId: input.platform.id,
		deploymentId: input.deployment.id,
		teacherUserId,
		contextId: getLtiContextId(input.claims) ?? null,
		deepLinkReturnUrl: settings.deep_link_return_url,
		data: settings.data ?? null,
		settings: {
			acceptTypes: settings.accept_types,
			acceptPresentationDocumentTargets: settings.accept_presentation_document_targets,
			acceptMultiple: settings.accept_multiple,
			autoCreate: settings.auto_create,
			data: settings.data,
			deepLinkReturnUrl: settings.deep_link_return_url
		},
		launchClaims: input.claims
	});

	await recordLaunch({
		platformId: input.platform.id,
		deploymentId: input.deployment.id,
		ltiSub: input.claims.sub,
		userId: teacherUserId,
		messageType: LTI_MESSAGE_TYPES.DEEP_LINKING_REQUEST,
		roles,
		contextId: getLtiContextId(input.claims) ?? null,
		claims: input.claims,
		ipAddress: input.event.getClientAddress(),
		userAgent: input.event.request.headers.get('user-agent')
	});

	redirect(303, `/lti/deep-link/select?session=${session.id}`);
}

async function resolveResourceLaunch(input: {
	event: RequestEvent;
	platform: table.LtiPlatformRegistration;
	deployment: table.LtiDeployment;
	claims: LtiLaunchClaims;
}) {
	const contextId = getLtiContextId(input.claims);
	const resourceLinkId = getLtiResourceLinkId(input.claims);
	if (!contextId || !resourceLinkId) {
		error(400, 'El launch LTI no incluye context.id o resource_link.id.');
	}

	const custom = getLtiCustom(input.claims);
	const courseId = custom.sapin_course_id;
	const activityId = custom.sapin_activity_id;
	if (!courseId || !activityId) {
		error(400, 'El enlace LTI no incluye sapin_course_id y sapin_activity_id.');
	}

	const activity = await getActivityForLti(courseId, activityId);
	const agsEndpoint = input.claims[LTI_CLAIMS.AGS_ENDPOINT];
	const resourceLink = await upsertResourceLinkFromLaunch({
		platformId: input.platform.id,
		deploymentId: input.deployment.id,
		contextId,
		resourceLinkId,
		courseId,
		activityId,
		title: input.claims[LTI_CLAIMS.RESOURCE_LINK]?.title ?? activity.name,
		agsEndpoint,
		custom,
		metadata: {
			hasAgsScoreScope: hasAgsScoreScope(agsEndpoint, LTI_SCORE_SCOPE)
		}
	});

	const roles = input.claims[LTI_CLAIMS.ROLES] ?? [];
	const roleKind = classifyLtiRoles(roles);
	let identity: table.LtiUserIdentity | null = null;
	let userId: string | null = null;

	if (roleKind === 'learner') {
		identity = await provisionLearner({
			platformId: input.platform.id,
			deploymentDbId: input.deployment.id,
			deploymentId: input.deployment.deploymentId,
			claims: input.claims,
			courseId
		});
		userId = identity.userId;
		await createSapinSession(input.event, userId);
	} else {
		identity = await getLinkedInstructorIdentity({
			platformId: input.platform.id,
			deploymentDbId: input.deployment.id,
			sub: input.claims.sub
		});
		userId = identity?.userId ?? input.event.locals.user?.id ?? null;
		if (!userId) redirect(303, '/lti/error?reason=teacher-link-required');
		if (!(await userHasAssistantCourseAccess(userId, courseId))) {
			redirect(303, '/lti/error?reason=teacher-course-permission');
		}
		await upsertUserIdentity({
			platformId: input.platform.id,
			deploymentId: input.deployment.id,
			sub: input.claims.sub,
			userId,
			email: input.claims.email ?? null,
			name: input.claims.name ?? null,
			roles
		});
		await createSapinSession(input.event, userId);
	}

	await recordLaunch({
		platformId: input.platform.id,
		deploymentId: input.deployment.id,
		resourceLinkDbId: resourceLink.id,
		userIdentityId: identity?.id ?? null,
		userId,
		ltiSub: input.claims.sub,
		messageType: LTI_MESSAGE_TYPES.RESOURCE_LINK_REQUEST,
		roles,
		contextId,
		resourceLinkId,
		claims: input.claims,
		ipAddress: input.event.getClientAddress(),
		userAgent: input.event.request.headers.get('user-agent')
	});

	if (roleKind === 'learner') {
		const targetPath = await startLtiActivity({
			userId: userId!,
			courseId,
			activityId,
			activityType: activity.type
		});
		redirect(303, targetPath);
	}

	redirect(303, `/course/${courseId}/admin/interactives/${activityId}`);
}

export async function handleLaunchPost(event: RequestEvent) {
	assertLtiEnabled();

	const form = await event.request.formData();
	const idToken = form.get('id_token');
	const state = form.get('state');
	if (typeof idToken !== 'string' || typeof state !== 'string') {
		error(400, 'Faltan id_token o state en el launch LTI.');
	}

	const { platform, deployment, claims } = await validateLaunchToken(idToken, state);
	const messageType = getLtiMessageType(claims);

	if (messageType === LTI_MESSAGE_TYPES.DEEP_LINKING_REQUEST) {
		await handleDeepLinkingRequest({ event, platform, deployment, claims });
		return;
	}

	if (messageType === LTI_MESSAGE_TYPES.RESOURCE_LINK_REQUEST) {
		await resolveResourceLaunch({ event, platform, deployment, claims });
		return;
	}

	error(400, `Tipo de mensaje LTI no soportado: ${messageType ?? 'unknown'}.`);
}

export async function requireValidDeepLinkSession(sessionId: string) {
	const session = await getDeepLinkSession(sessionId);
	if (!session || session.usedAt || session.expiresAt.getTime() < Date.now()) {
		error(404, 'La sesión Deep Linking no existe o ha expirado.');
	}
	return session;
}
