import { studentCourseCanvasUpdate } from './handler';
import { studentCourseCanvasUpdateManifest } from './manifest';
import { defineBuiltinToolPackage } from '../defineBuiltinToolPackage';

export const studentCourseCanvasUpdatePackage = defineBuiltinToolPackage({
	manifest: studentCourseCanvasUpdateManifest,
	handler: studentCourseCanvasUpdate
});

export { studentCourseCanvasUpdate } from './handler';
export { studentCourseCanvasUpdateManifest } from './manifest';
