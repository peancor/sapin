import { findInconsistentGradingCases } from './handler';
import { findInconsistentGradingCasesManifest } from './manifest';
import type { BuiltinToolPackage } from '../types';

export const findInconsistentGradingCasesPackage: BuiltinToolPackage = {
	manifest: findInconsistentGradingCasesManifest,
	handler: findInconsistentGradingCases
};
