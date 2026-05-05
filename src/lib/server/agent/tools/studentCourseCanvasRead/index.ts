import { studentCourseCanvasRead } from './handler';
import { studentCourseCanvasReadManifest } from './manifest';
import type { BuiltinToolPackage } from '../types';

export const studentCourseCanvasReadPackage: BuiltinToolPackage = {
	manifest: studentCourseCanvasReadManifest,
	handler: studentCourseCanvasRead
};

export { studentCourseCanvasRead } from './handler';
export { studentCourseCanvasReadManifest } from './manifest';
