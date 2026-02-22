import type { ComponentType } from 'svelte';

export interface NavigationItem {
    href: string;
    label: string;
    icon: ComponentType;
    roles?: string[];
}
