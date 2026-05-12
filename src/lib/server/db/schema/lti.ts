import { index, integer, sqliteTable, text, uniqueIndex } from 'drizzle-orm/sqlite-core';
import { user } from './users';
import { course } from './courses';
import { interactiveLearning } from './interactive';
import { learningActivityProgress } from './progress';

export const ltiRegistrationStatus = {
	ACTIVE: 'active',
	PAUSED: 'paused',
	DISABLED: 'disabled'
} as const;

export type LtiRegistrationStatus =
	(typeof ltiRegistrationStatus)[keyof typeof ltiRegistrationStatus];

export const ltiDeploymentStatus = {
	ACTIVE: 'active',
	PAUSED: 'paused',
	DISABLED: 'disabled'
} as const;

export type LtiDeploymentStatus = (typeof ltiDeploymentStatus)[keyof typeof ltiDeploymentStatus];

export const ltiToolKeyStatus = {
	ACTIVE: 'active',
	RETIRED: 'retired'
} as const;

export type LtiToolKeyStatus = (typeof ltiToolKeyStatus)[keyof typeof ltiToolKeyStatus];

export const ltiLaunchMessageType = {
	RESOURCE_LINK_REQUEST: 'LtiResourceLinkRequest',
	DEEP_LINKING_REQUEST: 'LtiDeepLinkingRequest'
} as const;

export type LtiLaunchMessageType = (typeof ltiLaunchMessageType)[keyof typeof ltiLaunchMessageType];

export const ltiGradeSyncStatus = {
	NOOP: 'noop',
	PENDING: 'pending',
	SUCCESS: 'success',
	ERROR: 'error'
} as const;

export type LtiGradeSyncStatus = (typeof ltiGradeSyncStatus)[keyof typeof ltiGradeSyncStatus];

export type LtiPlatformSettings = {
	defaultScopes?: string[];
	notes?: string;
};

export type LtiDeepLinkSettings = {
	acceptTypes?: string[];
	acceptPresentationDocumentTargets?: string[];
	acceptMultiple?: boolean;
	autoCreate?: boolean;
	data?: string;
	deepLinkReturnUrl?: string;
};

export const ltiPlatformRegistration = sqliteTable(
	'lti_platform_registration',
	{
		id: text('id').primaryKey(),
		name: text('name').notNull(),
		issuer: text('issuer').notNull(),
		clientId: text('client_id').notNull(),
		authLoginUrl: text('auth_login_url').notNull(),
		tokenUrl: text('token_url').notNull(),
		jwksUrl: text('jwks_url').notNull(),
		status: text('status')
			.$type<LtiRegistrationStatus>()
			.notNull()
			.default(ltiRegistrationStatus.ACTIVE),
		settings: text('settings', { mode: 'json' }).$type<LtiPlatformSettings>(),
		createdAt: integer('created_at', { mode: 'timestamp' }).notNull(),
		updatedAt: integer('updated_at', { mode: 'timestamp' }).notNull()
	},
	(table) => [
		uniqueIndex('lti_platform_issuer_client_idx').on(table.issuer, table.clientId),
		index('lti_platform_status_idx').on(table.status)
	]
);

export const ltiDeployment = sqliteTable(
	'lti_deployment',
	{
		id: text('id').primaryKey(),
		platformId: text('platform_id')
			.notNull()
			.references(() => ltiPlatformRegistration.id, { onDelete: 'cascade' }),
		deploymentId: text('deployment_id').notNull(),
		name: text('name').notNull(),
		status: text('status')
			.$type<LtiDeploymentStatus>()
			.notNull()
			.default(ltiDeploymentStatus.ACTIVE),
		createdAt: integer('created_at', { mode: 'timestamp' }).notNull(),
		updatedAt: integer('updated_at', { mode: 'timestamp' }).notNull()
	},
	(table) => [
		uniqueIndex('lti_deployment_platform_deployment_idx').on(table.platformId, table.deploymentId),
		index('lti_deployment_status_idx').on(table.status)
	]
);

export const ltiToolKey = sqliteTable(
	'lti_tool_key',
	{
		id: text('id').primaryKey(),
		kid: text('kid').notNull().unique(),
		publicJwk: text('public_jwk', { mode: 'json' }).$type<Record<string, unknown>>().notNull(),
		privateJwk: text('private_jwk', { mode: 'json' }).$type<Record<string, unknown>>().notNull(),
		algorithm: text('algorithm').notNull().default('RS256'),
		status: text('status').$type<LtiToolKeyStatus>().notNull().default(ltiToolKeyStatus.ACTIVE),
		createdAt: integer('created_at', { mode: 'timestamp' }).notNull(),
		activatedAt: integer('activated_at', { mode: 'timestamp' }).notNull(),
		retiredAt: integer('retired_at', { mode: 'timestamp' })
	},
	(table) => [index('lti_tool_key_status_idx').on(table.status)]
);

