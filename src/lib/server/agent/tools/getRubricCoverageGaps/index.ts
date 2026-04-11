import type { BuiltinToolPackage } from '../types';
import { getRubricCoverageGaps } from './handler';
import { getRubricCoverageGapsManifest } from './manifest';

export const getRubricCoverageGapsPackage: BuiltinToolPackage = {
	manifest: getRubricCoverageGapsManifest,
	handler: getRubricCoverageGaps
};
