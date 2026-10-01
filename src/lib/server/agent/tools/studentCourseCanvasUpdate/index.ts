import { studentCourseCanvasUpdate } from './handler';
import { studentCourseCanvasUpdateManifest } from './manifest';
import type { BuiltinToolPackage } from '../types';

export const studentCourseCanvasUpdatePackage: BuiltinToolPackage = {
	manifest: studentCourseCanvasUpdateManifest,
	handler: studentCourseCanvasUpdate
};

export { studentCourseCanvasUpdate } from './handler';
export { studentCourseCanvasUpdateManifest } from './manifest';