export const ltiLoginState = sqliteTable(
	'lti_login_state',
	{
		id: text('id').primaryKey(),
		state: text('state').notNull().unique(),
		nonce: text('nonce').notNull().unique(),
		platformId: text('platform_id')
			.notNull()
			.references(() => ltiPlatformRegistration.id, { onDelete: 'cascade' }),
		deploymentId: text('deployment_id').references(() => ltiDeployment.id, {
			onDelete: 'set null'
		}),
		targetLinkUri: text('target_link_uri').notNull(),
		loginHint: text('login_hint'),
		messageHint: text('message_hint'),
		clientId: text('client_id').notNull(),
		expiresAt: integer('expires_at', { mode: 'timestamp' }).notNull(),
		usedAt: integer('used_at', { mode: 'timestamp' }),
		createdAt: integer('created_at', { mode: 'timestamp' }).notNull()
	},
	(table) => [
		index('lti_login_state_platform_idx').on(table.platformId),
		index('lti_login_state_expires_idx').on(table.expiresAt)
	]
);

export const ltiUserIdentity = sqliteTable(
	'lti_user_identity',
	{
		id: text('id').primaryKey(),
		platformId: text('platform_id')
			.notNull()
			.references(() => ltiPlatformRegistration.id, { onDelete: 'cascade' }),
		deploymentId: text('deployment_id')
			.notNull()
			.references(() => ltiDeployment.id, { onDelete: 'cascade' }),
		sub: text('sub').notNull(),
		userId: text('user_id')
			.notNull()
			.references(() => user.id, { onDelete: 'cascade' }),
		email: text('email'),
		name: text('name'),
		rolesJson: text('roles_json'),
		createdAt: integer('created_at', { mode: 'timestamp' }).notNull(),
		updatedAt: integer('updated_at', { mode: 'timestamp' }).notNull(),
		lastLaunchAt: integer('last_launch_at', { mode: 'timestamp' })
	},
	(table) => [
		uniqueIndex('lti_user_identity_subject_idx').on(
			table.platformId,
			table.deploymentId,
			table.sub
		),
		index('lti_user_identity_user_idx').on(table.userId)
	]
);

export const ltiResourceLink = sqliteTable(
	'lti_resource_link',
	{
		id: text('id').primaryKey(),
		platformId: text('platform_id')
			.notNull()
			.references(() => ltiPlatformRegistration.id, { onDelete: 'cascade' }),
		deploymentId: text('deployment_id')
			.notNull()
			.references(() => ltiDeployment.id, { onDelete: 'cascade' }),
		resourceLinkId: text('resource_link_id').notNull(),
		contextId: text('context_id').notNull(),
		courseId: text('course_id')
			.notNull()
			.references(() => course.id, { onDelete: 'cascade' }),
		activityId: text('activity_id')
			.notNull()
			.references(() => interactiveLearning.id, { onDelete: 'cascade' }),
		title: text('title'),
		lineItemUrl: text('line_item_url'),
		lineItemsUrl: text('line_items_url'),
		agsScope: text('ags_scope'),
		customJson: text('custom_json'),
		metadataJson: text('metadata_json'),
		createdAt: integer('created_at', { mode: 'timestamp' }).notNull(),
		updatedAt: integer('updated_at', { mode: 'timestamp' }).notNull()
	},
	(table) => [
		uniqueIndex('lti_resource_link_identity_idx').on(
			table.platformId,
			table.deploymentId,
			table.contextId,
			table.resourceLinkId
		),
		index('lti_resource_link_course_activity_idx').on(table.courseId, table.activityId)
	]
);

export const ltiDeepLinkSession = sqliteTable(
	'lti_deep_link_session',
	{
		id: text('id').primaryKey(),
		platformId: text('platform_id')
			.notNull()
			.references(() => ltiPlatformRegistration.id, { onDelete: 'cascade' }),
		deploymentId: text('deployment_id')
			.notNull()
			.references(() => ltiDeployment.id, { onDelete: 'cascade' }),
		teacherUserId: text('teacher_user_id').references(() => user.id, { onDelete: 'set null' }),
		contextId: text('context_id'),
		deepLinkReturnUrl: text('deep_link_return_url').notNull(),
		data: text('data'),
		settings: text('settings', { mode: 'json' }).$type<LtiDeepLinkSettings>(),
		launchClaimsJson: text('launch_claims_json'),
		expiresAt: integer('expires_at', { mode: 'timestamp' }).notNull(),
		usedAt: integer('used_at', { mode: 'timestamp' }),
		createdAt: integer('created_at', { mode: 'timestamp' }).notNull()
	},
	(table) => [
		index('lti_deep_link_session_platform_idx').on(table.platformId),
		index('lti_deep_link_session_expires_idx').on(table.expiresAt)
	]
);

