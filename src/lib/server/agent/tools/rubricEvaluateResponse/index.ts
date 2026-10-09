import { rubricEvaluateResponse } from './handler';
import { rubricEvaluateResponseManifest } from './manifest';
import { defineBuiltinToolPackage } from '../defineBuiltinToolPackage';

export const rubricEvaluateResponsePackage = defineBuiltinToolPackage({
	manifest: rubricEvaluateResponseManifest,
	handler: rubricEvaluateResponse
});
