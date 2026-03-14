import type { AgentContext } from '$lib/types/agent';
import type {
	CanvasScopeProfile,
	MemoryCanvasScopeResolved,
	MemoryCanvasVisibility
} from '$lib/types/agentMemory';
import {
	STUDENT_ACTIVITY_CANVAS_READ_TOOL_NAME,
	STUDENT_ACTIVITY_CANVAS_UPDATE_TOOL_NAME,
	STUDENT_COURSE_CANVAS_READ_TOOL_NAME,
	STUDENT_COURSE_CANVAS_UPDATE_TOOL_NAME,
	COURSE_SHARED_CANVAS_READ_TOOL_NAME,
	COURSE_SHARED_CANVAS_UPDATE_TOOL_NAME,
	SYSTEM_GLOBAL_CANVAS_READ_TOOL_NAME,
	SYSTEM_GLOBAL_CANVAS_UPDATE_TOOL_NAME
} from './constants';
import {
	BUILTIN_TOOL_USAGE_DOMAIN_AGENT_CHAT,
	BUILTIN_TOOL_USAGE_DOMAIN_INSIGHTS,
	BUILTIN_TOOL_USAGE_DOMAIN_INTERNAL
} from '$lib/server/agent/tools/constants';

function buildScopeBindings(
	entries: Array<[string, string | null | undefined]>
): Record<string, string> {
	return Object.fromEntries(
		entries.filter((entry): entry is [string, string] => typeof entry[1] === 'string' && entry[1].length > 0)
	);
}

function requireCourseId(context: AgentContext): string {
	if (!context.courseId) {
		throw new Error('Este canvas requiere que el contexto pertenezca a un curso.');
	}

	return context.courseId;
}

function buildStudentCourseTemplate(): string {
	return [
		'# Canvas de memoria del alumno en el curso',
		'',
		'## Perfil actual',
		'- Sin recuerdos consolidados todavía.',
		'',
		'## Preferencias y adaptaciones útiles',
		'- Ninguna observada todavía.',
		'',
		'## Fortalezas',
		'- Ninguna consolidada todavía.',
		'',
		'## Dificultades persistentes',
		'- Ninguna consolidada todavía.',
		'',
		'## Seguimiento pendiente',
		'- Ninguno.'
	].join('\n');
}

function buildStudentActivityTemplate(): string {
	return [
		'# Canvas de memoria del alumno en la actividad',
		'',
		'## Estado actual',
		'- Sin recuerdos consolidados todavía.',
		'',
		'## Bloqueos y dificultades',
		'- Ninguno consolidado todavía.',
		'',
		'## Progresos y evidencias',
		'- Ninguno consolidado todavía.',
		'',
		'## Siguiente mejor paso',
		'- Continuar observando la interacción.'
	].join('\n');
}

function buildCourseSharedTemplate(): string {
	return [
		'# Canvas compartido del curso',
		'',
		'## Temas que generan más confusión',
		'- Ninguno consolidado todavía.',
		'',
		'## Estrategias que funcionan a nivel de curso',
		'- Ninguna consolidada todavía.',
		'',
		'## Riesgos o bloqueos recurrentes',
		'- Ninguno consolidado todavía.',
		'',
		'## Seguimiento docente recomendado',
		'- Ninguno por ahora.'
	].join('\n');
}

function buildSystemGlobalTemplate(): string {
	return [
		'# Canvas global del sistema',
		'',
		'## Patrones operativos útiles',
		'- Ninguno consolidado todavía.',
		'',
		'## Problemas recurrentes detectados',
		'- Ninguno consolidado todavía.',
		'',
		'## Convenciones o decisiones útiles',
		'- Ninguna consolidada todavía.',
		'',
		'## Pendientes del sistema',
		'- Ninguno por ahora.'
	].join('\n');
}

