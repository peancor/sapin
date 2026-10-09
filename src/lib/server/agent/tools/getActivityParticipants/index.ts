import { defineBuiltinToolPackage } from '../defineBuiltinToolPackage';
import { getActivityParticipants } from './handler';
import { getActivityParticipantsManifest } from './manifest';

export const getActivityParticipantsPackage = defineBuiltinToolPackage({
	manifest: getActivityParticipantsManifest,
	handler: getActivityParticipants
});

export { getActivityParticipants } from './handler';
export { getActivityParticipantsManifest } from './manifest';
