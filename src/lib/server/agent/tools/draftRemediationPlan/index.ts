import { draftRemediationPlan } from './handler';
import { draftRemediationPlanManifest } from './manifest';
import { defineBuiltinToolPackage } from '../defineBuiltinToolPackage';

export const draftRemediationPlanPackage = defineBuiltinToolPackage({
	manifest: draftRemediationPlanManifest,
	handler: draftRemediationPlan
});
