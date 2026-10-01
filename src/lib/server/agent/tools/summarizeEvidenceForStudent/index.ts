import { summarizeEvidenceForStudent } from './handler';
import { summarizeEvidenceForStudentManifest } from './manifest';
import type { BuiltinToolPackage } from '../types';

export const summarizeEvidenceForStudentPackage: BuiltinToolPackage = {
	manifest: summarizeEvidenceForStudentManifest,
	handler: summarizeEvidenceForStudent
};
