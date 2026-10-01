import { writable } from 'svelte/store';

// Constantes de niveles de rol (deben coincidir con el servidor)
export const ROLE_LEVELS = {
    SUPER_ADMIN: 100,
    ADMIN: 90,
    TEACHER: 50,
    ASSISTANT: 40,
    STUDENT: 10
} as const;

export type TopbarMenuItem = {
    href: string;
    label: string;
    roles?: string[]; // Sistema legacy (deprecated)
    minLevel?: number; // Nuevo sistema basado en niveles
};

export const topbarMenuItems = writable<TopbarMenuItem[]>([
    {
        href: '/dashboard',
        label: 'Mi Espacio',
        minLevel: ROLE_LEVELS.STUDENT
    },
    {
        href: '/tutor',
        label: 'Asistente',
        minLevel: ROLE_LEVELS.STUDENT
    }
    // Añadir más items públicos o informativos aquí
]);
