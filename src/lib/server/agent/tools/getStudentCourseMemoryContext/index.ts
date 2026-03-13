import { getStudentCourseMemoryContext } from './handler';
import { getStudentCourseMemoryContextManifest } from './manifest';
import type { BuiltinToolPackage } from '../types';

export const getStudentCourseMemoryContextPackage: BuiltinToolPackage = {
	manifest: getStudentCourseMemoryContextManifest,
	handler: getStudentCourseMemoryContext
};

export { getStudentCourseMemoryContext } from './handler';
export { getStudentCourseMemoryContextManifest } from './manifest';
