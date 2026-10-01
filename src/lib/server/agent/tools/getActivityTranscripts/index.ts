import { getActivityTranscripts } from './handler';
import { getActivityTranscriptsManifest } from './manifest';
import type { BuiltinToolPackage } from '../types';

export const getActivityTranscriptsPackage: BuiltinToolPackage = {
	manifest: getActivityTranscriptsManifest,
	handler: getActivityTranscripts
};

export { getActivityTranscripts } from './handler';
export { getActivityTranscriptsManifest } from './manifest';
