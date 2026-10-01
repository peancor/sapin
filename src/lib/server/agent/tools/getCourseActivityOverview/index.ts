import type { BuiltinToolPackage } from '../types';
import { getCourseActivityOverview } from './handler';
import { getCourseActivityOverviewManifest } from './manifest';

export const getCourseActivityOverviewPackage: BuiltinToolPackage = {
	manifest: getCourseActivityOverviewManifest,
	handler: getCourseActivityOverview
};

export { getCourseActivityOverview } from './handler';
export { getCourseActivityOverviewManifest } from './manifest';
