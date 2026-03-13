import { getStudentActivityMemoryContext } from './handler';
import { getStudentActivityMemoryContextManifest } from './manifest';
import type { BuiltinToolPackage } from '../types';

export const getStudentActivityMemoryContextPackage: BuiltinToolPackage = {
	manifest: getStudentActivityMemoryContextManifest,
	handler: getStudentActivityMemoryContext
};

export { getStudentActivityMemoryContext } from './handler';
export { getStudentActivityMemoryContextManifest } from './manifest';
