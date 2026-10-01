import type { BuiltinToolPackage } from '../types';
import { getActivityNonStarters } from './handler';
import { getActivityNonStartersManifest } from './manifest';

export const getActivityNonStartersPackage: BuiltinToolPackage = {
	manifest: getActivityNonStartersManifest,
	handler: getActivityNonStarters
};
