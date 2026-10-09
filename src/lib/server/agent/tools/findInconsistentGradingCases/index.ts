import { findInconsistentGradingCases } from './handler';
import { findInconsistentGradingCasesManifest } from './manifest';
import { defineBuiltinToolPackage } from '../defineBuiltinToolPackage';

export const findInconsistentGradingCasesPackage = defineBuiltinToolPackage({
	manifest: findInconsistentGradingCasesManifest,
	handler: findInconsistentGradingCases
});
