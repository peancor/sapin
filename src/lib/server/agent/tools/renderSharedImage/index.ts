import { renderSharedImageManifest } from './manifest';
import type { BuiltinToolPackage } from '../types';

export const renderSharedImagePackage: BuiltinToolPackage = {
	manifest: renderSharedImageManifest
};

export { renderSharedImageManifest } from './manifest';

