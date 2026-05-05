import { getActivityEvidenceOverview } from './handler';
import { getActivityEvidenceOverviewManifest } from './manifest';
import type { BuiltinToolPackage } from '../types';

export const getActivityEvidenceOverviewPackage: BuiltinToolPackage = {
	manifest: getActivityEvidenceOverviewManifest,
	handler: getActivityEvidenceOverview
};

export { getActivityEvidenceOverview } from './handler';
export { getActivityEvidenceOverviewManifest } from './manifest';
