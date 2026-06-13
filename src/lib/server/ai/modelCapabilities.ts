export function parseModelCapabilities(capabilities: string | null): string[] {
	if (!capabilities) return [];
	try {
		const parsed = JSON.parse(capabilities) as unknown;
		return Array.isArray(parsed)
			? parsed.filter((capability): capability is string => typeof capability === 'string')
			: [];
	} catch {
		return [];
	}
}

export function modelCapabilitiesSupportVision(capabilities: string | null): boolean {
	const parsed = parseModelCapabilities(capabilities);
	return parsed.includes('vision');
}
