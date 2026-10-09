import { summarizeEvidenceForStudent } from './handler';
import { summarizeEvidenceForStudentManifest } from './manifest';
import { defineBuiltinToolPackage } from '../defineBuiltinToolPackage';

export const summarizeEvidenceForStudentPackage = defineBuiltinToolPackage({
	manifest: summarizeEvidenceForStudentManifest,
	handler: summarizeEvidenceForStudent
});
