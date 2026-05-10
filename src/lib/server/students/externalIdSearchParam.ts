export interface ExternalIdSearchParam {
	name: 'id' | 'externalId' | 'externalid';
	value: string;
}

export function resolveExternalIdSearchParamDetail(
	searchParams: URLSearchParams
): ExternalIdSearchParam | null {
	for (const name of ['id', 'externalId', 'externalid'] as const) {
		const value = searchParams.get(name);
		if (value) return { name, value };
	}

	return null;
}

export function resolveExternalIdSearchParam(searchParams: URLSearchParams): string | null {
	return resolveExternalIdSearchParamDetail(searchParams)?.value ?? null;
}
