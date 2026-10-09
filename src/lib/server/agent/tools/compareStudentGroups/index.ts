import { compareStudentGroups } from './handler';
import { compareStudentGroupsManifest } from './manifest';
import { defineBuiltinToolPackage } from '../defineBuiltinToolPackage';

export const compareStudentGroupsPackage = defineBuiltinToolPackage({
	manifest: compareStudentGroupsManifest,
	handler: compareStudentGroups
});
