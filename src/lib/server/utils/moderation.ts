import OpenAI from "openai";
import type { ModerationCreateResponse } from "openai/resources/moderations.mjs";
import { OPENAI_MODERATION_API_KEY } from "$env/static/private";


// export interface ModerationResult {
//     flagged: boolean;
//     categories: {
//         hate: boolean;
//         hate_threatening: boolean;
//         self_harm: boolean;
//         sexual: boolean;
//         sexual_minors: boolean;
//         violence: boolean;
//         [key: string]: boolean;
//     };
//     category_scores: {
//         hate: number;
//         hate_threatening: number;
//         self_harm: number;
//         sexual: number;
//         sexual_minors: number;
//         violence: number;
//         [key: string]: number;
//     };
// }

// export interface ModerationResponse {
//     id: string;
//     model: string;
//     results: ModerationResult[];
// }

export async function moderatePrompt(prompt: string): Promise<ModerationCreateResponse> {
    if (!OPENAI_MODERATION_API_KEY) {
        throw new Error("No se encontró la API key en las variables de entorno.");
    }

    const openai = new OpenAI({ apiKey: OPENAI_MODERATION_API_KEY });
    const moderation = await openai.moderations.create({
        model: "omni-moderation-latest",
        input: prompt,
    }); 

    return moderation;
}

export async function isPromptSafe(prompt: string): Promise<boolean> {
    const moderation = await moderatePrompt(prompt);
    const results = moderation.results[0];

    return !results.flagged;
}