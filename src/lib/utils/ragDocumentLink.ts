export type RagDocumentLink =
	{ kind: 'internal'; pathname: `/api/files/${string}` } | { kind: 'resource'; href: string };

/** Only canonical file endpoints are app paths; legacy references keep their original URL. */
export function ragDocumentLink(originalPath: string | null | undefined): RagDocumentLink | null {
	if (!originalPath?.trim()) return null;
	const href = originalPath.trim();
	if (
		[...href].some((character) => character.charCodeAt(0) < 32 || character.charCodeAt(0) === 127)
	) {
		return null;
	}
	const scheme = /^([a-z][a-z\d+.-]*):/i.exec(href)?.[1]?.toLowerCase();
	if (scheme && scheme !== 'http' && scheme !== 'https') return null;
	if (/^\/api\/files\/[^/?#]+(?:[?#].*)?$/.test(href)) {
		return { kind: 'internal', pathname: href as `/api/files/${string}` };
	}
	// Resources (including old relative file URLs) use a normal browser request, not SPA routing.
	return { kind: 'resource', href };
}
