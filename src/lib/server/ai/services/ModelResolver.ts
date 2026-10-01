import { createOpenAI } from '@ai-sdk/openai';
import { createOpenAICompatible } from '@ai-sdk/openai-compatible';
import { createOpenRouter } from '@openrouter/ai-sdk-provider';
import { AIModelService } from '../AIModelService';

export type AvailableModel = {
	id?: string;
	providerId?: string | null;
	provider: string;
	providerType: string;
	name: string;
	model: string;
	inputPricePerMillion?: number | null;
	outputPricePerMillion?: number | null;
};

const FALLBACK_MODELS: AvailableModel[] = [
	{ provider: 'OpenAI', providerType: 'openai', name: 'OpenAI - GPT-5', model: 'gpt-5-2025-08-07' },
	{ provider: 'OpenAI', providerType: 'openai', name: 'OpenAI - GPT-5 mini', model: 'gpt-5-mini-2025-08-07' },
	{
		provider: 'OpenRouter',
		providerType: 'openrouter',
		name: 'OpenRouter - Gemini 2.5 Pro',
		model: 'google/gemini-2.5-pro'
	},
	{
		provider: 'OpenRouter',
		providerType: 'openrouter',
		name: 'OpenRouter - Gemini 2.5 Flash',
		model: 'google/gemini-2.5-flash'
	},
	{ provider: 'OpenRouter', providerType: 'openrouter', name: 'OpenRouter - GPT-5', model: 'openai/gpt-5' },
	{
		provider: 'OpenRouter',
		providerType: 'openrouter',
		name: 'OpenRouter - Claude Sonnet 4',
		model: 'anthropic/claude-sonnet-4'
	},
	{ provider: 'OpenRouter', providerType: 'openrouter', name: 'OpenRouter - Grok 4', model: 'x-ai/grok-4' },
	{ provider: 'LM Studio', providerType: 'lmstudio', name: 'LM Studio - Gemma 3 27B', model: 'gemma-3-27b-it' }
];

export class ModelResolver {
	public static async getModelDefinitionByName(modelName: string): Promise<AvailableModel | null> {
		const models = await this.getAvailableModels();
		return models.find((item) => item.name === modelName) ?? null;
	}

	public static async getProviderTypeByModelName(modelName: string): Promise<string | null> {
		return (await this.getModelDefinitionByName(modelName))?.providerType ?? null;
	}

	public static async getAvailableModels(): Promise<AvailableModel[]> {
		try {
			const dbModels = await AIModelService.getActiveModels();
			if (dbModels.length > 0) {
				return dbModels.map(({ model, provider }) => ({
					id: model.id,
					providerId: provider?.id,
					provider: provider?.displayName || 'Unknown',
					providerType: provider?.type || 'custom',
					name: model.displayName,
					model: model.name,
					inputPricePerMillion: model.inputPricePerMillion,
					outputPricePerMillion: model.outputPricePerMillion
				}));
			}
		} catch (error) {
			console.warn('Error fetching models from DB, using fallback:', error);
		}

		return FALLBACK_MODELS;
	}

	public static async getDefaultModel(): Promise<string> {
		try {
			const defaultModel = await AIModelService.getDefaultModel();
			if (defaultModel) {
				return defaultModel.model.displayName;
			}
		} catch (error) {
			console.warn('Error fetching default model:', error);
		}

		return 'OpenRouter - Gemini 2.5 Flash';
	}

	public static async getModelIdByName(modelName: string): Promise<string | null> {
		try {
			const models = await this.getAvailableModels();
			const model = models.find((item) => item.name === modelName);
			return model?.id ?? null;
		} catch {
			return null;
		}
	}

	public static async buildChatModel(modelName: string) {
		const modelDef = await this.getModelDefinitionByName(modelName);
		if (!modelDef) {
			throw new Error(`Unsupported model: ${modelName}`);
		}

		const providerType = modelDef.providerType || modelDef.provider.toLowerCase();
		const providerId = modelDef.providerId ?? null;

		let apiKey: string | null = null;
		if (providerId) {
			apiKey = await AIModelService.getApiKeyByProviderId(providerId);
		}

		switch (providerType) {
			case 'openai': {
				if (!apiKey) throw new Error('API key de OpenAI no configurada');
				return createOpenAI({ apiKey }).chat(modelDef.model);
			}
			case 'openrouter': {
				if (!apiKey) throw new Error('API key de OpenRouter no configurada');
				return createOpenRouter({ apiKey }).chat(modelDef.model);
			}
			case 'lmstudio': {
				let baseUrl = 'http://localhost:1234/v1';
				if (providerId) {
					const provider = await AIModelService.getProviderById(providerId);
					if (provider?.baseUrl) {
						baseUrl = provider.baseUrl;
					}
				}

				return createOpenAICompatible({
					name: 'lmstudio',
					baseURL: baseUrl
				}).chatModel(modelDef.model);
			}
			case 'anthropic': {
				if (!apiKey) {
					throw new Error(
						'API key de Anthropic no configurada. Configúrala en el panel de administración.'
					);
				}
				return createOpenRouter({ apiKey }).chat(modelDef.model);
			}
			case 'google': {
				if (!apiKey) {
					throw new Error('API key de Google no configurada. Configúrala en el panel de administración.');
				}
				return createOpenRouter({ apiKey }).chat(modelDef.model);
			}
			default: {
				if (!apiKey) {
					throw new Error(
						`API key no configurada para el proveedor: ${providerType}. Configúrala en el panel de administración.`
					);
				}
				return createOpenRouter({ apiKey }).chat(modelDef.model);
			}
		}
	}
}
