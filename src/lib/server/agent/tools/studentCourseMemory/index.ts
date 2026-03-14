import { studentCourseMemory } from './handler';
import { studentCourseMemoryManifest } from './manifest';
import type { BuiltinToolPackage } from '../types';

export const studentCourseMemoryPackage: BuiltinToolPackage = {
	manifest: studentCourseMemoryManifest,
	handler: studentCourseMemory
};

export { studentCourseMemory } from './handler';
export { studentCourseMemoryManifest } from './manifest';
