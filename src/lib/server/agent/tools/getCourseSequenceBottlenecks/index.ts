import { defineBuiltinToolPackage } from '../defineBuiltinToolPackage';
import { getCourseSequenceBottlenecks } from './handler';
import { getCourseSequenceBottlenecksManifest } from './manifest';

export const getCourseSequenceBottlenecksPackage = defineBuiltinToolPackage({
	manifest: getCourseSequenceBottlenecksManifest,
	handler: getCourseSequenceBottlenecks
});
