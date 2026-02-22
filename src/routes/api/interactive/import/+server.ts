import { json, error, fail } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { db } from '$lib/server/db';
import { interactiveLearning, interactiveLearningChat, courseInteractiveLearning } from '$lib/server/db/schema';
import type { InteractiveLearningStatusType } from '$lib/server/db/schema';
import { eq, and, max } from 'drizzle-orm';
import { nanoid } from 'nanoid';
import { CourseRoleUtils } from '$lib/server/db/CourseRoleUtils';
import { generateSlug } from '$lib/utils/slug';

interface ImportData {
	version: string;
	activity: {
		name: string;
		slug?: string;
		description?: string | null;
		image?: string | null;
		type: string;
		content: string;
		// Nuevo sistema de ciclo de vida
		status?: InteractiveLearningStatusType;
		metadata?: string | null;
		// Legado: para compatibilidad con exportaciones anteriores
		isActive?: boolean;
	};
	chatConfig?: {
		llmRole?: string | null;
		llmInstructions?: string | null;
		llmContext?: string | null;
		systemPrompt?: string | null;
		llmModel?: string | null;
		temperature?: number | null;
		maxTokens?: number | null;
		topP?: number | null;
		metadata?: string | null;
	} | null;
}

export const POST: RequestHandler = async ({ request, locals }) => {
	if (!locals.user) {
		throw error(401, 'Unauthorized');
	}

	try {
		const body = await request.json();
		const { courseId, importData } = body as { courseId: string; importData: ImportData };

		if (!courseId) {
			throw error(400, 'courseId es requerido');
		}

		// Verificar que el usuario tenga permiso para crear actividades en el curso
		const hasPermission = await CourseRoleUtils.userHasCoursePermission(
			locals.user.id,
			courseId,
			'createActivities'
		);

		if (!hasPermission) {
			throw error(403, 'No tienes permisos para importar actividades en este curso');
		}

		if (!importData || !importData.activity) {
			throw error(400, 'Datos de importación inválidos');
		}

		const { activity, chatConfig } = importData;

		// Validar campos requeridos
		if (!activity.name || !activity.type || !activity.content) {
			throw error(400, 'Faltan campos requeridos en la actividad (name, type, content)');
		}

		const now = new Date();
		const activityId = nanoid();

		// Determinar el status: nuevo formato o mapear desde isActive
		let status: InteractiveLearningStatusType;
		if (activity.status) {
			status = activity.status;
		} else if (activity.isActive !== undefined) {
			// Compatibilidad hacia atrás con formato anterior
			status = activity.isActive ? 'published' : 'hidden';
		} else {
			status = 'hidden'; // Por defecto hidden para nuevas importaciones
		}

		// Generar slug único
		const existingSlugs = await db
			.select({ slug: interactiveLearning.slug })
			.from(interactiveLearning)
			.then(rows => rows.map(r => r.slug));

		let slug = activity.slug || generateSlug(activity.name, 60);
		let counter = 1;
		while (existingSlugs.includes(slug)) {
			slug = `${generateSlug(activity.name, 50)}-${counter}`;
			counter++;
		}

		// Crear la actividad
		await db.insert(interactiveLearning).values({
			id: activityId,
			name: activity.name,
			slug,
			description: activity.description || null,
			image: activity.image || null,
			type: activity.type,
			content: activity.content,
			status,
			publishedAt: status === 'published' ? now : null,
			metadata: activity.metadata || null,
			createdAt: now,
			updatedAt: now
		});

		// Si es tipo chat y hay configuración, crear el registro de chat con el MISMO ID (patrón de herencia 1:1)
		if (activity.type === 'chat' && chatConfig) {
			await db.insert(interactiveLearningChat).values({
				id: activityId, // Mismo ID que interactiveLearning
				llmRole: chatConfig.llmRole || null,
				llmInstructions: chatConfig.llmInstructions || null,
				llmContext: chatConfig.llmContext || null,
				systemPrompt: chatConfig.systemPrompt || null,
				llmModel: chatConfig.llmModel || null,
				temperature: chatConfig.temperature || null,
				maxTokens: chatConfig.maxTokens || null,
				topP: chatConfig.topP || null,
				metadata: chatConfig.metadata || null,
				createdAt: now
			});
		}

		// Obtener el orden máximo actual para el curso
		const [maxOrderResult] = await db
			.select({ maxOrder: max(courseInteractiveLearning.order) })
			.from(courseInteractiveLearning)
			.where(eq(courseInteractiveLearning.courseId, courseId));

		const nextOrder = (maxOrderResult?.maxOrder ?? 0) + 1;

		// Crear la relación con el curso
		await db.insert(courseInteractiveLearning).values({
			id: nanoid(),
			courseId,
			interactiveLearningId: activityId,
			order: nextOrder,
			createdAt: now
		});

		return json({
			success: true,
			activityId,
			message: 'Actividad importada correctamente'
		});
	} catch (e) {
		console.error('Error importando actividad:', e);
		if (e instanceof Error && 'status' in e) {
			throw e;
		}
		throw error(500, 'Error importando actividad');
	}
};
