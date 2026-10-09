import { courseSharedCanvasUpdate } from './handler';
import { courseSharedCanvasUpdateManifest } from './manifest';
import { defineBuiltinToolPackage } from '../defineBuiltinToolPackage';

export const courseSharedCanvasUpdatePackage = defineBuiltinToolPackage({
	manifest: courseSharedCanvasUpdateManifest,
	handler: courseSharedCanvasUpdate
});

export { courseSharedCanvasUpdate } from './handler';
export { courseSharedCanvasUpdateManifest } from './manifest';
