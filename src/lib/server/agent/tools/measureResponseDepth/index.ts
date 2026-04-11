import type { BuiltinToolPackage } from '../types';
import { measureResponseDepth } from './handler';
import { measureResponseDepthManifest } from './manifest';

export const measureResponseDepthPackage: BuiltinToolPackage = {
	manifest: measureResponseDepthManifest,
	handler: measureResponseDepth
};
