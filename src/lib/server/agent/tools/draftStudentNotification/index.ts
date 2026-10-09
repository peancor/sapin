import { draftStudentNotification } from './handler';
import { draftStudentNotificationManifest } from './manifest';
import { defineBuiltinToolPackage } from '../defineBuiltinToolPackage';

export const draftStudentNotificationPackage = defineBuiltinToolPackage({
	manifest: draftStudentNotificationManifest,
	handler: draftStudentNotification
});
