import type { Notifier } from "./index";
import { env } from '$env/dynamic/private';

export default class TelegramNotifier implements Notifier {
    private botToken: string;
    private chatId: string;
    private apiUrl: string;

    constructor(telegramBotToken: string, telegramChatId: string) {
        this.botToken = telegramBotToken;
        this.chatId = telegramChatId;
        
        if (!this.botToken || !this.chatId) {
            throw new Error('Telegram configuration missing. TELEGRAM_BOT_TOKEN and TELEGRAM_CHAT_ID are required.');
        }
        
        this.apiUrl = `https://api.telegram.org/bot${this.botToken}`;
    }

    async notify(message: string): Promise<void> {
        try {
            const response = await fetch(`${this.apiUrl}/sendMessage`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    chat_id: this.chatId,
                    text: message,
                    parse_mode: 'HTML'
                })
            });

            if (!response.ok) {
                const error = await response.json();
                throw new Error(`Telegram API error: ${error.description}`);
            }
        } catch (error) {
            console.error('Failed to send Telegram notification:', error);
            throw error;
        }
    }
}