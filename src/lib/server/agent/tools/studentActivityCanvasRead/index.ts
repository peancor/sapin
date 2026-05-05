import { studentActivityCanvasRead } from './handler';
import { studentActivityCanvasReadManifest } from './manifest';
import type { BuiltinToolPackage } from '../types';

export const studentActivityCanvasReadPackage: BuiltinToolPackage = {
	manifest: studentActivityCanvasReadManifest,
	handler: studentActivityCanvasRead
};

export { studentActivityCanvasRead } from './handler';
export { studentActivityCanvasReadManifest } from './manifest';
