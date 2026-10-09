import { defineBuiltinToolPackage } from '../defineBuiltinToolPackage';
import { getActivityNonStarters } from './handler';
import { getActivityNonStartersManifest } from './manifest';

export const getActivityNonStartersPackage = defineBuiltinToolPackage({
	manifest: getActivityNonStartersManifest,
	handler: getActivityNonStarters
});
