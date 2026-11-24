import type { AgentDisplayPart } from '$lib/types/agent';

// Older turns only store the complete text and the list of components.
export function orderTranscriptParts(
	parts: AgentDisplayPart[],
	positions: unknown
): AgentDisplayPart[] {
	if (!Array.isArray(positions) || !positions.length) return parts;
	const text = parts.find((part) => part.kind === 'text')?.content ?? '';
	const interfaces = new Map(
		parts.filter((part) => part.kind === 'ui-component').map((part) => [part.instanceId, part])
	);
	const ordered: AgentDisplayPart[] = [];
	let start = 0;
	for (const position of positions) {
		const ui = interfaces.get(position?.instanceId);
		const end = position?.offset;
		if (!ui || !Number.isInteger(end) || end < start || end > text.length) return parts;
		if (end > start) ordered.push({ kind: 'text', content: text.slice(start, end) });
		ordered.push(ui);
		interfaces.delete(ui.instanceId);
		start = end;
	}
	if (start < text.length) ordered.push({ kind: 'text', content: text.slice(start) });
	return [
		...ordered,
		...parts.filter(
			(part) =>
				part.kind !== 'text' && (part.kind !== 'ui-component' || interfaces.has(part.instanceId))
		)
	];
}
