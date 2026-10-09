import { sendNotification } from './handler';
import { sendNotificationManifest } from './manifest';
import { defineBuiltinToolPackage } from '../defineBuiltinToolPackage';

export const sendNotificationPackage = defineBuiltinToolPackage({
	manifest: sendNotificationManifest,
	handler: sendNotification
});

export { sendNotification } from './handler';
export { sendNotificationManifest } from './manifest';
