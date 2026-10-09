import { getStudentProgress } from './handler';
import { getStudentProgressManifest } from './manifest';
import { defineBuiltinToolPackage } from '../defineBuiltinToolPackage';

export const getStudentProgressPackage = defineBuiltinToolPackage({
	manifest: getStudentProgressManifest,
	handler: getStudentProgress
});

export { getStudentProgress } from './handler';
export { getStudentProgressManifest } from './manifest';
