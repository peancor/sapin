/** Builds a roster of people from the active assignments returned by getCourseUsers.
 * Keep the original assignments for role management; this projection is only for student views.
 */
export function distinctCourseStudents<T extends { userId: string; role: string }>(
	assignments: readonly T[]
): T[] {
	const seen = new Set<string>();
	return assignments.filter((assignment) => {
		if (assignment.role !== 'student' || seen.has(assignment.userId)) return false;
		seen.add(assignment.userId);
		return true;
	});
}
