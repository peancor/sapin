import { getStudentProgress } from './handler';
import { getStudentProgressManifest } from './manifest';
import type { BuiltinToolPackage } from '../types';

export const getStudentProgressPackage: BuiltinToolPackage = {
	manifest: getStudentProgressManifest,
	handler: getStudentProgress
};

export { getStudentProgress } from './handler';
export { getStudentProgressManifest } from './manifest';

