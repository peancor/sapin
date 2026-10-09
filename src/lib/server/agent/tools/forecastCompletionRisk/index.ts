import { forecastCompletionRisk } from './handler';
import { forecastCompletionRiskManifest } from './manifest';
import { defineBuiltinToolPackage } from '../defineBuiltinToolPackage';

export const forecastCompletionRiskPackage = defineBuiltinToolPackage({
	manifest: forecastCompletionRiskManifest,
	handler: forecastCompletionRisk
});
