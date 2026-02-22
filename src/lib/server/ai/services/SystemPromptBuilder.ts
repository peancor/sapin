import textContentOfSystemPromptRag from '$lib/helpers/systemPromptTemplateRAG.md?raw';
import textContentOfSystemPromptNoRag from '$lib/helpers/systemPromptTemplateNoRAG.md?raw';

export class SystemPromptBuilder {
	public static buildSystemPrompt(
		role: string | null,
		instructions: string | null,
		context: string | null,
		systemPrompt: string | null,
		ragContext: string | null = null,
		isRagEnabled: boolean = false
	): string {
		if (!role) role = 'Asistente educativo de nivel universitario';
		if (!instructions) {
			instructions =
				'Responde a las preguntas que se te hagan siempre que estén relacionadas con las instrucciones o el contexto.';
		}
		if (!context) context = 'utiliza tu memoria para responder a las preguntas que se te hagan.';
		if (!systemPrompt) systemPrompt = this.getDefaultSystemPromptTemplateText(isRagEnabled);
		if (!ragContext) ragContext = 'No hay documentos adicionales disponibles para esta consulta.';

		return systemPrompt
			.replace(/{role}/g, role)
			.replace(/{instructions}/g, instructions)
			.replace(/{context}/g, context)
			.replace(/{rag_context}/g, ragContext);
	}

	public static getDefaultSystemPromptTemplateText(isRagEnabled: boolean = false): string {
		return isRagEnabled ? textContentOfSystemPromptRag : textContentOfSystemPromptNoRag;
	}
}
