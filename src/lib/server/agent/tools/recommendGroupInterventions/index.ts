import type { BuiltinToolPackage } from '../types';
import { recommendGroupInterventions } from './handler';
import { recommendGroupInterventionsManifest } from './manifest';

export const recommendGroupInterventionsPackage: BuiltinToolPackage = {
	manifest: recommendGroupInterventionsManifest,
	handler: recommendGroupInterventions
};
