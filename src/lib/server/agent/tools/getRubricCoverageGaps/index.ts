import { defineBuiltinToolPackage } from '../defineBuiltinToolPackage';
import { getRubricCoverageGaps } from './handler';
import { getRubricCoverageGapsManifest } from './manifest';

export const getRubricCoverageGapsPackage = defineBuiltinToolPackage({
	manifest: getRubricCoverageGapsManifest,
	handler: getRubricCoverageGaps
});
