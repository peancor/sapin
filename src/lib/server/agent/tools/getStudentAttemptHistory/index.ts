import { defineBuiltinToolPackage } from '../defineBuiltinToolPackage';
import { getStudentAttemptHistory } from './handler';
import { getStudentAttemptHistoryManifest } from './manifest';

export const getStudentAttemptHistoryPackage = defineBuiltinToolPackage({
	manifest: getStudentAttemptHistoryManifest,
	handler: getStudentAttemptHistory
});
