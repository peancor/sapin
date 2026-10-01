import { analyzeActivityDifficulty } from './handler';
import { analyzeActivityDifficultyManifest } from './manifest';
import type { BuiltinToolPackage } from '../types';

export const analyzeActivityDifficultyPackage: BuiltinToolPackage = {
	manifest: analyzeActivityDifficultyManifest,
	handler: analyzeActivityDifficulty
};
