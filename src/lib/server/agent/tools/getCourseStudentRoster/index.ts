import { getCourseStudentRoster } from './handler';
import { getCourseStudentRosterManifest } from './manifest';
import type { BuiltinToolPackage } from '../types';

export const getCourseStudentRosterPackage: BuiltinToolPackage = {
	manifest: getCourseStudentRosterManifest,
	handler: getCourseStudentRoster
};

export { getCourseStudentRoster } from './handler';
export { getCourseStudentRosterManifest } from './manifest';
