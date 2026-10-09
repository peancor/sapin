import { getLearningProgressTimeline } from './handler';
import { getLearningProgressTimelineManifest } from './manifest';
import { defineBuiltinToolPackage } from '../defineBuiltinToolPackage';

export const getLearningProgressTimelinePackage = defineBuiltinToolPackage({
	manifest: getLearningProgressTimelineManifest,
	handler: getLearningProgressTimeline
});
