import type { BuiltinToolPackage } from '../types';
import { getActivityDropoutFunnel } from './handler';
import { getActivityDropoutFunnelManifest } from './manifest';

export const getActivityDropoutFunnelPackage: BuiltinToolPackage = {
	manifest: getActivityDropoutFunnelManifest,
	handler: getActivityDropoutFunnel
};
