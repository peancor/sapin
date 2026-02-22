import { writable } from 'svelte/store';
import { Home, Settings, Users, GraduationCap, Notebook } from 'lucide-svelte';

// Constantes de niveles de rol (deben coincidir con el servidor)
export const ROLE_LEVELS = {
    SUPER_ADMIN: 100,
    ADMIN: 90,
    TEACHER: 50,
    ASSISTANT: 40,
    STUDENT: 10
} as const;

export type NavigationItem = {
    href?: string;
    label: string;
    icon: any;
    roles?: string[]; // Sistema legacy (deprecated)
    minLevel?: number; // Nuevo sistema basado en niveles
    children?: NavigationItem[];
};

const defaultItems: NavigationItem[] = [
    { href: '/', label: 'Home', icon: Home },
/*     {
        label: 'Académico',
        icon: GraduationCap,
        children: [
            { href: '/teacher', label: 'Profesor', icon: GraduationCap },
            { href: '/course', label: 'Curso', icon: Notebook }
        ]
    }, */
    /*{
        label: 'Administración',
        icon: Settings,
        children: [
            { href: '/admin/users', label: 'Users', icon: Users },
            { href: '/admin/teachers', label: 'Profesores', icon: GraduationCap, minLevel: ROLE_LEVELS.ADMIN },
            { href: '/admin/courses', label: 'Cursos', icon: Notebook, minLevel: ROLE_LEVELS.ADMIN },
            { href: '/admin/settings', label: 'Settings', icon: Settings }
        ]
    }*/
];

export const navigationItems = writable<NavigationItem[]>(defaultItems);
