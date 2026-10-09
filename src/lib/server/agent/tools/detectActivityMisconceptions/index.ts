import { defineBuiltinToolPackage } from '../defineBuiltinToolPackage';
import { detectActivityMisconceptions } from './handler';
import { detectActivityMisconceptionsManifest } from './manifest';

export const detectActivityMisconceptionsPackage = defineBuiltinToolPackage({
	manifest: detectActivityMisconceptionsManifest,
	handler: detectActivityMisconceptions
});
