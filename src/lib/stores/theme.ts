import { writable } from 'svelte/store';
import { browser } from '$app/environment';

const defaultTheme = (browser ? localStorage.getItem('theme') ?? 'light' : 'light') as 'light' | 'dark';
export const theme = writable<'light' | 'dark'>(defaultTheme);

theme.subscribe((value) => {
    if (browser) {
        localStorage.setItem('theme', value);
        if (value === 'dark') {
            document.documentElement.classList.add('dark');
        } else {
            document.documentElement.classList.remove('dark');
        }
    }
});
