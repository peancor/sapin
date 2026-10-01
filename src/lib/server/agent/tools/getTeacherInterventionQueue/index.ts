import type { BuiltinToolPackage } from '../types';
import { getTeacherInterventionQueue } from './handler';
import { getTeacherInterventionQueueManifest } from './manifest';

export const getTeacherInterventionQueuePackage: BuiltinToolPackage = {
	manifest: getTeacherInterventionQueueManifest,
	handler: getTeacherInterventionQueue
};
