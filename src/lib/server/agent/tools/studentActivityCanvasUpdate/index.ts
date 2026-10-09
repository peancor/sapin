import { studentActivityCanvasUpdate } from './handler';
import { studentActivityCanvasUpdateManifest } from './manifest';
import { defineBuiltinToolPackage } from '../defineBuiltinToolPackage';

export const studentActivityCanvasUpdatePackage = defineBuiltinToolPackage({
	manifest: studentActivityCanvasUpdateManifest,
	handler: studentActivityCanvasUpdate
});

export { studentActivityCanvasUpdate } from './handler';
export { studentActivityCanvasUpdateManifest } from './manifest';
