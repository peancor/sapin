import { draftStudentNotification } from './handler';
import { draftStudentNotificationManifest } from './manifest';
import type { BuiltinToolPackage } from '../types';

export const draftStudentNotificationPackage: BuiltinToolPackage = {
	manifest: draftStudentNotificationManifest,
	handler: draftStudentNotification
};
