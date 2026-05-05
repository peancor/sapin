import { sendNotification } from './handler';
import { sendNotificationManifest } from './manifest';
import type { BuiltinToolPackage } from '../types';

export const sendNotificationPackage: BuiltinToolPackage = {
	manifest: sendNotificationManifest,
	handler: sendNotification
};

export { sendNotification } from './handler';
export { sendNotificationManifest } from './manifest';