export const ltiLaunch = sqliteTable(
	'lti_launch',
	{
		id: text('id').primaryKey(),
		platformId: text('platform_id')
			.notNull()
			.references(() => ltiPlatformRegistration.id, { onDelete: 'cascade' }),
		deploymentId: text('deployment_id')
			.notNull()
			.references(() => ltiDeployment.id, { onDelete: 'cascade' }),
		resourceLinkDbId: text('resource_link_db_id').references(() => ltiResourceLink.id, {
			onDelete: 'set null'
		}),
		userIdentityId: text('user_identity_id').references(() => ltiUserIdentity.id, {
			onDelete: 'set null'
		}),
		userId: text('user_id').references(() => user.id, { onDelete: 'set null' }),
		ltiSub: text('lti_sub').notNull(),
		messageType: text('message_type').$type<LtiLaunchMessageType>().notNull(),
		rolesJson: text('roles_json'),
		contextId: text('context_id'),
		resourceLinkId: text('resource_link_id'),
		claimsJson: text('claims_json'),
		ipAddress: text('ip_address'),
		userAgent: text('user_agent'),
		createdAt: integer('created_at', { mode: 'timestamp' }).notNull()
	},
	(table) => [
		index('lti_launch_resource_idx').on(table.resourceLinkDbId),
		index('lti_launch_user_idx').on(table.userId),
		index('lti_launch_created_idx').on(table.createdAt)
	]
);

export const ltiGradeSyncLog = sqliteTable(
	'lti_grade_sync_log',
	{
		id: text('id').primaryKey(),
		platformId: text('platform_id').references(() => ltiPlatformRegistration.id, {
			onDelete: 'set null'
		}),
		deploymentId: text('deployment_id').references(() => ltiDeployment.id, {
			onDelete: 'set null'
		}),
		resourceLinkDbId: text('resource_link_db_id').references(() => ltiResourceLink.id, {
			onDelete: 'set null'
		}),
		userIdentityId: text('user_identity_id').references(() => ltiUserIdentity.id, {
			onDelete: 'set null'
		}),
		progressId: text('progress_id').references(() => learningActivityProgress.id, {
			onDelete: 'set null'
		}),
		courseId: text('course_id').references(() => course.id, { onDelete: 'set null' }),
		activityId: text('activity_id').references(() => interactiveLearning.id, {
			onDelete: 'set null'
		}),
		userId: text('user_id').references(() => user.id, { onDelete: 'set null' }),
		lineItemUrl: text('line_item_url'),
		status: text('status').$type<LtiGradeSyncStatus>().notNull(),
		httpStatus: integer('http_status'),
		attempt: integer('attempt').notNull().default(1),
		payloadJson: text('payload_json'),
		responseBody: text('response_body'),
		errorMessage: text('error_message'),
		createdAt: integer('created_at', { mode: 'timestamp' }).notNull(),
		updatedAt: integer('updated_at', { mode: 'timestamp' }).notNull()
	},
	(table) => [
		index('lti_grade_sync_course_activity_idx').on(table.courseId, table.activityId),
		index('lti_grade_sync_user_idx').on(table.userId),
		index('lti_grade_sync_status_idx').on(table.status),
		index('lti_grade_sync_created_idx').on(table.createdAt)
	]
);

export type LtiPlatformRegistration = typeof ltiPlatformRegistration.$inferSelect;
export type LtiDeployment = typeof ltiDeployment.$inferSelect;
export type LtiToolKey = typeof ltiToolKey.$inferSelect;
export type LtiLoginState = typeof ltiLoginState.$inferSelect;
export type LtiUserIdentity = typeof ltiUserIdentity.$inferSelect;
export type LtiResourceLink = typeof ltiResourceLink.$inferSelect;
export type LtiDeepLinkSession = typeof ltiDeepLinkSession.$inferSelect;
export type LtiLaunch = typeof ltiLaunch.$inferSelect;
export type LtiGradeSyncLog = typeof ltiGradeSyncLog.$inferSelect;
