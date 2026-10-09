import { clusterInteractionPatterns } from './handler';
import { clusterInteractionPatternsManifest } from './manifest';
import { defineBuiltinToolPackage } from '../defineBuiltinToolPackage';

export const clusterInteractionPatternsPackage = defineBuiltinToolPackage({
	manifest: clusterInteractionPatternsManifest,
	handler: clusterInteractionPatterns
});
