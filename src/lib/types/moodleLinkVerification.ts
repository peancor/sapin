export interface MoodleLinkVerification {
	kind: 'moodle-link-verification';
	activityId: string;
	activityName: string;
	activityType: string;
	activityStatus: string;
	courseId: string | null;
	courseName: string | null;
	parameterName: 'id' | 'externalId' | 'externalid' | null;
	parameterValue: string | null;
	isLegacyParameter: boolean;
	hasIdentifier: boolean;
	hasValidIdentifier: boolean;
}
