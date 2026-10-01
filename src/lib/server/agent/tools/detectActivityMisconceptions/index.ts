import type { BuiltinToolPackage } from '../types';
import { detectActivityMisconceptions } from './handler';
import { detectActivityMisconceptionsManifest } from './manifest';

export const detectActivityMisconceptionsPackage: BuiltinToolPackage = {
	manifest: detectActivityMisconceptionsManifest,
	handler: detectActivityMisconceptions
};
