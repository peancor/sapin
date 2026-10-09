import { saveGrade } from './handler';
import { saveGradeManifest } from './manifest';
import { defineBuiltinToolPackage } from '../defineBuiltinToolPackage';

export const saveGradePackage = defineBuiltinToolPackage({
	manifest: saveGradeManifest,
	handler: saveGrade
});

export { saveGrade } from './handler';
export { saveGradeManifest } from './manifest';
