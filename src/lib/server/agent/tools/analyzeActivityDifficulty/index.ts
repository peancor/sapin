import { analyzeActivityDifficulty } from './handler';
import { analyzeActivityDifficultyManifest } from './manifest';
import { defineBuiltinToolPackage } from '../defineBuiltinToolPackage';

export const analyzeActivityDifficultyPackage = defineBuiltinToolPackage({
	manifest: analyzeActivityDifficultyManifest,
	handler: analyzeActivityDifficulty
});
