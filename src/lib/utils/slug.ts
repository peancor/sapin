/**
 * Utilidades para generación de slugs
 */

/**
 * Genera un slug URL-friendly a partir de un texto
 * @param text - Texto a convertir en slug
 * @param maxLength - Longitud máxima del slug (default: 60)
 * @returns Slug generado
 */
export function generateSlug(text: string, maxLength: number = 60): string {
    return text
        .toLowerCase()
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '') // Elimina acentos
        .replace(/[^a-z0-9\s-]/g, '') // Solo alfanumérico, espacios y guiones
        .replace(/\s+/g, '-') // Espacios a guiones
        .replace(/-+/g, '-') // Múltiples guiones a uno
        .replace(/^-|-$/g, '') // Elimina guiones al inicio/fin
        .substring(0, maxLength) || 'item';
}

/**
 * Genera un slug único verificando contra una lista de slugs existentes
 * @param text - Texto a convertir en slug
 * @param existingSlugs - Set de slugs existentes
 * @param maxLength - Longitud máxima del slug (default: 60)
 * @returns Slug único generado
 */
export function generateUniqueSlug(
    text: string,
    existingSlugs: Set<string> | string[],
    maxLength: number = 60
): string {
    const slugSet = existingSlugs instanceof Set ? existingSlugs : new Set(existingSlugs);
    const baseSlug = generateSlug(text, maxLength);

    let finalSlug = baseSlug;
    let counter = 1;

    while (slugSet.has(finalSlug)) {
        finalSlug = `${baseSlug}-${counter}`;
        counter++;
    }

    return finalSlug;
}
