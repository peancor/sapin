import { defineBuiltinToolPackage } from '../defineBuiltinToolPackage';
import { getCourseStudentSignals } from './handler';
import { getCourseStudentSignalsManifest } from './manifest';

export const getCourseStudentSignalsPackage = defineBuiltinToolPackage({
	manifest: getCourseStudentSignalsManifest,
	handler: getCourseStudentSignals
});

export { getCourseStudentSignals } from './handler';
export { getCourseStudentSignalsManifest } from './manifest';
