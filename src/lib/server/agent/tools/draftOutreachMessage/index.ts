import { draftOutreachMessage } from './handler';
import { draftOutreachMessageManifest } from './manifest';
import type { BuiltinToolPackage } from '../types';

export const draftOutreachMessagePackage: BuiltinToolPackage = {
	manifest: draftOutreachMessageManifest,
	handler: draftOutreachMessage
};