const CANVAS_SCOPE_PROFILES: CanvasScopeProfile[] = [
	{
		id: 'student_course',
		scopeType: 'student_course',
		readToolName: STUDENT_COURSE_CANVAS_READ_TOOL_NAME,
		updateToolName: STUDENT_COURSE_CANVAS_UPDATE_TOOL_NAME,
		visibility: 'student_private',
		usageDomains: [BUILTIN_TOOL_USAGE_DOMAIN_AGENT_CHAT],
		promptHeading: '## Canvas privado del estudiante en el curso',
		updateScopeLabel: 'alumno + curso',
		requiresFinalizationGuard: true,
		canResolve(context) {
			return !!context.courseId;
		},
		resolve(context): MemoryCanvasScopeResolved {
			const courseId = requireCourseId(context);
			return {
				scopeType: 'student_course',
				scopeKey: `student:${context.userId}:course:${courseId}`,
				courseId,
				activityId: null,
				studentId: context.userId,
				visibility: 'student_private',
				scopeBindings: buildScopeBindings([
					['studentId', context.userId],
					['courseId', courseId]
				])
			};
		},
		buildTemplate: buildStudentCourseTemplate
	},
	{
		id: 'student_activity',
		scopeType: 'student_activity',
		readToolName: STUDENT_ACTIVITY_CANVAS_READ_TOOL_NAME,
		updateToolName: STUDENT_ACTIVITY_CANVAS_UPDATE_TOOL_NAME,
		visibility: 'student_private',
		usageDomains: [BUILTIN_TOOL_USAGE_DOMAIN_AGENT_CHAT],
		promptHeading: '## Canvas privado del estudiante en la actividad',
		updateScopeLabel: 'alumno + actividad',
		requiresFinalizationGuard: true,
		canResolve() {
			return true;
		},
		resolve(context): MemoryCanvasScopeResolved {
			return {
				scopeType: 'student_activity',
				scopeKey: `student:${context.userId}:activity:${context.activityId}`,
				courseId: context.courseId ?? null,
				activityId: context.activityId,
				studentId: context.userId,
				visibility: 'student_private',
				scopeBindings: buildScopeBindings([
					['studentId', context.userId],
					['courseId', context.courseId ?? null],
					['activityId', context.activityId]
				])
			};
		},
		buildTemplate: buildStudentActivityTemplate
	},
	{
		id: 'course_shared',
		scopeType: 'course_shared',
		readToolName: COURSE_SHARED_CANVAS_READ_TOOL_NAME,
		updateToolName: COURSE_SHARED_CANVAS_UPDATE_TOOL_NAME,
		visibility: 'course_internal',
		usageDomains: [BUILTIN_TOOL_USAGE_DOMAIN_INSIGHTS, BUILTIN_TOOL_USAGE_DOMAIN_INTERNAL],
		promptHeading: '## Canvas compartido del curso',
		updateScopeLabel: 'curso compartido',
		requiresFinalizationGuard: false,
		canResolve(context) {
			return !!context.courseId;
		},
		resolve(context): MemoryCanvasScopeResolved {
			const courseId = requireCourseId(context);
			return {
				scopeType: 'course_shared',
				scopeKey: `course:${courseId}:shared`,
				courseId,
				activityId: null,
				studentId: null,
				visibility: 'course_internal',
				scopeBindings: buildScopeBindings([['courseId', courseId]])
			};
		},
		buildTemplate: buildCourseSharedTemplate
	},
	{
		id: 'system_global',
		scopeType: 'system_global',
		readToolName: SYSTEM_GLOBAL_CANVAS_READ_TOOL_NAME,
		updateToolName: SYSTEM_GLOBAL_CANVAS_UPDATE_TOOL_NAME,
		visibility: 'system_internal',
		usageDomains: [BUILTIN_TOOL_USAGE_DOMAIN_INSIGHTS, BUILTIN_TOOL_USAGE_DOMAIN_INTERNAL],
		promptHeading: '## Canvas global del sistema',
		updateScopeLabel: 'sistema global',
		requiresFinalizationGuard: false,
		canResolve() {
			return true;
		},
		resolve(): MemoryCanvasScopeResolved {
			return {
				scopeType: 'system_global',
				scopeKey: 'system:global',
				courseId: null,
				activityId: null,
				studentId: null,
				visibility: 'system_internal',
				scopeBindings: {}
			};
		},
		buildTemplate: buildSystemGlobalTemplate
	}
];

const PROFILE_BY_TOOL_NAME = new Map<string, CanvasScopeProfile>();
for (const profile of CANVAS_SCOPE_PROFILES) {
	PROFILE_BY_TOOL_NAME.set(profile.readToolName, profile);
	PROFILE_BY_TOOL_NAME.set(profile.updateToolName, profile);
}

const INTERNAL_VISIBILITIES = new Set<MemoryCanvasVisibility>(['course_internal', 'system_internal']);

export function getAllCanvasScopeProfiles(): CanvasScopeProfile[] {
	return [...CANVAS_SCOPE_PROFILES];
}

export function getCanvasScopeProfileByToolName(toolName: string): CanvasScopeProfile | null {
	return PROFILE_BY_TOOL_NAME.get(toolName) ?? null;
}

export function getCanvasToolNamePairs(): Array<readonly [string, string]> {
	return CANVAS_SCOPE_PROFILES.map((profile) => [profile.readToolName, profile.updateToolName] as const);
}

export function getAllMemoryToolNames(): string[] {
	return CANVAS_SCOPE_PROFILES.flatMap((profile) => [profile.readToolName, profile.updateToolName]);
}

export function getFinalizationGuardedUpdateToolNames(enabledToolNames: Iterable<string>): string[] {
	const enabled = new Set(enabledToolNames);
	return CANVAS_SCOPE_PROFILES
		.filter((profile) => profile.requiresFinalizationGuard && enabled.has(profile.updateToolName))
		.map((profile) => profile.updateToolName);
}

export function isCrossDomainAgentChatMemoryTool(toolName: string): boolean {
	const profile = getCanvasScopeProfileByToolName(toolName);
	return !!profile && INTERNAL_VISIBILITIES.has(profile.visibility);
}
