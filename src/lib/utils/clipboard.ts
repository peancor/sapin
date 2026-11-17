/**
 * Copia texto al portapapeles e informa de si se consiguió. El acceso puede denegarse (permiso,
 * contexto no seguro, documento sin foco), así que quien llama debe mostrar también el fallo.
 */
export async function copyText(text: string): Promise<boolean> {
	try {
		await navigator.clipboard.writeText(text);
		return true;
	} catch {
		return false;
	}
}
