import { draftOutreachMessage } from './handler';
import { draftOutreachMessageManifest } from './manifest';
import { defineBuiltinToolPackage } from '../defineBuiltinToolPackage';

export const draftOutreachMessagePackage = defineBuiltinToolPackage({
	manifest: draftOutreachMessageManifest,
	handler: draftOutreachMessage
});
