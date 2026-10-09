import { recommendNextActivity } from './handler';
import { recommendNextActivityManifest } from './manifest';
import { defineBuiltinToolPackage } from '../defineBuiltinToolPackage';

export const recommendNextActivityPackage = defineBuiltinToolPackage({
	manifest: recommendNextActivityManifest,
	handler: recommendNextActivity
});
