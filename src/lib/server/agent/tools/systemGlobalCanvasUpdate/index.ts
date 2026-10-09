import { systemGlobalCanvasUpdate } from './handler';
import { systemGlobalCanvasUpdateManifest } from './manifest';
import { defineBuiltinToolPackage } from '../defineBuiltinToolPackage';

export const systemGlobalCanvasUpdatePackage = defineBuiltinToolPackage({
	manifest: systemGlobalCanvasUpdateManifest,
	handler: systemGlobalCanvasUpdate
});

export { systemGlobalCanvasUpdate } from './handler';
export { systemGlobalCanvasUpdateManifest } from './manifest';
