import type { Notifier } from '.';

export default class VoidNotifier implements Notifier {
	notify(): void {
		// Intentionally empty - does nothing
	}
}
