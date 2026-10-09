import { getActivityToolUsageSummary } from './handler';
import { getActivityToolUsageSummaryManifest } from './manifest';
import { defineBuiltinToolPackage } from '../defineBuiltinToolPackage';

export const getActivityToolUsageSummaryPackage = defineBuiltinToolPackage({
	manifest: getActivityToolUsageSummaryManifest,
	handler: getActivityToolUsageSummary
});
