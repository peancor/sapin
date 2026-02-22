import { writable } from 'svelte/store';

export const response = writable('');
export const loading = writable(false)

export function resetResponse() {
    response.set("")
}