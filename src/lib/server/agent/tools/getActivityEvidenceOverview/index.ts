import { getActivityEvidenceOverview } from './handler';
import { getActivityEvidenceOverviewManifest } from './manifest';
import { defineBuiltinToolPackage } from '../defineBuiltinToolPackage';

export const getActivityEvidenceOverviewPackage = defineBuiltinToolPackage({
	manifest: getActivityEvidenceOverviewManifest,
	handler: getActivityEvidenceOverview
});

export { getActivityEvidenceOverview } from './handler';
export { getActivityEvidenceOverviewManifest } from './manifest';
