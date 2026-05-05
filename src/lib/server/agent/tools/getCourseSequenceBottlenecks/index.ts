import type { BuiltinToolPackage } from '../types';
import { getCourseSequenceBottlenecks } from './handler';
import { getCourseSequenceBottlenecksManifest } from './manifest';

export const getCourseSequenceBottlenecksPackage: BuiltinToolPackage = {
	manifest: getCourseSequenceBottlenecksManifest,
	handler: getCourseSequenceBottlenecks
};
