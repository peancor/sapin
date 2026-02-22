import { db } from '$lib/server/db';
import * as table from '$lib/server/db/schema';
import { eq } from 'drizzle-orm';
import { buildOpenRouterHeaders } from '$lib/server/utils/openRouter';

export class AIImageUtils {
	private static async getSetting(key: string, defaultValue: string = ''): Promise<string> {
		const result = await db.select().from(table.appSetting).where(eq(table.appSetting.key, key));
		return result[0]?.value ?? defaultValue;
	}

	public static async getAvailableImageModels() {
		return [
			{ provider: 'OpenRouter', name: 'Nano Banana', model: 'google/gemini-2.5-flash-image' },
			{ provider: 'OpenRouter', name: 'GPT-5 Image Mini', model: 'openai/gpt-5-image-mini' },
			{ provider: 'OpenRouter', name: 'Nano Banana Pro', model: 'google/gemini-3-pro-image-preview' }
		];
	}

	public static readonly IMAGE_ASPECT_RATIOS = [
		{ value: '1:1', label: '1:1 (1024×1024)', width: 1024, height: 1024 },
		{ value: '16:9', label: '16:9 (1344×768)', width: 1344, height: 768 },
		{ value: '9:16', label: '9:16 (768×1344)', width: 768, height: 1344 },
		{ value: '4:3', label: '4:3 (1184×864)', width: 1184, height: 864 },
		{ value: '3:4', label: '3:4 (864×1184)', width: 864, height: 1184 },
		{ value: '3:2', label: '3:2 (1248×832)', width: 1248, height: 832 },
		{ value: '2:3', label: '2:3 (832×1248)', width: 832, height: 1248 }
	] as const;

	public static async generateImage(
		prompt: string,
		modelName: string,
		aspectRatio: string = '1:1'
	): Promise<{ images: string[]; content?: string; error?: string }> {
		const availableModels = await this.getAvailableImageModels();
		const modelDef = availableModels.find((m) => m.name === modelName);
		
		if (!modelDef) {
			throw new Error(`Unsupported image model: ${modelName}`);
		}

		const openRouterKey = await this.getSetting('openRouterKey');
		if (!openRouterKey) {
			throw new Error('OpenRouter API key not configured');
		}

		const payload: Record<string, unknown> = {
			model: modelDef.model,
			messages: [
				{
					role: 'user',
					content: prompt
				}
			],
			modalities: ['image', 'text'],
			stream: false
		};

		// Add aspect ratio config for Gemini models
		if (modelDef.model.includes('gemini')) {
			payload.image_config = { aspect_ratio: aspectRatio };
		}

		const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
			method: 'POST',
			headers: buildOpenRouterHeaders(openRouterKey, 'SAPIN Image Generation'),
			body: JSON.stringify(payload)
		});

		if (!response.ok) {
			const errorText = await response.text();
			throw new Error(`OpenRouter API error: ${response.status} - ${errorText}`);
		}

		const result = await response.json();

		if (!result.choices || result.choices.length === 0) {
			throw new Error('No response from image generation model');
		}

		const message = result.choices[0].message;
		const images: string[] = [];

		if (message.images && Array.isArray(message.images)) {
			for (const image of message.images) {
				if (image.image_url?.url) {
					images.push(image.image_url.url);
				}
			}
		}

		return {
			images,
			content: message.content || ''
		};
	}
}
