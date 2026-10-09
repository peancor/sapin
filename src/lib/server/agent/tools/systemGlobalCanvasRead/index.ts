import { systemGlobalCanvasRead } from './handler';
import { systemGlobalCanvasReadManifest } from './manifest';
import { defineBuiltinToolPackage } from '../defineBuiltinToolPackage';

export const systemGlobalCanvasReadPackage = defineBuiltinToolPackage({
	manifest: systemGlobalCanvasReadManifest,
	handler: systemGlobalCanvasRead
});

export { systemGlobalCanvasRead } from './handler';
export { systemGlobalCanvasReadManifest } from './manifest';
