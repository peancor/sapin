import assert from 'node:assert/strict';
import test from 'node:test';
import { distinctCourseStudents } from './courseStudentRoster';

test('student roster groups people without changing their role assignments', () => {
	const assignments = [
		{ assignmentId: 'teaching', userId: 'a', role: 'teacher' },
		{ assignmentId: 'student-a-new', userId: 'a', role: 'student' },
		{ assignmentId: 'student-b', userId: 'b', role: 'student' },
		{ assignmentId: 'student-a-old', userId: 'a', role: 'student' },
		{ assignmentId: 'assistant', userId: 'c', role: 'assistant' }
	];
	const original = structuredClone(assignments);
	assert.deepEqual(distinctCourseStudents(assignments), [assignments[1], assignments[2]]);
	assert.deepEqual(assignments, original);
});

test('student roster is empty when there are no student assignments', () => {
	assert.deepEqual(distinctCourseStudents([]), []);
	assert.deepEqual(distinctCourseStudents([{ userId: 'a', role: 'teacher' }]), []);
});
