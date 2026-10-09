import { studentActivityCanvasRead } from './handler';
import { studentActivityCanvasReadManifest } from './manifest';
import { defineBuiltinToolPackage } from '../defineBuiltinToolPackage';

export const studentActivityCanvasReadPackage = defineBuiltinToolPackage({
	manifest: studentActivityCanvasReadManifest,
	handler: studentActivityCanvasRead
});

export { studentActivityCanvasRead } from './handler';
export { studentActivityCanvasReadManifest } from './manifest';
