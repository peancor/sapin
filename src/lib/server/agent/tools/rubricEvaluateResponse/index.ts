import { rubricEvaluateResponse } from './handler';
import { rubricEvaluateResponseManifest } from './manifest';
import type { BuiltinToolPackage } from '../types';

export const rubricEvaluateResponsePackage: BuiltinToolPackage = {
	manifest: rubricEvaluateResponseManifest,
	handler: rubricEvaluateResponse
};
