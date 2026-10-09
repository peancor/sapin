import type { ModelMessage, SystemModelMessage } from 'ai';

/**
 * Adapts server-assembled messages to the SDK's separate system channel.
 * Only use with trusted roles assigned by the server, never raw client messages.
 * Keeps system blocks (including cache options) and conversation parts intact.
 */
export function toModelPrompt(input: readonly ModelMessage[]) {
	const system: SystemModelMessage[] = [];
	const messages: Exclude<ModelMessage, SystemModelMessage>[] = [];
	for (const message of input) {
		if (message.role === 'system') system.push(message);
		else messages.push(message);
	}
	return {
		...(system.length > 0 ? { system } : {}),
		messages,
		allowSystemInMessages: false as const
	};
}
