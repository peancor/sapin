import { findStuckSessions } from './handler';
import { findStuckSessionsManifest } from './manifest';
import type { BuiltinToolPackage } from '../types';

export const findStuckSessionsPackage: BuiltinToolPackage = {
	manifest: findStuckSessionsManifest,
	handler: findStuckSessions
};
