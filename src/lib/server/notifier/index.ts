import { TELEGRAM_BOT_TOKEN, TELEGRAM_CHAT_ID, ENABLE_TELEGRAM_NOTIFICATIONS } from "$env/static/private";

export interface Notifier {
    notify(message: string): void;
}

import TelegramNotifier from "./TelegramNotifier";
import VoidNotifier from "./VoidNotifier";

export class NotifierConfig {
    private static instance: Notifier = new VoidNotifier();

    static configure(notifier: Notifier) {
        NotifierConfig.instance = notifier;
    }

    static getNotifier(): Notifier {
        return NotifierConfig.instance;
    }
}

export { TelegramNotifier, VoidNotifier };

// Configure TelegramNotifier with additional parameters from environment variables
if (ENABLE_TELEGRAM_NOTIFICATIONS === "true") {
    console.log("Telegram notifications are enabled");
    NotifierConfig.configure(new TelegramNotifier(TELEGRAM_BOT_TOKEN, TELEGRAM_CHAT_ID));
}
else {
    console.log("Telegram notifications are disabled");
    NotifierConfig.configure(new VoidNotifier());
}
 // Export a default configured notifier for easy access
export const notifier = NotifierConfig.getNotifier();

