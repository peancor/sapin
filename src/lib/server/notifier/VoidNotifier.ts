import type { Notifier } from ".";

export default class VoidNotifier implements Notifier {
    notify(message: string): void {
        // Intentionally empty - does nothing
    }
}
