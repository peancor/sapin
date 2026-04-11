import type { BuiltinToolPackage } from '../types';
import { getStudentAttemptHistory } from './handler';
import { getStudentAttemptHistoryManifest } from './manifest';

export const getStudentAttemptHistoryPackage: BuiltinToolPackage = {
	manifest: getStudentAttemptHistoryManifest,
	handler: getStudentAttemptHistory
};
