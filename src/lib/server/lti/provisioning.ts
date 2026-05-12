import { and, eq } from 'drizzle-orm';
import { nanoid } from 'nanoid';
import { hash } from '@node-rs/argon2';
import { db } from '$lib/server/db';
import * as table from '$lib/server/db/schema';
import { ROLE_NAMES } from '$lib/server/roles';
import type { LtiLaunchClaims } from './claims';
import { LTI_CLAIMS } from './claims';
import { findUserIdentity, upsertUserIdentity } from './store';

function sanitizeEmailLocalPart(value: string): string {
	return (
		value
			.toLowerCase()
			.replace(/[^a-z0-9._-]+/g, '-')
			.replace(/^-+|-+$/g, '') || 'user'
	);
}

export function getProvisioningEmail(claims: LtiLaunchClaims, deploymentId: string): string {
	if (claims.email) return claims.email.trim().toLowerCase();
	return `${sanitizeEmailLocalPart(deploymentId)}-${sanitizeEmailLocalPart(claims.sub)}@lti.invalid`;
}

export function getProvisioningName(claims: LtiLaunchClaims): string {
	return (
		claims.name ||
		[claims.given_name, claims.family_name].filter(Boolean).join(' ') ||
		'LTI learner'
	);
}

async function createLtiUser(claims: LtiLaunchClaims, deploymentId: string) {
	const randomPassword = crypto.getRandomValues(new Uint8Array(32));
	const passwordHash = await hash(Buffer.from(randomPassword).toString('base64'), {
		memoryCost: 65536,
		timeCost: 3,
		parallelism: 4,
		outputLen: 32
	});
	const now = new Date();
	const email = getProvisioningEmail(claims, deploymentId);
	const displayName = getProvisioningName(claims);
	const userId = nanoid();

	await db.insert(table.user).values({
		id: userId,
		email,
		username: displayName,
		displayName,
		alias: claims.given_name ?? displayName,
		image: claims.picture ?? null,
		passwordHash,
		emailVerified: Boolean(claims.email),
		status: table.userStatus.ACTIVE,
		metadata: {
			custom: {
				ltiProvisioned: true,
				ltiEmailSynthetic: !claims.email
			}
		},
		createdAt: now,
		updatedAt: now
	});

	return userId;
}

async function findOrCreateUserForLearner(claims: LtiLaunchClaims, deploymentId: string) {
	const email = getProvisioningEmail(claims, deploymentId);
	const [existing] = await db.select().from(table.user).where(eq(table.user.email, email)).limit(1);
	if (existing) return existing.id;
	return createLtiUser(claims, deploymentId);
}

export async function ensureSystemStudentRole(userId: string) {
	const [studentRole] = await db
		.select()
		.from(table.role)
		.where(and(eq(table.role.name, ROLE_NAMES.STUDENT), eq(table.role.isActive, true)))
		.limit(1);

	if (!studentRole) return;

	const [existing] = await db
		.select()
		.from(table.userRoleAssignment)
		.where(
			and(
				eq(table.userRoleAssignment.userId, userId),
				eq(table.userRoleAssignment.roleId, studentRole.id),
				eq(table.userRoleAssignment.isActive, true)
			)
		)
		.limit(1);

	if (existing) return;

	await db.insert(table.userRoleAssignment).values({
		id: `ur_${nanoid()}`,
		userId,
		roleId: studentRole.id,
		assignedBy: null,
		assignedAt: new Date(),
		reason: 'LTI learner provisioning',
		isActive: true
	});
}

export async function ensureCourseStudentRole(userId: string, courseId: string) {
	const [existing] = await db
		.select()
		.from(table.courseRole)
		.where(
			and(
				eq(table.courseRole.userId, userId),
				eq(table.courseRole.courseId, courseId),
				eq(table.courseRole.role, table.courseRoleType.STUDENT),
				eq(table.courseRole.isActive, true)
			)
		)
		.limit(1);

	if (existing) return;

	await db.insert(table.courseRole).values({
		id: nanoid(),
		userId,
		courseId,
		role: table.courseRoleType.STUDENT,
		assignedBy: null,
		assignedAt: new Date(),
		isActive: true
	});
}

export async function provisionLearner(input: {
	platformId: string;
	deploymentDbId: string;
	deploymentId: string;
	claims: LtiLaunchClaims;
	courseId: string;
}) {
	const existingIdentity = await findUserIdentity(
		input.platformId,
		input.deploymentDbId,
		input.claims.sub
	);
	const userId =
		existingIdentity?.userId ??
		(await findOrCreateUserForLearner(input.claims, input.deploymentId));

	await ensureSystemStudentRole(userId);
	await ensureCourseStudentRole(userId, input.courseId);

	return upsertUserIdentity({
		platformId: input.platformId,
		deploymentId: input.deploymentDbId,
		sub: input.claims.sub,
		userId,
		email: getProvisioningEmail(input.claims, input.deploymentId),
		name: getProvisioningName(input.claims),
		roles: input.claims[LTI_CLAIMS.ROLES] ?? []
	});
}

export async function getLinkedInstructorIdentity(input: {
	platformId: string;
	deploymentDbId: string;
	sub: string;
}) {
	return findUserIdentity(input.platformId, input.deploymentDbId, input.sub);
}
