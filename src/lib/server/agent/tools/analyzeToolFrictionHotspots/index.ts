import { defineBuiltinToolPackage } from '../defineBuiltinToolPackage';
import { analyzeToolFrictionHotspots } from './handler';
import { analyzeToolFrictionHotspotsManifest } from './manifest';

export const analyzeToolFrictionHotspotsPackage = defineBuiltinToolPackage({
	manifest: analyzeToolFrictionHotspotsManifest,
	handler: analyzeToolFrictionHotspots
});
