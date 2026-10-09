import { findStuckSessions } from './handler';
import { findStuckSessionsManifest } from './manifest';
import { defineBuiltinToolPackage } from '../defineBuiltinToolPackage';

export const findStuckSessionsPackage = defineBuiltinToolPackage({
	manifest: findStuckSessionsManifest,
	handler: findStuckSessions
});
