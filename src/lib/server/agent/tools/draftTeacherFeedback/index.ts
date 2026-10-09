import { draftTeacherFeedback } from './handler';
import { draftTeacherFeedbackManifest } from './manifest';
import { defineBuiltinToolPackage } from '../defineBuiltinToolPackage';

export const draftTeacherFeedbackPackage = defineBuiltinToolPackage({
	manifest: draftTeacherFeedbackManifest,
	handler: draftTeacherFeedback
});
