import { storeStudentCourseMemory } from './handler';
import { storeStudentCourseMemoryManifest } from './manifest';
import type { BuiltinToolPackage } from '../types';

export const storeStudentCourseMemoryPackage: BuiltinToolPackage = {
	manifest: storeStudentCourseMemoryManifest,
	handler: storeStudentCourseMemory
};

export { storeStudentCourseMemory } from './handler';
export { storeStudentCourseMemoryManifest } from './manifest';
