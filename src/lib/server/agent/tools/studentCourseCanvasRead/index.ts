import { studentCourseCanvasRead } from './handler';
import { studentCourseCanvasReadManifest } from './manifest';
import { defineBuiltinToolPackage } from '../defineBuiltinToolPackage';

export const studentCourseCanvasReadPackage = defineBuiltinToolPackage({
	manifest: studentCourseCanvasReadManifest,
	handler: studentCourseCanvasRead
});

export { studentCourseCanvasRead } from './handler';
export { studentCourseCanvasReadManifest } from './manifest';
