import type { BuiltinToolPackage } from '../types';
import { getCourseStudentSignals } from './handler';
import { getCourseStudentSignalsManifest } from './manifest';

export const getCourseStudentSignalsPackage: BuiltinToolPackage = {
	manifest: getCourseStudentSignalsManifest,
	handler: getCourseStudentSignals
};

export { getCourseStudentSignals } from './handler';
export { getCourseStudentSignalsManifest } from './manifest';
