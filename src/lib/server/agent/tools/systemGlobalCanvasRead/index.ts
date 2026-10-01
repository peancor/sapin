import { systemGlobalCanvasRead } from './handler';
import { systemGlobalCanvasReadManifest } from './manifest';
import type { BuiltinToolPackage } from '../types';

export const systemGlobalCanvasReadPackage: BuiltinToolPackage = {
	manifest: systemGlobalCanvasReadManifest,
	handler: systemGlobalCanvasRead
};

export { systemGlobalCanvasRead } from './handler';
export { systemGlobalCanvasReadManifest } from './manifest';
