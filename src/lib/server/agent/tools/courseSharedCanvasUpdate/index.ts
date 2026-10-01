import { courseSharedCanvasUpdate } from './handler';
import { courseSharedCanvasUpdateManifest } from './manifest';
import type { BuiltinToolPackage } from '../types';

export const courseSharedCanvasUpdatePackage: BuiltinToolPackage = {
	manifest: courseSharedCanvasUpdateManifest,
	handler: courseSharedCanvasUpdate
};

export { courseSharedCanvasUpdate } from './handler';
export { courseSharedCanvasUpdateManifest } from './manifest';
