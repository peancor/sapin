import type { PageLoad } from './$types';

export const load = (async (event) => {
    const { params } = event;
    if (params.interactiveLearningId) {
        //creamos un nuevo chat interactivo
        const chatId = await event.fetch(`/api/interactive-chat/${params.interactiveLearningId}/chat`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({})
        });

        const data = await chatId.json();
        return { chatId: data.chatId };
    } else {
        return { error: 'Interactive Learning ID is required' };
    }
}) satisfies PageLoad;