import { storeStudentActivityMemory } from './handler';
import { storeStudentActivityMemoryManifest } from './manifest';
import type { BuiltinToolPackage } from '../types';

export const storeStudentActivityMemoryPackage: BuiltinToolPackage = {
	manifest: storeStudentActivityMemoryManifest,
	handler: storeStudentActivityMemory
};

export { storeStudentActivityMemory } from './handler';
export { storeStudentActivityMemoryManifest } from './manifest';
