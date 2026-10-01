import { searchCourseContent } from './handler';
import { searchCourseContentManifest } from './manifest';
import type { BuiltinToolPackage } from '../types';

export const searchCourseContentPackage: BuiltinToolPackage = {
	manifest: searchCourseContentManifest,
	handler: searchCourseContent
};

export { searchCourseContent } from './handler';
export { searchCourseContentManifest } from './manifest';

