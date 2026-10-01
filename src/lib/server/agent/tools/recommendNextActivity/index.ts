import { recommendNextActivity } from './handler';
import { recommendNextActivityManifest } from './manifest';
import type { BuiltinToolPackage } from '../types';

export const recommendNextActivityPackage: BuiltinToolPackage = {
	manifest: recommendNextActivityManifest,
	handler: recommendNextActivity
};
