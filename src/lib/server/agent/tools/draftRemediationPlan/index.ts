import { draftRemediationPlan } from './handler';
import { draftRemediationPlanManifest } from './manifest';
import type { BuiltinToolPackage } from '../types';

export const draftRemediationPlanPackage: BuiltinToolPackage = {
	manifest: draftRemediationPlanManifest,
	handler: draftRemediationPlan
};
