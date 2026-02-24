import { db, RoleUtils } from '$lib/server/db';
import { user, course, role, userRoleAssignment } from '$lib/server/db/schema';
import { count, eq, sql, and, isNull, or, gt, gte, lt } from 'drizzle-orm';
import { ROLE_LEVELS } from '$lib/server/roles';
import type { PageServerLoad } from './$types';

function formatTrend(current: number, previous: number): string {
	if (previous === 0) return current > 0 ? '+100%' : '0%';
	const pct = Math.round(((current - previous) / previous) * 100);
	return pct >= 0 ? `+${pct}%` : `${pct}%`;
}

export const load = (async () => {
	// Get total user count
	const totalUsers = await db.select({ count: count() }).from(user);

	// Get role counts from the new system
	const now = new Date();
	const startOfCurrentMonth = new Date(now.getFullYear(), now.getMonth(), 1);
	const startOfPreviousMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1);

	// Count each user only once by highest active role level
	const highestRoleLevelByUser = db
		.select({
			userId: userRoleAssignment.userId,
			maxRoleLevel: sql<number>`max(${role.level})`.as('maxRoleLevel')
		})
		.from(userRoleAssignment)
		.innerJoin(role, eq(userRoleAssignment.roleId, role.id))
		.where(
			and(
				eq(userRoleAssignment.isActive, true),
				eq(role.isActive, true),
				or(isNull(userRoleAssignment.expiresAt), gt(userRoleAssignment.expiresAt, now))
			)
		)
		.groupBy(userRoleAssignment.userId)
		.as('highestRoleLevelByUser');

	const roleCountsResult = await db
		.select({
			admins:
				sql<number>`coalesce(sum(case when ${highestRoleLevelByUser.maxRoleLevel} >= ${ROLE_LEVELS.ADMIN} then 1 else 0 end), 0)`.as(
					'admins'
				),
			teachers:
				sql<number>`coalesce(sum(case when ${highestRoleLevelByUser.maxRoleLevel} >= ${ROLE_LEVELS.TEACHER} and ${highestRoleLevelByUser.maxRoleLevel} < ${ROLE_LEVELS.ADMIN} then 1 else 0 end), 0)`.as(
					'teachers'
				),
			students:
				sql<number>`coalesce(sum(case when ${highestRoleLevelByUser.maxRoleLevel} >= ${ROLE_LEVELS.STUDENT} and ${highestRoleLevelByUser.maxRoleLevel} < ${ROLE_LEVELS.TEACHER} then 1 else 0 end), 0)`.as(
					'students'
				),
			users:
				sql<number>`coalesce(sum(case when ${highestRoleLevelByUser.maxRoleLevel} < ${ROLE_LEVELS.STUDENT} then 1 else 0 end), 0)`.as(
					'users'
				)
		})
		.from(highestRoleLevelByUser);

	const roleCounts = roleCountsResult[0] ?? { admins: 0, teachers: 0, students: 0, users: 0 };

	// Get course stats
	const totalCourses = await db.select({ count: count() }).from(course);

	// Trends: new registrations this month vs previous month
	const [currentMonthUsers] = await db
		.select({ count: count() })
		.from(user)
		.where(gte(user.createdAt, startOfCurrentMonth));
	const [prevMonthUsers] = await db
		.select({ count: count() })
		.from(user)
		.where(and(gte(user.createdAt, startOfPreviousMonth), lt(user.createdAt, startOfCurrentMonth)));

	const [currentMonthCourses] = await db
		.select({ count: count() })
		.from(course)
		.where(gte(course.createdAt, startOfCurrentMonth));
	const [prevMonthCourses] = await db
		.select({ count: count() })
		.from(course)
		.where(and(gte(course.createdAt, startOfPreviousMonth), lt(course.createdAt, startOfCurrentMonth)));

	// Role assignment trends: new assignments this month vs previous month by role level
	const currentMonthRoleAssignments = await db
		.select({ level: role.level, count: count() })
		.from(userRoleAssignment)
		.innerJoin(role, eq(userRoleAssignment.roleId, role.id))
		.where(gte(userRoleAssignment.assignedAt, startOfCurrentMonth))
		.groupBy(role.level);
	const prevMonthRoleAssignments = await db
		.select({ level: role.level, count: count() })
		.from(userRoleAssignment)
		.innerJoin(role, eq(userRoleAssignment.roleId, role.id))
		.where(and(gte(userRoleAssignment.assignedAt, startOfPreviousMonth), lt(userRoleAssignment.assignedAt, startOfCurrentMonth)))
		.groupBy(role.level);

	const currentByLevel = Object.fromEntries(currentMonthRoleAssignments.map((r) => [r.level, r.count]));
	const prevByLevel = Object.fromEntries(prevMonthRoleAssignments.map((r) => [r.level, r.count]));

	const currentStudentAssignments = Object.entries(currentByLevel)
		.filter(([lvl]) => Number(lvl) >= ROLE_LEVELS.STUDENT && Number(lvl) < ROLE_LEVELS.TEACHER)
		.reduce((s, [, c]) => s + c, 0);
	const prevStudentAssignments = Object.entries(prevByLevel)
		.filter(([lvl]) => Number(lvl) >= ROLE_LEVELS.STUDENT && Number(lvl) < ROLE_LEVELS.TEACHER)
		.reduce((s, [, c]) => s + c, 0);

	const currentTeacherAssignments = Object.entries(currentByLevel)
		.filter(([lvl]) => Number(lvl) >= ROLE_LEVELS.TEACHER && Number(lvl) < ROLE_LEVELS.ADMIN)
		.reduce((s, [, c]) => s + c, 0);
	const prevTeacherAssignments = Object.entries(prevByLevel)
		.filter(([lvl]) => Number(lvl) >= ROLE_LEVELS.TEACHER && Number(lvl) < ROLE_LEVELS.ADMIN)
		.reduce((s, [, c]) => s + c, 0);

	const trends = {
		totalUsers: formatTrend(currentMonthUsers?.count ?? 0, prevMonthUsers?.count ?? 0),
		students: formatTrend(currentStudentAssignments, prevStudentAssignments),
		teachers: formatTrend(currentTeacherAssignments, prevTeacherAssignments),
		courses: formatTrend(currentMonthCourses?.count ?? 0, prevMonthCourses?.count ?? 0)
	};

	// Get recent users (last 5) with their roles
	const recentUsersBase = await db
		.select({
			id: user.id,
			username: user.username,
			email: user.email,
			createdAt: user.createdAt,
			image: user.image
		})
		.from(user)
		.orderBy(sql`${user.createdAt} DESC`)
		.limit(5);

	// Load roles for each recent user
	const recentUsers = await Promise.all(
		recentUsersBase.map(async (u) => {
			const roles = await RoleUtils.getUserRoles(u.id);
			const highestRole = roles.length > 0
				? roles.reduce((max, r) => r.level > max.level ? r : max)
				: null;
			return {
				...u,
				roles,
				highestRole
			};
		})
	);

	return {
		trends,
		stats: {
			totalUsers: totalUsers[0]?.count ?? 0,
			students: roleCounts.students,
			teachers: roleCounts.teachers,
			admins: roleCounts.admins,
			users: roleCounts.users,
			totalCourses: totalCourses[0]?.count ?? 0
		},
		recentUsers
	};
}) satisfies PageServerLoad;
