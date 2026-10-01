export const BUILTIN_TOOL_USAGE_DOMAIN_AGENT_CHAT = 'agent_chat';
export const BUILTIN_TOOL_USAGE_DOMAIN_INSIGHTS = 'insights';
export const BUILTIN_TOOL_USAGE_DOMAIN_INTERNAL = 'internal';

export const BUILTIN_TOOL_USAGE_DOMAINS = [
	BUILTIN_TOOL_USAGE_DOMAIN_AGENT_CHAT,
	BUILTIN_TOOL_USAGE_DOMAIN_INSIGHTS,
	BUILTIN_TOOL_USAGE_DOMAIN_INTERNAL
] as const;

export type BuiltinToolUsageDomain = (typeof BUILTIN_TOOL_USAGE_DOMAINS)[number];

export function isBuiltinToolUsageDomain(value: string): value is BuiltinToolUsageDomain {
	return BUILTIN_TOOL_USAGE_DOMAINS.includes(value as BuiltinToolUsageDomain);
}
