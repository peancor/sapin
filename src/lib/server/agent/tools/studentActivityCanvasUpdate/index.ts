import { studentActivityCanvasUpdate } from './handler';
import { studentActivityCanvasUpdateManifest } from './manifest';
import type { BuiltinToolPackage } from '../types';

export const studentActivityCanvasUpdatePackage: BuiltinToolPackage = {
	manifest: studentActivityCanvasUpdateManifest,
	handler: studentActivityCanvasUpdate
};

export { studentActivityCanvasUpdate } from './handler';
export { studentActivityCanvasUpdateManifest } from './manifest';
