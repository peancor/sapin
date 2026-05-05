import { saveGrade } from './handler';
import { saveGradeManifest } from './manifest';
import type { BuiltinToolPackage } from '../types';

export const saveGradePackage: BuiltinToolPackage = {
	manifest: saveGradeManifest,
	handler: saveGrade
};

export { saveGrade } from './handler';
export { saveGradeManifest } from './manifest';

