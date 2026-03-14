import { studentActivityMemory } from './handler';
import { studentActivityMemoryManifest } from './manifest';
import type { BuiltinToolPackage } from '../types';

export const studentActivityMemoryPackage: BuiltinToolPackage = {
	manifest: studentActivityMemoryManifest,
	handler: studentActivityMemory
};

export { studentActivityMemory } from './handler';
export { studentActivityMemoryManifest } from './manifest';
