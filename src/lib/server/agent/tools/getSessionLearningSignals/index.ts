import { defineBuiltinToolPackage } from '../defineBuiltinToolPackage';
import { getSessionLearningSignals } from './handler';
import { getSessionLearningSignalsManifest } from './manifest';

export const getSessionLearningSignalsPackage = defineBuiltinToolPackage({
	manifest: getSessionLearningSignalsManifest,
	handler: getSessionLearningSignals
});
