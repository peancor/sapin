import { getLearningProgressTimeline } from './handler';
import { getLearningProgressTimelineManifest } from './manifest';
import type { BuiltinToolPackage } from '../types';

export const getLearningProgressTimelinePackage: BuiltinToolPackage = {
	manifest: getLearningProgressTimelineManifest,
	handler: getLearningProgressTimeline
};
