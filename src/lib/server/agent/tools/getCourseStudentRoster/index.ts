import { getCourseStudentRoster } from './handler';
import { getCourseStudentRosterManifest } from './manifest';
import { defineBuiltinToolPackage } from '../defineBuiltinToolPackage';

export const getCourseStudentRosterPackage = defineBuiltinToolPackage({
	manifest: getCourseStudentRosterManifest,
	handler: getCourseStudentRoster
});

export { getCourseStudentRoster } from './handler';
export { getCourseStudentRosterManifest } from './manifest';
