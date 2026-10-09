import { courseSharedCanvasRead } from './handler';
import { courseSharedCanvasReadManifest } from './manifest';
import { defineBuiltinToolPackage } from '../defineBuiltinToolPackage';

export const courseSharedCanvasReadPackage = defineBuiltinToolPackage({
	manifest: courseSharedCanvasReadManifest,
	handler: courseSharedCanvasRead
});

export { courseSharedCanvasRead } from './handler';
export { courseSharedCanvasReadManifest } from './manifest';
