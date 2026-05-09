export function resolveExternalIdSearchParam(searchParams: URLSearchParams): string | null {
	return searchParams.get('id') || searchParams.get('externalId') || searchParams.get('externalid');
}
