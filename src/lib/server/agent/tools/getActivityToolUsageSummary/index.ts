import { getActivityToolUsageSummary } from './handler';
import { getActivityToolUsageSummaryManifest } from './manifest';
import type { BuiltinToolPackage } from '../types';

export const getActivityToolUsageSummaryPackage: BuiltinToolPackage = {
	manifest: getActivityToolUsageSummaryManifest,
	handler: getActivityToolUsageSummary
};
