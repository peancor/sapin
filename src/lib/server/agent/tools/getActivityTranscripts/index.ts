import { getActivityTranscripts } from './handler';
import { getActivityTranscriptsManifest } from './manifest';
import { defineBuiltinToolPackage } from '../defineBuiltinToolPackage';

export const getActivityTranscriptsPackage = defineBuiltinToolPackage({
	manifest: getActivityTranscriptsManifest,
	handler: getActivityTranscripts
});

export { getActivityTranscripts } from './handler';
export { getActivityTranscriptsManifest } from './manifest';
