import { defineBuiltinToolPackage } from '../defineBuiltinToolPackage';
import { measureResponseDepth } from './handler';
import { measureResponseDepthManifest } from './manifest';

export const measureResponseDepthPackage = defineBuiltinToolPackage({
	manifest: measureResponseDepthManifest,
	handler: measureResponseDepth
});
