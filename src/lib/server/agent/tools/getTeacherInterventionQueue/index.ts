import { defineBuiltinToolPackage } from '../defineBuiltinToolPackage';
import { getTeacherInterventionQueue } from './handler';
import { getTeacherInterventionQueueManifest } from './manifest';

export const getTeacherInterventionQueuePackage = defineBuiltinToolPackage({
	manifest: getTeacherInterventionQueueManifest,
	handler: getTeacherInterventionQueue
});
