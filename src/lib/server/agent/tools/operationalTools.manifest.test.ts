import test from 'node:test';
import assert from 'node:assert/strict';

import { analyzeToolFrictionHotspotsManifest } from './analyzeToolFrictionHotspots/manifest.ts';
import { detectActivityMisconceptionsManifest } from './detectActivityMisconceptions/manifest.ts';
import { getActivityDropoutFunnelManifest } from './getActivityDropoutFunnel/manifest.ts';
import { getActivityNonStartersManifest } from './getActivityNonStarters/manifest.ts';
import { getCourseSequenceBottlenecksManifest } from './getCourseSequenceBottlenecks/manifest.ts';
import { getRubricCoverageGapsManifest } from './getRubricCoverageGaps/manifest.ts';
import { getStudentAttemptHistoryManifest } from './getStudentAttemptHistory/manifest.ts';
import { getTeacherInterventionQueueManifest } from './getTeacherInterventionQueue/manifest.ts';
import { measureResponseDepthManifest } from './measureResponseDepth/manifest.ts';
import { recommendGroupInterventionsManifest } from './recommendGroupInterventions/manifest.ts';

const manifests = [
	getActivityNonStartersManifest,
	getActivityDropoutFunnelManifest,
	getStudentAttemptHistoryManifest,
	analyzeToolFrictionHotspotsManifest,
	getTeacherInterventionQueueManifest,
	getCourseSequenceBottlenecksManifest,
	detectActivityMisconceptionsManifest,
	measureResponseDepthManifest,
	getRubricCoverageGapsManifest,
	recommendGroupInterventionsManifest
];

test('new operational manifests have unique names and builtin executors', () => {
	const names = manifests.map((manifest) => manifest.name);
	assert.equal(new Set(names).size, manifests.length);
	assert.equal(manifests.every((manifest) => manifest.executorType === 'builtin'), true);
	assert.equal(manifests.every((manifest) => manifest.requiresConfirmation === false), true);
});

test('operational manifests use expected domains', () => {
	const staffAgentTools = new Set([
		'get_teacher_intervention_queue',
		'get_course_sequence_bottlenecks',
		'recommend_group_interventions'
	]);

	for (const manifest of manifests) {
		if (staffAgentTools.has(manifest.name)) {
			assert.equal(manifest.usageDomain, 'staff_agent');
		} else {
			assert.equal(manifest.usageDomain, 'insights');
		}
	}
});
