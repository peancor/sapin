import type { BuiltinToolPackage } from '../types';
import { getActivityParticipants } from './handler';
import { getActivityParticipantsManifest } from './manifest';

export const getActivityParticipantsPackage: BuiltinToolPackage = {
	manifest: getActivityParticipantsManifest,
	handler: getActivityParticipants
};

export { getActivityParticipants } from './handler';
export { getActivityParticipantsManifest } from './manifest';
