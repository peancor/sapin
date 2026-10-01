import { clusterInteractionPatterns } from './handler';
import { clusterInteractionPatternsManifest } from './manifest';
import type { BuiltinToolPackage } from '../types';

export const clusterInteractionPatternsPackage: BuiltinToolPackage = {
	manifest: clusterInteractionPatternsManifest,
	handler: clusterInteractionPatterns
};
