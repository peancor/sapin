export const LTI_CLAIMS = {
	MESSAGE_TYPE: 'https://purl.imsglobal.org/spec/lti/claim/message_type',
	VERSION: 'https://purl.imsglobal.org/spec/lti/claim/version',
	DEPLOYMENT_ID: 'https://purl.imsglobal.org/spec/lti/claim/deployment_id',
	TARGET_LINK_URI: 'https://purl.imsglobal.org/spec/lti/claim/target_link_uri',
	ROLES: 'https://purl.imsglobal.org/spec/lti/claim/roles',
	CONTEXT: 'https://purl.imsglobal.org/spec/lti/claim/context',
	RESOURCE_LINK: 'https://purl.imsglobal.org/spec/lti/claim/resource_link',
	CUSTOM: 'https://purl.imsglobal.org/spec/lti/claim/custom',
	DEEP_LINKING_SETTINGS: 'https://purl.imsglobal.org/spec/lti-dl/claim/deep_linking_settings',
	AGS_ENDPOINT: 'https://purl.imsglobal.org/spec/lti-ags/claim/endpoint',
	LAUNCH_PRESENTATION: 'https://purl.imsglobal.org/spec/lti/claim/launch_presentation',
	NAMES_ROLE_SERVICE: 'https://purl.imsglobal.org/spec/lti-nrps/claim/namesroleservice'
} as const;

export const LTI_MESSAGE_TYPES = {
	RESOURCE_LINK_REQUEST: 'LtiResourceLinkRequest',
	DEEP_LINKING_REQUEST: 'LtiDeepLinkingRequest'
} as const;

export const LTI_ROLE_SUFFIXES = {
	LEARNER: 'Learner',
	INSTRUCTOR: 'Instructor',
	TEACHING_ASSISTANT: 'TeachingAssistant',
	ADMINISTRATOR: 'Administrator',
	MENTOR: 'Mentor',
	CONTENT_DEVELOPER: 'ContentDeveloper'
} as const;

export type LtiRoleKind = 'learner' | 'instructor' | 'admin' | 'unknown';

export type LtiContextClaim = {
	id?: string;
	label?: string;
	title?: string;
	type?: string[];
};

export type LtiResourceLinkClaim = {
	id?: string;
	title?: string;
	description?: string;
};

export type LtiAgsEndpointClaim = {
	scope?: string[];
	lineitem?: string;
	lineitems?: string;
};

export type LtiDeepLinkingSettingsClaim = {
	deep_link_return_url?: string;
	accept_types?: string[];
	accept_presentation_document_targets?: string[];
	accept_multiple?: boolean;
	auto_create?: boolean;
	data?: string;
};

export type LtiLaunchClaims = {
	iss: string;
	sub: string;
	aud: string | string[];
	nonce?: string;
	email?: string;
	name?: string;
	given_name?: string;
	family_name?: string;
	picture?: string;
	[LTI_CLAIMS.MESSAGE_TYPE]?: string;
	[LTI_CLAIMS.VERSION]?: string;
	[LTI_CLAIMS.DEPLOYMENT_ID]?: string;
	[LTI_CLAIMS.TARGET_LINK_URI]?: string;
	[LTI_CLAIMS.ROLES]?: string[];
	[LTI_CLAIMS.CONTEXT]?: LtiContextClaim;
	[LTI_CLAIMS.RESOURCE_LINK]?: LtiResourceLinkClaim;
	[LTI_CLAIMS.CUSTOM]?: Record<string, string>;
	[LTI_CLAIMS.DEEP_LINKING_SETTINGS]?: LtiDeepLinkingSettingsClaim;
	[LTI_CLAIMS.AGS_ENDPOINT]?: LtiAgsEndpointClaim;
};

function roleEndsWith(role: string, suffix: string): boolean {
	return role === suffix || role.endsWith(`/${suffix}`) || role.endsWith(`#${suffix}`);
}

export function classifyLtiRoles(roles: string[] | undefined): LtiRoleKind {
	if (!roles?.length) return 'unknown';
	if (roles.some((role) => roleEndsWith(role, LTI_ROLE_SUFFIXES.ADMINISTRATOR))) return 'admin';
	if (
		roles.some(
			(role) =>
				roleEndsWith(role, LTI_ROLE_SUFFIXES.INSTRUCTOR) ||
				roleEndsWith(role, LTI_ROLE_SUFFIXES.TEACHING_ASSISTANT) ||
				roleEndsWith(role, LTI_ROLE_SUFFIXES.CONTENT_DEVELOPER) ||
				roleEndsWith(role, LTI_ROLE_SUFFIXES.MENTOR)
		)
	) {
		return 'instructor';
	}
	if (roles.some((role) => roleEndsWith(role, LTI_ROLE_SUFFIXES.LEARNER))) return 'learner';
	return 'unknown';
}

export function getLtiMessageType(claims: LtiLaunchClaims): string | undefined {
	return claims[LTI_CLAIMS.MESSAGE_TYPE];
}

export function getLtiDeploymentId(claims: LtiLaunchClaims): string | undefined {
	return claims[LTI_CLAIMS.DEPLOYMENT_ID];
}

export function getLtiTargetLinkUri(claims: LtiLaunchClaims): string | undefined {
	return claims[LTI_CLAIMS.TARGET_LINK_URI];
}

export function getLtiContextId(claims: LtiLaunchClaims): string | undefined {
	return claims[LTI_CLAIMS.CONTEXT]?.id;
}

export function getLtiResourceLinkId(claims: LtiLaunchClaims): string | undefined {
	return claims[LTI_CLAIMS.RESOURCE_LINK]?.id;
}

export function getLtiCustom(claims: LtiLaunchClaims): Record<string, string> {
	return claims[LTI_CLAIMS.CUSTOM] ?? {};
}

export function ltiAudiencesInclude(
	audience: string | string[] | undefined,
	clientId: string
): boolean {
	if (!audience) return false;
	return Array.isArray(audience) ? audience.includes(clientId) : audience === clientId;
}

export function hasAgsScoreScope(
	endpoint: LtiAgsEndpointClaim | undefined,
	scoreScope: string
): boolean {
	return endpoint?.scope?.includes(scoreScope) ?? false;
}
