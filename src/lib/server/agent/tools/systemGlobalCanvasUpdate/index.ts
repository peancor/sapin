import { systemGlobalCanvasUpdate } from './handler';
import { systemGlobalCanvasUpdateManifest } from './manifest';
import type { BuiltinToolPackage } from '../types';

export const systemGlobalCanvasUpdatePackage: BuiltinToolPackage = {
	manifest: systemGlobalCanvasUpdateManifest,
	handler: systemGlobalCanvasUpdate
};

export { systemGlobalCanvasUpdate } from './handler';
export { systemGlobalCanvasUpdateManifest } from './manifest';
