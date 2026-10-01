import { renderWorkingMemoryTestManifest } from './manifest';
import type { BuiltinToolPackage } from '../types';

export const renderWorkingMemoryTestPackage: BuiltinToolPackage = {
	manifest: renderWorkingMemoryTestManifest
};

export { renderWorkingMemoryTestManifest } from './manifest';
