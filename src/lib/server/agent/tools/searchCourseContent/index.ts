import { searchCourseContent } from './handler';
import { searchCourseContentManifest } from './manifest';
import { defineBuiltinToolPackage } from '../defineBuiltinToolPackage';

export const searchCourseContentPackage = defineBuiltinToolPackage({
	manifest: searchCourseContentManifest,
	handler: searchCourseContent
});

export { searchCourseContent } from './handler';
export { searchCourseContentManifest } from './manifest';
