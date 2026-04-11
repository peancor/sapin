import type { BuiltinToolPackage } from '../types';
import { analyzeToolFrictionHotspots } from './handler';
import { analyzeToolFrictionHotspotsManifest } from './manifest';

export const analyzeToolFrictionHotspotsPackage: BuiltinToolPackage = {
	manifest: analyzeToolFrictionHotspotsManifest,
	handler: analyzeToolFrictionHotspots
};
