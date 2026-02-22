import { db, RoleUtils } from '$lib/server/db';
import { user, course, role, userRoleAssignment } from '$lib/server/db/schema';
import { count, eq, sql, and, isNull, or, gt } from 'drizzle-orm';
import type { PageServerLoad } from './$types';

export const load = (async () => {
	// Get total user count
	const totalUsers = await db.select({ count: count() }).from(user);

	// Get role counts from the new system
	const now = new Date();
	
	// Count users by their highest role level
	const roleCountsQuery = await db
		.select({
			roleName: role.name,
			roleLevel: role.level,
			count: count()
		})
		.from(userRoleAssignment)
		.innerJoin(role, eq(userRoleAssignment.roleId, role.id))
		.where(
			and(
				eq(userRoleAssignment.isActive, true),
				eq(role.isActive, true),
				or(
					isNull(userRoleAssignment.expiresAt),
					gt(userRoleAssignment.expiresAt, now)
				)
			)
		)
		.groupBy(role.name, role.level);
	
	// Aggregate counts by role type
	const roleCounts = roleCountsQuery.reduce((acc, r) => {
		if (r.roleLevel >= 90) acc.admins += r.count;
		else if (r.roleLevel >= 50) acc.teachers += r.count;
		else if (r.roleLevel >= 10) acc.students += r.count;
		else acc.users += r.count;
		return acc;
	}, { admins: 0, teachers: 0, students: 0, users: 0 });

	// Get course stats
	const totalCourses = await db.select({ count: count() }).from(course);

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
