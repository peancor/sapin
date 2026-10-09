import { defineBuiltinToolPackage } from '../defineBuiltinToolPackage';
import { getCourseActivityOverview } from './handler';
import { getCourseActivityOverviewManifest } from './manifest';

export const getCourseActivityOverviewPackage = defineBuiltinToolPackage({
	manifest: getCourseActivityOverviewManifest,
	handler: getCourseActivityOverview
});

export { getCourseActivityOverview } from './handler';
export { getCourseActivityOverviewManifest } from './manifest';
