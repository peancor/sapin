import { defineBuiltinToolPackage } from '../defineBuiltinToolPackage';
import { recommendGroupInterventions } from './handler';
import { recommendGroupInterventionsManifest } from './manifest';

export const recommendGroupInterventionsPackage = defineBuiltinToolPackage({
	manifest: recommendGroupInterventionsManifest,
	handler: recommendGroupInterventions
});
