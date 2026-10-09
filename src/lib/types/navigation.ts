import type { ComponentType } from 'svelte';
import type { PathnameWithSearchOrHash } from '$app/types';

export interface BreadcrumbItem {
	label: string;
	href?: PathnameWithSearchOrHash;
}

export interface NavigationItem {
	href: string;
	label: string;
	icon: ComponentType;
	roles?: string[];
}
