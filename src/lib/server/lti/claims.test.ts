import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
	LTI_CLAIMS,
	classifyLtiRoles,
	getLtiContextId,
	getLtiCustom,
	getLtiDeploymentId,
	getLtiResourceLinkId,
	ltiAudiencesInclude,
	type LtiLaunchClaims
} from './claims.ts';

describe('LTI claims helpers', () => {
	it('maps Moodle learner and instructor roles', () => {
		assert.equal(
			classifyLtiRoles(['http://purl.imsglobal.org/vocab/lis/v2/membership#Learner']),
			'learner'
		);
		assert.equal(
			classifyLtiRoles(['http://purl.imsglobal.org/vocab/lis/v2/membership#Instructor']),
			'instructor'
		);
		assert.equal(
			classifyLtiRoles(['http://purl.imsglobal.org/vocab/lis/v2/system/person#Administrator']),
			'admin'
		);
	});

	it('reads required launch fields from namespaced LTI claims', () => {
		const claims = {
			iss: 'https://moodle.example.edu',
			sub: '42',
			aud: ['client-id'],
			[LTI_CLAIMS.DEPLOYMENT_ID]: 'deployment-1',
			[LTI_CLAIMS.CONTEXT]: { id: 'course-context' },
			[LTI_CLAIMS.RESOURCE_LINK]: { id: 'resource-link' },
			[LTI_CLAIMS.CUSTOM]: {
				sapin_course_id: 'course-1',
				sapin_activity_id: 'activity-1'
			}
		} satisfies LtiLaunchClaims;

		assert.equal(getLtiDeploymentId(claims), 'deployment-1');
		assert.equal(getLtiContextId(claims), 'course-context');
		assert.equal(getLtiResourceLinkId(claims), 'resource-link');
		assert.equal(getLtiCustom(claims).sapin_activity_id, 'activity-1');
		assert.equal(ltiAudiencesInclude(claims.aud, 'client-id'), true);
	});
});
