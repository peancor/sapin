import { courseSharedCanvasRead } from './handler';
import { courseSharedCanvasReadManifest } from './manifest';
import type { BuiltinToolPackage } from '../types';

export const courseSharedCanvasReadPackage: BuiltinToolPackage = {
	manifest: courseSharedCanvasReadManifest,
	handler: courseSharedCanvasRead
};

export { courseSharedCanvasRead } from './handler';
export { courseSharedCanvasReadManifest } from './manifest';
