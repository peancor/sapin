import { defineBuiltinToolPackage } from '../defineBuiltinToolPackage';
import { getActivityDropoutFunnel } from './handler';
import { getActivityDropoutFunnelManifest } from './manifest';

export const getActivityDropoutFunnelPackage = defineBuiltinToolPackage({
	manifest: getActivityDropoutFunnelManifest,
	handler: getActivityDropoutFunnel
});
