import { compareStudentGroups } from './handler';
import { compareStudentGroupsManifest } from './manifest';
import type { BuiltinToolPackage } from '../types';

export const compareStudentGroupsPackage: BuiltinToolPackage = {
	manifest: compareStudentGroupsManifest,
	handler: compareStudentGroups
};
