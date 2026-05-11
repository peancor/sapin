import type { PageServerLoad } from './$types';
import DBChatUtils from '$lib/server/db/DBChatUtils';
import type { ChatFilterOptions, ChatSortOptions } from '$lib/server/db/DBChatUtils';
import { CourseInteractiveAuthUtils } from '$lib/server/db';
import { error, fail, redirect, type Actions } from '@sveltejs/kit';
import { ActivityAttemptDeletionService } from '$lib/server/attempts/ActivityAttemptDeletionService';

export const load = (async ({ params, url, locals }) => {
	// Verificación de seguridad (defensa en profundidad)
	if (!locals.user) {
		throw redirect(303, '/login');
	}

	const { cid, ilid } = params;
	const access = await CourseInteractiveAuthUtils.userCanAdminCourseInteractive(
		locals.user.id,
		cid,
		ilid,
		locals.user.highestRoleLevel
	);

	if (!access.allowed) {
		throw error(403, access.reason || 'No tienes permisos para ver los chats de esta actividad');
	}

	// Get the interactive learning model
	// bypassStatusCheck: true porque es una ruta admin
	const interactiveChat = await DBChatUtils.loadInteractiveChatFromInteractiveId(ilid, {
		bypassStatusCheck: true
	});

	// Parse query parameters for filtering, sorting, and pagination
	const page = parseInt(url.searchParams.get('page') || '1');
	const pageSize = parseInt(url.searchParams.get('pageSize') || '10');
	const sortField = url.searchParams.get('sortField') || 'createdAt';
	const sortDirection = url.searchParams.get('sortDirection') || 'desc';
	const searchTerm = url.searchParams.get('search') || undefined;
	const userId = url.searchParams.get('userId') || undefined;

	// Parse date filters if present
	let startDate: Date | undefined;
	let endDate: Date | undefined;

	if (url.searchParams.get('startDate')) {
		startDate = new Date(url.searchParams.get('startDate') as string);
	}

	if (url.searchParams.get('endDate')) {
		endDate = new Date(url.searchParams.get('endDate') as string);
	}

	// Create filter options
	const filterOptions: ChatFilterOptions = {
		userId,
		startDate,
		endDate,
		searchTerm
	};

	// Create sort options
	const sortOptions: ChatSortOptions = {
		field: sortField as 'createdAt' | 'username' | 'messageCount',
		direction: sortDirection as 'asc' | 'desc'
	};

	// Get all chats for this interactive learning activity with pagination
	const chatResults = await DBChatUtils.getAllChatInstancesFromInteractiveId(
		interactiveChat.interactive_learning_chat.id,
		filterOptions,
		sortOptions,
		{ page, pageSize }
	);

	return {
		interactiveChat,
		chats: chatResults.chats,
		pagination: {
			totalCount: chatResults.totalCount,
			totalPages: chatResults.totalPages,
			currentPage: chatResults.currentPage,
			pageSize
		},
		filters: {
			search: searchTerm,
			userId,
			startDate: startDate?.toISOString().split('T')[0],
			endDate: endDate?.toISOString().split('T')[0]
		},
		sorting: {
			field: sortField,
			direction: sortDirection
		}
	};
}) satisfies PageServerLoad;

export const actions = {
	deleteAttempt: async ({ request, params, locals }) => {
		if (!locals.user) throw redirect(303, '/login');

		const formData = await request.formData();
		const chatId = String(formData.get('chatId') ?? '');
		if (!chatId) return fail(400, { deleteError: 'Chat no indicado.' });

		try {
			ActivityAttemptDeletionService.requireDeleteConfirmation(formData);
			await ActivityAttemptDeletionService.deleteChatAttempt({
				courseId: params.cid!,
				activityId: params.ilid!,
				chatId,
				deletedByUserId: locals.user.id,
				deletedBySystemRoleLevel: locals.user.highestRoleLevel,
				reason: ActivityAttemptDeletionService.normalizeReason(formData.get('reason'))
			});
		} catch (errorValue) {
			if (errorValue instanceof Response) throw errorValue;
			return fail(400, {
				deleteError:
					errorValue instanceof Error ? errorValue.message : 'No se pudo borrar el intento.'
			});
		}

		return { deletedAttemptId: chatId };
	}
} satisfies Actions;
