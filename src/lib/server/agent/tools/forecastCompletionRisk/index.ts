import { forecastCompletionRisk } from './handler';
import { forecastCompletionRiskManifest } from './manifest';
import type { BuiltinToolPackage } from '../types';

export const forecastCompletionRiskPackage: BuiltinToolPackage = {
	manifest: forecastCompletionRiskManifest,
	handler: forecastCompletionRisk
};
