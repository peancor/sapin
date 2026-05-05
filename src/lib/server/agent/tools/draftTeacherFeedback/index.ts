import { draftTeacherFeedback } from './handler';
import { draftTeacherFeedbackManifest } from './manifest';
import type { BuiltinToolPackage } from '../types';

export const draftTeacherFeedbackPackage: BuiltinToolPackage = {
	manifest: draftTeacherFeedbackManifest,
	handler: draftTeacherFeedback
};
