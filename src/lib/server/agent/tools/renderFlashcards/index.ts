import { renderFlashcardsManifest } from './manifest';
import type { BuiltinToolPackage } from '../types';

export const renderFlashcardsPackage: BuiltinToolPackage = {
	manifest: renderFlashcardsManifest
};

export { renderFlashcardsManifest } from './manifest';

