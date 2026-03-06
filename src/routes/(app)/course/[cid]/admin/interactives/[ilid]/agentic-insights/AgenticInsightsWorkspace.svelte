<script lang="ts">
	import { browser } from '$app/environment';
	import { goto } from '$app/navigation';
	import { resolve } from '$app/paths';
	import type { PageData } from './$types';
	import AgentChatComponent from '$lib/components/agent/AgentChatComponent.svelte';
	import type { InsightsAgentRunScope } from '$lib/types/insightsAgent';
	import {
		ArrowRight,
		Bot,
		CheckCircle2,
		ChevronLeft,
		Clock3,
		FileText,
		LayoutTemplate,
		Lightbulb,
		ListChecks,
		Mail,
		MessageSquareMore,
		RefreshCw,
		ShieldCheck,
		TriangleAlert,
		UserRound,
		Wrench
	} from 'lucide-svelte';
	import {
		getInsightTemplate,
		insightTemplates,
		type InsightTemplateFamily,
		type InsightPromptContext,
		type InsightStudentOption,
		type InsightTemplateDefinition,
		type InsightTemplateId
	} from './templates';

	let { data }: { data: PageData } = $props();

	type ChatComposerApi = {
		fillComposer: (text: string) => void;
		sendDraftMessage: (text: string) => void;
	};

	type WorkflowStep = 1 | 2 | 3 | 4;

	function formatDateInput(date: Date): string {
		const year = date.getFullYear();
		const month = `${date.getMonth() + 1}`.padStart(2, '0');
		const day = `${date.getDate()}`.padStart(2, '0');
		return `${year}-${month}-${day}`;
	}

	function getPendingPromptKey(runId: string): string {
		return `agentic-insights:pending-prompt:${runId}`;
	}

	function getRunMetaKey(runId: string): string {
		return `agentic-insights:run-meta:${runId}`;
	}

	function inferTemplateIdFromRun(run: PageData['selectedRun']): InsightTemplateId {
		if (!run) return 'cohort_summary';
		const normalizedTitle = (run.title ?? '').toLowerCase();
		if (normalizedTitle.includes('comparacion')) return 'compare_groups';
		if (run.scope.studentIds.length === 1) return 'student_support';
		if (normalizedTitle.includes('riesgo')) return 'risk_scan';
		if (normalizedTitle.includes('friccion')) return 'friction_points';
		if (normalizedTitle.includes('redise')) return 'redesign_summary';
		if (normalizedTitle.includes('edicion')) return 'next_edition_adjustments';
		return 'cohort_summary';
	}

	let draftStep = $state<WorkflowStep>(1);
	let selectedTemplateId = $state<InsightTemplateId | null>(null);
	let selectedStudentId = $state('');
	let groupAStudentIds = $state<string[]>([]);
	let groupALabel = $state('');
	let groupBLabel = $state('');
	let dateFrom = $state('');
	let dateTo = $state('');
	let search = $state('');
	let objective = $state('');
	let isCreatingRun = $state(false);
	let pageError = $state('');
	let pageMessage = $state('');
	let chatApi = $state<ChatComposerApi | null>(null);
	let pendingPromptRunId = $state('');
	let runMeta = $state<{
		templateId: InsightTemplateId | null;
		objective: string;
		groupAStudentIds: string[];
		groupBStudentIds: string[];
		groupALabel: string;
		groupBLabel: string;
	}>({
		templateId: null,
		objective: '',
		groupAStudentIds: [],
		groupBStudentIds: [],
		groupALabel: '',
		groupBLabel: ''
	});

	const studentById = $derived(new Map(data.students.map((student) => [student.id, student])));
	const selectedTemplate = $derived(selectedTemplateId ? getInsightTemplate(selectedTemplateId) : null);
	const familyLabels: Record<InsightTemplateFamily, string> = {
		understand: 'Entender que pasa',
		improve: 'Mejorar la actividad',
		compare: 'Comparar y segmentar',
		follow_up: 'Preparar seguimiento'
	};
	const groupedTemplates = $derived.by(() => {
		const familyOrder: InsightTemplateFamily[] = ['understand', 'improve', 'compare', 'follow_up'];
		return familyOrder
			.map((family) => ({
				family,
				label: familyLabels[family],
				templates: insightTemplates.filter((template) => template.family === family)
			}))
			.filter((group) => group.templates.length > 0);
	});
	const selectedStudent = $derived(
		selectedStudentId
			? ((studentById.get(selectedStudentId) as InsightStudentOption | undefined) ?? null)
			: null
	);
	const currentStep = $derived<WorkflowStep>(data.selectedRun ? 4 : draftStep);
	const apiEndpoint = $derived(
		data.selectedRun
			? `/api/admin/insights-agent/${data.interactive.id}/runs/${data.selectedRun.id}/ask`
			: ''
	);
	const selectedRunEditable = $derived(
		data.selectedRun ? data.selectedRun.createdByUserId === data.viewerUserId : false
	);
	const hasEvidence = $derived(
		data.overview.totalSessions > 0 ||
			data.overview.totalMessages > 0 ||
			data.overview.studentsWithEvidenceCount > 0
	);

	const draftScope = $derived.by<InsightsAgentRunScope>(() => ({
		mode: selectedTemplate?.defaultScope.mode ?? 'cohort',
		studentIds: selectedTemplate?.supportsGroupComparison
			? [...groupAStudentIds]
			: selectedTemplate?.requiresStudent && selectedStudentId
				? [selectedStudentId]
				: [],
		chatIds: [],
		dateFrom: selectedTemplate?.supportsDateRange ? dateFrom || null : null,
		dateTo: selectedTemplate?.supportsDateRange ? dateTo || null : null,
		search: search.trim() || null
	}));

	const draftPromptContext = $derived.by<InsightPromptContext | null>(() => {
		if (!selectedTemplate) return null;
		return {
			activityName: data.activityContext.name,
			objective,
			scope: draftScope,
			student: selectedStudent,
			groupAStudentIds: selectedTemplate?.supportsGroupComparison ? [...groupAStudentIds] : undefined,
			groupBStudentIds: selectedTemplate?.supportsGroupComparison ? [] : undefined,
			groupALabel: selectedTemplate?.supportsGroupComparison ? groupALabel.trim() || 'grupo seleccionado' : undefined,
			groupBLabel: selectedTemplate?.supportsGroupComparison ? groupBLabel.trim() || 'resto de la cohorte' : undefined
		};
	});

	const initialPrompt = $derived(
		draftPromptContext && selectedTemplate ? selectedTemplate.promptFactory(draftPromptContext) : ''
	);
	const recentRunCountLabel = $derived(
		data.runs.length === 1 ? '1 analisis reciente' : `${data.runs.length} analisis recientes`
	);
	const settingsHref = $derived(
		resolve(
			`/course/${data.courseId}/admin/interactives/${data.interactive.id}/agentic-insights/settings${
				data.selectedRun ? `?run=${data.selectedRun.id}` : ''
			}`
		)
	);

	const configurationSummary = $derived.by(() => {
		const enabledTools = data.availableTools.filter((tool) => data.config.enabledToolIds.includes(tool.id));
		return {
			model: data.config.llmModel ?? data.models[0] ?? 'No configurado',
			toolCount: enabledTools.length,
			toolChoice:
				data.config.toolChoice === 'required'
					? 'Siempre usa herramientas'
					: data.config.toolChoice === 'none'
						? 'Sin herramientas'
						: 'Uso automatico',
			parallelToolCalls: data.config.parallelToolCalls ? 'Permitidas' : 'Desactivadas'
		};
	});

	const draftSummaryChips = $derived.by(() => {
		if (!selectedTemplate) return [];
		const chips = [selectedTemplate.title];
		if (selectedTemplate.supportsGroupComparison) {
			chips.push(
				`Grupo A: ${groupALabel.trim() || 'grupo seleccionado'} (${groupAStudentIds.length})`
			);
			chips.push(`Comparado con: ${groupBLabel.trim() || 'resto de la cohorte'}`);
		} else if (selectedTemplate.requiresStudent && selectedStudent) {
			chips.push(`Estudiante: ${selectedStudent.username}`);
		} else {
			chips.push('Alcance: cohorte completa');
		}
		if (draftScope.dateFrom || draftScope.dateTo) {
			chips.push(`Periodo: ${draftScope.dateFrom ?? 'inicio'} - ${draftScope.dateTo ?? 'hoy'}`);
		}
		if (draftScope.search) chips.push(`Refinar evidencia: ${draftScope.search}`);
		return chips;
	});

	const selectedRunTemplateId = $derived<InsightTemplateId | null>(
		data.selectedRun ? runMeta.templateId ?? inferTemplateIdFromRun(data.selectedRun) : selectedTemplateId
	);
	const selectedRunScopeSummary = $derived.by(() => {
		if (!data.selectedRun) return [];
		const scope = data.selectedRun.scope;
		const chips: string[] = [];
		if (selectedRunTemplateId === 'compare_groups') {
			chips.push(
				`Grupo A: ${runMeta.groupALabel.trim() || 'grupo seleccionado'} (${runMeta.groupAStudentIds.length || scope.studentIds.length})`
			);
			chips.push(`Comparado con: ${runMeta.groupBLabel.trim() || 'resto de la cohorte'}`);
		} else {
			chips.push(
				scope.studentIds.length === 1
					? `Estudiante: ${studentById.get(scope.studentIds[0])?.username ?? scope.studentIds[0]}`
					: 'Alcance: cohorte completa'
			);
		}
		if (scope.dateFrom || scope.dateTo) {
			chips.push(`Periodo: ${scope.dateFrom ?? 'inicio'} - ${scope.dateTo ?? 'hoy'}`);
		}
		if (scope.search) chips.push(`Filtro: ${scope.search}`);
		if (scope.chatIds.length > 0) chips.push(`${scope.chatIds.length} sesiones filtradas`);
		return chips;
	});

	const selectedRunTemplate = $derived.by<InsightTemplateDefinition | null>(() => {
		if (data.selectedRun) {
			return selectedRunTemplateId ? getInsightTemplate(selectedRunTemplateId) : null;
		}
		return selectedTemplate;
	});

	const selectedRunObjective = $derived(
		runMeta.objective.trim() ||
			selectedRunTemplate?.defaultObjective ||
			'Analizar la actividad con una salida clara y revisable.'
	);
	const selectedRunActionContext = $derived.by<InsightPromptContext | null>(() => {
		if (!data.selectedRun) return null;
		return {
			activityName: data.activityContext.name,
			objective: selectedRunObjective,
			scope: data.selectedRun.scope,
			student:
				data.selectedRun.scope.studentIds.length === 1
					? ((studentById.get(data.selectedRun.scope.studentIds[0]) as InsightStudentOption | undefined) ?? null)
					: null,
			groupAStudentIds:
				selectedRunTemplateId === 'compare_groups'
					? [...(runMeta.groupAStudentIds.length ? runMeta.groupAStudentIds : data.selectedRun.scope.studentIds)]
					: undefined,
			groupBStudentIds:
				selectedRunTemplateId === 'compare_groups' ? [...runMeta.groupBStudentIds] : undefined,
			groupALabel:
				selectedRunTemplateId === 'compare_groups'
					? runMeta.groupALabel.trim() || 'grupo seleccionado'
					: undefined,
			groupBLabel:
				selectedRunTemplateId === 'compare_groups'
					? runMeta.groupBLabel.trim() || 'resto de la cohorte'
					: undefined
		};
	});

	const canContinueToReview = $derived(
		!!selectedTemplate &&
			(!selectedTemplate.requiresStudent || !!selectedStudentId) &&
			(!selectedTemplate.supportsGroupComparison || groupAStudentIds.length > 0) &&
			(!selectedTemplate.supportsDateRange || !dateFrom || !dateTo || dateFrom <= dateTo)
	);
	const canCreateRun = $derived(!!selectedTemplate && !!initialPrompt && canContinueToReview);

	function applyTemplate(templateId: InsightTemplateId) {
		const template = getInsightTemplate(templateId);
		const today = new Date();
		const last14Days = new Date(today);
		last14Days.setDate(today.getDate() - 14);

		selectedTemplateId = templateId;
		objective = template.defaultObjective;
		search = template.defaultScope.search ?? '';
		dateFrom = template.defaultScope.datePreset === 'last_14_days' ? formatDateInput(last14Days) : '';
		dateTo = template.defaultScope.datePreset === 'last_14_days' ? formatDateInput(today) : '';
		selectedStudentId = template.requiresStudent && data.students.length === 1 ? data.students[0].id : '';
		groupAStudentIds = [];
		groupALabel = '';
		groupBLabel = '';
		pageError = '';
		pageMessage = '';
		draftStep = 2;
	}

	function toggleGroupAStudent(studentId: string) {
		groupAStudentIds = groupAStudentIds.includes(studentId)
			? groupAStudentIds.filter((id) => id !== studentId)
			: [...groupAStudentIds, studentId];
	}

	function goToDraftStep(step: WorkflowStep) {
		if (data.selectedRun) return;
		if (step === 1) {
			draftStep = 1;
			return;
		}
		if (!selectedTemplate) {
			draftStep = 1;
			return;
		}
		if (step === 2) {
			draftStep = 2;
			return;
		}
		if (canContinueToReview) {
			draftStep = 3;
		}
	}

	function buildRunMeta() {
		return {
			templateId: selectedTemplateId,
			objective: objective.trim(),
			groupAStudentIds: [...groupAStudentIds],
			groupBStudentIds: [],
			groupALabel: groupALabel.trim(),
			groupBLabel: groupBLabel.trim()
		};
	}

	async function startNewAnalysis() {
		if (!browser) return;
		const nextUrl = new URL(window.location.href);
		nextUrl.searchParams.delete('run');
		await goto(`${nextUrl.pathname}${nextUrl.search}`, { invalidateAll: true });
	}

	async function createRun() {
		if (!selectedTemplate || !draftPromptContext || !initialPrompt) return;

		isCreatingRun = true;
		pageError = '';
		pageMessage = '';

		try {
			const res = await fetch(`/api/admin/insights-agent/${data.interactive.id}/runs`, {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({
					courseId: data.courseId,
					title: selectedTemplate.buildRunTitle(draftPromptContext),
					scope: draftScope
				})
			});

			const payload = await res.json().catch(() => ({}));
			if (!res.ok) {
				throw new Error(payload?.error ?? `Error ${res.status}`);
			}

			if (browser) {
				sessionStorage.setItem(getPendingPromptKey(payload.run.id), initialPrompt);
				sessionStorage.setItem(getRunMetaKey(payload.run.id), JSON.stringify(buildRunMeta()));
			}

			const nextUrl = new URL(window.location.href);
			nextUrl.searchParams.set('run', payload.run.id);
			await goto(`${nextUrl.pathname}${nextUrl.search}`, { invalidateAll: true });
		} catch (error) {
			pageError = error instanceof Error ? error.message : 'No se pudo crear el analisis guiado.';
		} finally {
			isCreatingRun = false;
		}
	}

	function prepareQuickAction(prompt: string) {
		if (!chatApi || !prompt || !selectedRunEditable) return;
		chatApi.fillComposer(prompt);
		pageMessage = 'Se preparo un borrador en el chat. Revise el texto antes de enviarlo.';
		pageError = '';
	}
	$effect(() => {
		if (!browser || !data.selectedRun) {
			runMeta = {
				templateId: selectedTemplateId,
				objective: objective.trim(),
				groupAStudentIds: [...groupAStudentIds],
				groupBStudentIds: [],
				groupALabel: groupALabel.trim(),
				groupBLabel: groupBLabel.trim()
			};
			return;
		}

		const rawValue = sessionStorage.getItem(getRunMetaKey(data.selectedRun.id));
		if (!rawValue) {
			runMeta = {
				templateId: null,
				objective: '',
				groupAStudentIds: [],
				groupBStudentIds: [],
				groupALabel: '',
				groupBLabel: ''
			};
			return;
		}

		try {
			const parsed = JSON.parse(rawValue) as {
				templateId?: InsightTemplateId;
				objective?: string;
				groupAStudentIds?: string[];
				groupBStudentIds?: string[];
				groupALabel?: string;
				groupBLabel?: string;
			};
			runMeta = {
				templateId: parsed.templateId ?? null,
				objective: parsed.objective ?? '',
				groupAStudentIds: Array.isArray(parsed.groupAStudentIds) ? parsed.groupAStudentIds : [],
				groupBStudentIds: Array.isArray(parsed.groupBStudentIds) ? parsed.groupBStudentIds : [],
				groupALabel: parsed.groupALabel ?? '',
				groupBLabel: parsed.groupBLabel ?? ''
			};
		} catch {
			runMeta = {
				templateId: null,
				objective: '',
				groupAStudentIds: [],
				groupBStudentIds: [],
				groupALabel: '',
				groupBLabel: ''
			};
		}
	});

	$effect(() => {
		if (
			!browser ||
			!data.selectedRun ||
			!selectedRunEditable ||
			data.selectedRun.messages.length > 0 ||
			!chatApi
		) {
			return;
		}

		const prompt = sessionStorage.getItem(getPendingPromptKey(data.selectedRun.id));
		if (!prompt || pendingPromptRunId === data.selectedRun.id) return;

		pendingPromptRunId = data.selectedRun.id;
		sessionStorage.removeItem(getPendingPromptKey(data.selectedRun.id));
		setTimeout(() => {
			chatApi?.sendDraftMessage(prompt);
		}, 80);
	});
</script>

<div class="space-y-6">
	<div class="rounded-[2rem] border border-slate-200 bg-linear-to-br from-white via-slate-50 to-blue-50 p-6 shadow-sm dark:border-slate-700 dark:from-slate-900 dark:via-slate-900 dark:to-slate-800">
		<div class="flex flex-col gap-6 xl:flex-row xl:items-end xl:justify-between">
			<div class="max-w-3xl">
				<div class="inline-flex items-center gap-2 rounded-full border border-blue-200 bg-blue-50 px-3 py-1 text-xs font-medium text-blue-700 dark:border-blue-800 dark:bg-blue-950/40 dark:text-blue-300">
					<Bot class="h-3.5 w-3.5" />
					Asistente de analisis
				</div>
				<h1 class="mt-4 text-3xl font-semibold tracking-tight text-slate-900 dark:text-white">
					Analice la actividad con un flujo guiado y lenguaje docente.
				</h1>
				<p class="mt-3 text-sm leading-6 text-slate-600 dark:text-slate-300">
					Elija una plantilla, defina el alcance y deje que la IA prepare un analisis
					revisable. La IA propone; el docente decide.
				</p>
			</div>

			<div class="grid grid-cols-2 gap-3 sm:grid-cols-4">
				<div class="rounded-2xl border border-white/70 bg-white/90 px-4 py-3 dark:border-slate-700 dark:bg-slate-900/80">
					<div class="text-xs uppercase tracking-wide text-slate-500 dark:text-slate-400">Sesiones</div>
					<div class="mt-1 text-xl font-semibold text-slate-900 dark:text-white">{data.overview.totalSessions}</div>
				</div>
				<div class="rounded-2xl border border-white/70 bg-white/90 px-4 py-3 dark:border-slate-700 dark:bg-slate-900/80">
					<div class="text-xs uppercase tracking-wide text-slate-500 dark:text-slate-400">Mensajes</div>
					<div class="mt-1 text-xl font-semibold text-slate-900 dark:text-white">{data.overview.totalMessages}</div>
				</div>
				<div class="rounded-2xl border border-white/70 bg-white/90 px-4 py-3 dark:border-slate-700 dark:bg-slate-900/80">
					<div class="text-xs uppercase tracking-wide text-slate-500 dark:text-slate-400">Con evidencia</div>
					<div class="mt-1 text-xl font-semibold text-slate-900 dark:text-white">{data.overview.studentsWithEvidenceCount}</div>
				</div>
				<div class="rounded-2xl border border-white/70 bg-white/90 px-4 py-3 dark:border-slate-700 dark:bg-slate-900/80">
					<div class="text-xs uppercase tracking-wide text-slate-500 dark:text-slate-400">Analisis</div>
					<div class="mt-1 text-xl font-semibold text-slate-900 dark:text-white">{data.runs.length}</div>
				</div>
			</div>
		</div>
	</div>

	{#if pageError}
		<div class="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700 dark:border-red-800 dark:bg-red-950/30 dark:text-red-300">
			{pageError}
		</div>
	{/if}

	{#if pageMessage}
		<div class="rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-700 dark:border-emerald-800 dark:bg-emerald-950/30 dark:text-emerald-300">
			{pageMessage}
		</div>
	{/if}

	{#if !hasEvidence}
		<div class="rounded-3xl border border-amber-200 bg-amber-50 p-5 dark:border-amber-800 dark:bg-amber-950/20">
			<div class="flex items-start gap-3">
				<TriangleAlert class="mt-0.5 h-5 w-5 text-amber-600 dark:text-amber-300" />
				<div>
					<h2 class="text-base font-semibold text-amber-900 dark:text-amber-100">
						Aun no hay suficiente evidencia para un analisis util.
					</h2>
					<p class="mt-1 text-sm text-amber-800 dark:text-amber-200">
						Comparta la actividad con estudiantes o espere a que haya interacciones antes de
						lanzar un analisis guiado.
					</p>
				</div>
			</div>
		</div>
	{/if}

	<section class="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-700 dark:bg-slate-900">
		<div class="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
			<div>
				<p class="text-sm font-semibold text-slate-900 dark:text-white">Flujo guiado</p>
				<p class="mt-1 text-sm text-slate-500 dark:text-slate-400">
					Una tarea por paso para reducir friccion y evitar configuracion tecnica innecesaria.
				</p>
			</div>
			{#if data.selectedRun}
				<button
					class="inline-flex items-center justify-center gap-2 rounded-xl border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 transition hover:bg-slate-50 dark:border-slate-600 dark:text-slate-200 dark:hover:bg-slate-800"
					onclick={startNewAnalysis}
				>
					<RefreshCw class="h-4 w-4" />
					Crear otro analisis
				</button>
			{/if}
		</div>

		<div class="mt-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
			{#each [
				{ step: 1 as WorkflowStep, title: 'Elegir plantilla', desc: 'Que tipo de ayuda necesita hoy.' },
				{ step: 2 as WorkflowStep, title: 'Definir alcance', desc: 'A quien mirar y con que contexto.' },
				{ step: 3 as WorkflowStep, title: 'Revisar y crear', desc: 'Confirmar antes de lanzar.' },
				{ step: 4 as WorkflowStep, title: 'Conversar y actuar', desc: 'Leer, preguntar y preparar borradores.' }
			] as item (item.step)}
				<button
					type="button"
					class={`rounded-2xl border px-4 py-3 text-left transition ${
						currentStep === item.step
							? 'border-blue-500 bg-blue-50 text-blue-900 dark:border-blue-400 dark:bg-blue-950/40 dark:text-blue-100'
							: currentStep > item.step
								? 'border-emerald-200 bg-emerald-50 text-emerald-900 dark:border-emerald-800 dark:bg-emerald-950/20 dark:text-emerald-100'
								: 'border-slate-200 bg-slate-50 text-slate-600 dark:border-slate-700 dark:bg-slate-800/60 dark:text-slate-300'
					}`}
					onclick={() => goToDraftStep(item.step)}
					disabled={!!data.selectedRun}
					aria-current={currentStep === item.step ? 'step' : undefined}
				>
					<div class="flex items-center justify-between gap-3">
						<div class="flex h-8 w-8 items-center justify-center rounded-full bg-white text-sm font-semibold shadow-sm dark:bg-slate-900">
							{#if currentStep > item.step}
								<CheckCircle2 class="h-4 w-4 text-emerald-600 dark:text-emerald-300" />
							{:else}
								{item.step}
							{/if}
						</div>
						{#if item.step === 4}
							<Bot class="h-4 w-4 opacity-70" />
						{:else}
							<ArrowRight class="h-4 w-4 opacity-50" />
						{/if}
					</div>
					<p class="mt-3 font-medium">{item.title}</p>
					<p class="mt-1 text-xs opacity-80">{item.desc}</p>
				</button>
			{/each}
		</div>
	</section>

	<div class="grid gap-6 xl:grid-cols-[minmax(0,1fr)_320px]">
		<section class="space-y-6">
			{#if currentStep === 1}
				<div class="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm dark:border-slate-700 dark:bg-slate-900">
					<div class="max-w-2xl">
						<h2 class="text-xl font-semibold text-slate-900 dark:text-white">Paso 1. Elija una plantilla</h2>
						<p class="mt-2 text-sm text-slate-500 dark:text-slate-400">
							Cada plantilla organiza el analisis segun una tarea docente concreta. Puede
							cambiar de plantilla antes de crear el analisis.
						</p>
					</div>

					<div class="mt-6 space-y-8">
						{#each groupedTemplates as group (group.family)}
							<div>
								<div class="mb-4 flex items-center gap-3">
									<div class="h-px flex-1 bg-slate-200 dark:bg-slate-700"></div>
									<p class="text-xs font-semibold uppercase tracking-[0.22em] text-slate-500 dark:text-slate-400">
										{group.label}
									</p>
									<div class="h-px flex-1 bg-slate-200 dark:bg-slate-700"></div>
								</div>
								<div class="grid gap-4 lg:grid-cols-3">
									{#each group.templates as template (template.id)}
										<button
											type="button"
											class="group rounded-[1.5rem] border border-slate-200 bg-slate-50 p-5 text-left transition hover:-translate-y-0.5 hover:border-blue-300 hover:bg-white hover:shadow-md dark:border-slate-700 dark:bg-slate-800/80 dark:hover:border-blue-500 dark:hover:bg-slate-800"
											onclick={() => applyTemplate(template.id)}
										>
											<div class="flex items-start justify-between gap-4">
												<div class="rounded-2xl bg-white p-3 shadow-sm dark:bg-slate-900">
													{#if template.id === 'risk_scan' || template.id === 'friction_points'}
														<TriangleAlert class="h-5 w-5 text-amber-600 dark:text-amber-300" />
													{:else if template.id === 'cohort_summary' || template.id === 'redesign_summary' || template.id === 'next_edition_adjustments'}
														<FileText class="h-5 w-5 text-blue-600 dark:text-blue-300" />
													{:else if template.id === 'compare_groups'}
														<ListChecks class="h-5 w-5 text-fuchsia-600 dark:text-fuchsia-300" />
													{:else}
														<UserRound class="h-5 w-5 text-emerald-600 dark:text-emerald-300" />
													{/if}
												</div>
												<span class="inline-flex items-center gap-1 rounded-full border border-slate-200 px-2.5 py-1 text-xs text-slate-500 dark:border-slate-600 dark:text-slate-300">
													<Clock3 class="h-3.5 w-3.5" />
													{template.estimatedTime}
												</span>
											</div>

											<h3 class="mt-4 text-lg font-semibold text-slate-900 dark:text-white">{template.title}</h3>
											<p class="mt-2 text-sm leading-6 text-slate-600 dark:text-slate-300">{template.description}</p>

											<div class="mt-5 rounded-2xl border border-slate-200 bg-white p-3 text-sm dark:border-slate-700 dark:bg-slate-900/80">
												<p class="font-medium text-slate-900 dark:text-white">Resultado esperado</p>
												<p class="mt-1 text-slate-500 dark:text-slate-400">{template.resultSummary}</p>
											</div>

											{#if template.emptyStateHint}
												<p class="mt-3 text-xs leading-5 text-slate-500 dark:text-slate-400">
													{template.emptyStateHint}
												</p>
											{/if}

											<div class="mt-3 rounded-2xl bg-slate-100 px-3 py-2 text-xs text-slate-600 dark:bg-slate-800 dark:text-slate-300">
												<ShieldCheck class="mr-1 inline h-3.5 w-3.5" />
												{template.caution}
											</div>
										</button>
									{/each}
								</div>
							</div>
						{/each}
					</div>
				</div>
			{:else if currentStep === 2 && selectedTemplate}
				<div class="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm dark:border-slate-700 dark:bg-slate-900">
					<div class="flex items-start justify-between gap-4">
						<div class="max-w-2xl">
							<p class="text-sm font-medium text-blue-700 dark:text-blue-300">{selectedTemplate.title}</p>
							<h2 class="mt-1 text-xl font-semibold text-slate-900 dark:text-white">Paso 2. Defina el alcance</h2>
							<p class="mt-2 text-sm text-slate-500 dark:text-slate-400">
								Le pediremos solo lo necesario para esta plantilla. El resto de ajustes queda
								fuera del flujo principal.
							</p>
						</div>
						<button
							type="button"
							class="inline-flex items-center gap-2 rounded-xl border border-slate-300 px-3 py-2 text-sm font-medium text-slate-700 transition hover:bg-slate-50 dark:border-slate-600 dark:text-slate-200 dark:hover:bg-slate-800"
							onclick={() => goToDraftStep(1)}
						>
							<ChevronLeft class="h-4 w-4" />
							Cambiar plantilla
						</button>
					</div>

					<div class="mt-6 grid gap-5 lg:grid-cols-[minmax(0,1fr)_280px]">
						<div class="space-y-5">
							{#if selectedTemplate.supportsGroupComparison}
								<div class="rounded-2xl border border-slate-200 bg-slate-50 p-4 dark:border-slate-700 dark:bg-slate-800/70">
									<div class="flex items-center gap-2">
										<ListChecks class="h-4 w-4 text-slate-500 dark:text-slate-300" />
										<h3 class="text-sm font-semibold text-slate-900 dark:text-white">Grupo A</h3>
									</div>
									<p class="mt-1 text-sm text-slate-500 dark:text-slate-400">
										Seleccione uno o varios estudiantes para compararlos contra el resto de la cohorte.
									</p>
									<div class="mt-4 grid gap-4 md:grid-cols-2">
										<div>
											<label for="group-a-label" class="mb-1.5 block text-sm font-medium text-slate-700 dark:text-slate-300">Nombre del grupo A opcional</label>
											<input id="group-a-label" bind:value={groupALabel} type="text" placeholder="Ej. estudiantes con baja participacion" class="block w-full rounded-2xl border border-slate-300 bg-white px-3 py-2.5 text-sm text-slate-900 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-200 dark:border-slate-600 dark:bg-slate-900 dark:text-white dark:focus:ring-blue-900" />
										</div>
										<div>
											<label for="group-b-label" class="mb-1.5 block text-sm font-medium text-slate-700 dark:text-slate-300">Comparado con</label>
											<input id="group-b-label" bind:value={groupBLabel} type="text" placeholder="Resto de la cohorte" class="block w-full rounded-2xl border border-slate-300 bg-white px-3 py-2.5 text-sm text-slate-900 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-200 dark:border-slate-600 dark:bg-slate-900 dark:text-white dark:focus:ring-blue-900" />
										</div>
									</div>
									<div class="mt-4 max-h-64 space-y-2 overflow-y-auto rounded-2xl border border-slate-200 bg-white p-3 dark:border-slate-700 dark:bg-slate-900">
										{#each data.students as student (student.id)}
											<label class="flex items-start gap-3 rounded-xl px-2 py-2 text-sm text-slate-700 hover:bg-slate-50 dark:text-slate-300 dark:hover:bg-slate-800">
												<input type="checkbox" checked={groupAStudentIds.includes(student.id)} onchange={() => toggleGroupAStudent(student.id)} class="mt-1 h-4 w-4 rounded border-slate-300 text-blue-600 focus:ring-blue-500" />
												<span class="min-w-0">
													<span class="block font-medium text-slate-900 dark:text-white">{student.username}</span>
													<span class="block text-xs text-slate-500 dark:text-slate-400">{student.email}</span>
												</span>
											</label>
										{/each}
									</div>
									{#if data.students.length === 0}
										<p class="mt-3 text-sm text-amber-700 dark:text-amber-300">
											No hay estudiantes disponibles todavia para construir esta comparacion.
										</p>
									{/if}
									<p class="mt-3 text-xs text-slate-500 dark:text-slate-400">
										Recomendado: compare un grupo seleccionado frente al resto de la cohorte para mantener la lectura simple.
									</p>
								</div>
							{/if}

							{#if selectedTemplate.requiresStudent}
								<div>
									<label for="draft-student" class="mb-1.5 block text-sm font-medium text-slate-700 dark:text-slate-300">
										Estudiante
									</label>
									<select
										id="draft-student"
										bind:value={selectedStudentId}
										class="block w-full rounded-2xl border border-slate-300 bg-slate-50 px-3 py-2.5 text-sm text-slate-900 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-200 dark:border-slate-600 dark:bg-slate-800 dark:text-white dark:focus:ring-blue-900"
									>
										<option value="">Seleccione un estudiante</option>
										{#each data.students as student (student.id)}
											<option value={student.id}>{student.username} · {student.email}</option>
										{/each}
									</select>
									{#if data.students.length === 0}
										<p class="mt-2 text-sm text-amber-700 dark:text-amber-300">
											No hay estudiantes disponibles todavia para esta actividad.
										</p>
									{/if}
								</div>
							{/if}

							{#if selectedTemplate.supportsDateRange}
								<div class="grid gap-4 sm:grid-cols-2">
									<div>
										<label for="draft-date-from" class="mb-1.5 block text-sm font-medium text-slate-700 dark:text-slate-300">
											Desde
										</label>
										<input id="draft-date-from" bind:value={dateFrom} type="date" class="block w-full rounded-2xl border border-slate-300 bg-slate-50 px-3 py-2.5 text-sm text-slate-900 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-200 dark:border-slate-600 dark:bg-slate-800 dark:text-white dark:focus:ring-blue-900" />
									</div>
									<div>
										<label for="draft-date-to" class="mb-1.5 block text-sm font-medium text-slate-700 dark:text-slate-300">
											Hasta
										</label>
										<input id="draft-date-to" bind:value={dateTo} type="date" class="block w-full rounded-2xl border border-slate-300 bg-slate-50 px-3 py-2.5 text-sm text-slate-900 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-200 dark:border-slate-600 dark:bg-slate-800 dark:text-white dark:focus:ring-blue-900" />
									</div>
								</div>
							{/if}

							<div>
								<label for="draft-objective" class="mb-1.5 block text-sm font-medium text-slate-700 dark:text-slate-300">Objetivo docente opcional</label>
								<textarea id="draft-objective" bind:value={objective} rows={4} placeholder={selectedTemplate.defaultObjective} class="block w-full rounded-2xl border border-slate-300 bg-slate-50 px-3 py-2.5 text-sm text-slate-900 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-200 dark:border-slate-600 dark:bg-slate-800 dark:text-white dark:focus:ring-blue-900"></textarea>
								<p class="mt-2 text-xs text-slate-500 dark:text-slate-400">Si no escribe nada, usaremos un objetivo sugerido por la plantilla.</p>
							</div>

							<div class="rounded-2xl border border-slate-200 bg-slate-50 p-4 dark:border-slate-700 dark:bg-slate-800/70">
								<div class="flex items-center gap-2">
									<Lightbulb class="h-4 w-4 text-slate-500 dark:text-slate-300" />
									<h3 class="text-sm font-semibold text-slate-900 dark:text-white">Refinar evidencia</h3>
								</div>
								<p class="mt-1 text-sm text-slate-500 dark:text-slate-400">Use este filtro solo si desea centrar el analisis en una palabra clave.</p>
								<div class="mt-3">
									<label for="draft-search" class="mb-1.5 block text-sm font-medium text-slate-700 dark:text-slate-300">Palabra o tema</label>
									<input id="draft-search" bind:value={search} type="text" placeholder="Ej. feedback, entrega, bloqueo" class="block w-full rounded-2xl border border-slate-300 bg-white px-3 py-2.5 text-sm text-slate-900 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-200 dark:border-slate-600 dark:bg-slate-900 dark:text-white dark:focus:ring-blue-900" />
								</div>
							</div>
						</div>

						<aside class="rounded-2xl border border-slate-200 bg-slate-50 p-4 dark:border-slate-700 dark:bg-slate-800/60">
							<p class="text-sm font-semibold text-slate-900 dark:text-white">Resumen rapido</p>
							<div class="mt-3 flex flex-wrap gap-2">
								{#each draftSummaryChips as chip (chip)}
									<span class="rounded-full border border-slate-200 bg-white px-3 py-1 text-xs text-slate-600 dark:border-slate-600 dark:bg-slate-900 dark:text-slate-300">{chip}</span>
								{/each}
							</div>
							<p class="mt-4 text-xs leading-5 text-slate-500 dark:text-slate-400">
								La respuesta pedira siempre separar "Datos observados" de "Interpretacion o recomendacion de la IA".
							</p>
							{#if selectedTemplate.recommendedTools && selectedTemplate.recommendedTools.length > 0}
								<div class="mt-4 rounded-2xl border border-slate-200 bg-white p-3 text-xs text-slate-500 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-400">
									<p class="font-medium text-slate-900 dark:text-white">Enfoque recomendado</p>
									<p class="mt-1">Esta plantilla prioriza comparacion, dificultad o progreso para producir una lectura mas analitica.</p>
								</div>
							{/if}
						</aside>
					</div>

					<div class="mt-6 flex flex-col gap-3 border-t border-slate-200 pt-5 sm:flex-row sm:justify-between dark:border-slate-700">
						<button type="button" class="inline-flex items-center justify-center gap-2 rounded-xl border border-slate-300 px-4 py-2.5 text-sm font-medium text-slate-700 transition hover:bg-slate-50 dark:border-slate-600 dark:text-slate-200 dark:hover:bg-slate-800" onclick={() => goToDraftStep(1)}>
							<ChevronLeft class="h-4 w-4" />
							Atras
						</button>
						<button type="button" class="inline-flex items-center justify-center gap-2 rounded-xl bg-blue-600 px-4 py-2.5 text-sm font-medium text-white transition hover:bg-blue-700 disabled:opacity-50" onclick={() => goToDraftStep(3)} disabled={!canContinueToReview}>
							Revisar antes de crear
							<ArrowRight class="h-4 w-4" />
						</button>
					</div>
				</div>
			{:else if currentStep === 3 && selectedTemplate}
				<div class="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm dark:border-slate-700 dark:bg-slate-900">
					<div class="max-w-3xl">
						<p class="text-sm font-medium text-blue-700 dark:text-blue-300">{selectedTemplate.title}</p>
						<h2 class="mt-1 text-xl font-semibold text-slate-900 dark:text-white">Paso 3. Revise y cree el analisis</h2>
						<p class="mt-2 text-sm text-slate-500 dark:text-slate-400">Revise el alcance y confirme. Al crear el analisis, el primer mensaje se enviara automaticamente para evitar un chat vacio.</p>
					</div>

					<div class="mt-6 grid gap-5 lg:grid-cols-[minmax(0,1fr)_320px]">
						<div class="space-y-5">
							<div class="rounded-2xl border border-slate-200 bg-slate-50 p-5 dark:border-slate-700 dark:bg-slate-800/60">
								<div class="flex items-start gap-3">
									<LayoutTemplate class="mt-0.5 h-5 w-5 text-blue-600 dark:text-blue-300" />
									<div>
										<p class="text-sm font-medium text-slate-900 dark:text-white">Plantilla seleccionada</p>
										<p class="mt-1 text-sm text-slate-600 dark:text-slate-300">{selectedTemplate.description}</p>
									</div>
								</div>
							</div>

							<div class="grid gap-4 md:grid-cols-2">
								<div class="rounded-2xl border border-slate-200 bg-white p-4 dark:border-slate-700 dark:bg-slate-900/80">
									<p class="text-sm font-medium text-slate-900 dark:text-white">Datos incluidos</p>
									<div class="mt-3 flex flex-wrap gap-2">
										{#each draftSummaryChips as chip (chip)}
											<span class="rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-xs text-slate-600 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-300">{chip}</span>
										{/each}
									</div>
								</div>

								<div class="rounded-2xl border border-amber-200 bg-amber-50 p-4 dark:border-amber-800 dark:bg-amber-950/20">
									<p class="text-sm font-medium text-amber-900 dark:text-amber-100">Revision humana</p>
									<p class="mt-2 text-sm text-amber-800 dark:text-amber-200">La IA propone; el docente revisa. Todos los borradores deben validarse antes de compartirse con estudiantes.</p>
								</div>
							</div>

							<div class="rounded-2xl border border-slate-200 bg-slate-50 p-5 dark:border-slate-700 dark:bg-slate-800/60">
								<p class="text-sm font-medium text-slate-900 dark:text-white">Primer mensaje que se lanzara</p>
								<p class="mt-3 whitespace-pre-wrap text-sm leading-6 text-slate-600 dark:text-slate-300">{initialPrompt}</p>
							</div>
						</div>

						<aside class="rounded-2xl border border-slate-200 bg-slate-50 p-4 dark:border-slate-700 dark:bg-slate-800/60">
							<p class="text-sm font-semibold text-slate-900 dark:text-white">Antes de crear</p>
							<ul class="mt-3 space-y-3 text-sm text-slate-600 dark:text-slate-300">
								<li class="flex gap-2"><CheckCircle2 class="mt-0.5 h-4 w-4 text-emerald-600 dark:text-emerald-300" />El analisis quedara guardado para volver mas tarde.</li>
								<li class="flex gap-2"><CheckCircle2 class="mt-0.5 h-4 w-4 text-emerald-600 dark:text-emerald-300" />La salida pedira separar observaciones de recomendaciones.</li>
								<li class="flex gap-2"><CheckCircle2 class="mt-0.5 h-4 w-4 text-emerald-600 dark:text-emerald-300" />Los borradores de comunicacion no se envian automaticamente.</li>
							</ul>
						</aside>
					</div>

					<div class="mt-6 flex flex-col gap-3 border-t border-slate-200 pt-5 sm:flex-row sm:justify-between dark:border-slate-700">
						<button type="button" class="inline-flex items-center justify-center gap-2 rounded-xl border border-slate-300 px-4 py-2.5 text-sm font-medium text-slate-700 transition hover:bg-slate-50 dark:border-slate-600 dark:text-slate-200 dark:hover:bg-slate-800" onclick={() => goToDraftStep(2)}>
							<ChevronLeft class="h-4 w-4" />
							Editar alcance
						</button>
						<button type="button" class="inline-flex items-center justify-center gap-2 rounded-xl bg-blue-600 px-4 py-2.5 text-sm font-medium text-white transition hover:bg-blue-700 disabled:opacity-50" onclick={createRun} disabled={!canCreateRun || isCreatingRun}>
							{isCreatingRun ? 'Creando analisis...' : 'Crear analisis'}
							<ArrowRight class="h-4 w-4" />
						</button>
					</div>
				</div>
			{:else if currentStep === 4 && data.selectedRun}
				<div class="space-y-4">
					<div class="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-700 dark:bg-slate-900">
						<div class="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
							<div class="max-w-3xl">
								<div class="inline-flex items-center gap-2 rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-xs text-slate-600 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300">
									<Bot class="h-3.5 w-3.5" />
									{selectedRunTemplate?.title ?? 'Analisis guiado'}
								</div>
								<h2 class="mt-3 text-2xl font-semibold text-slate-900 dark:text-white">{data.selectedRun.title || 'Analisis sin titulo'}</h2>
								<p class="mt-2 text-sm leading-6 text-slate-600 dark:text-slate-300">{selectedRunObjective}</p>
								<div class="mt-4 flex flex-wrap gap-2">
									{#each selectedRunScopeSummary as chip (chip)}
										<span class="rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-xs text-slate-600 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-300">{chip}</span>
									{/each}
								</div>
							</div>

							<div class="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-600 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300">
								<div>Creado: {new Date(data.selectedRun.createdAt).toLocaleString('es-ES')}</div>
								{#if data.selectedRun.lastMessageAt}
									<div class="mt-1">Ultima actividad: {new Date(data.selectedRun.lastMessageAt).toLocaleString('es-ES')}</div>
								{/if}
							</div>
						</div>

						<div class="mt-5 grid gap-4 lg:grid-cols-2">
							<div class="rounded-2xl border border-slate-200 bg-slate-50 p-4 dark:border-slate-700 dark:bg-slate-800/60">
								<div class="flex items-center gap-2">
									<ListChecks class="h-4 w-4 text-slate-500 dark:text-slate-300" />
									<p class="text-sm font-semibold text-slate-900 dark:text-white">Como leer la respuesta</p>
								</div>
								<p class="mt-2 text-sm text-slate-600 dark:text-slate-300">Este asistente debe separar siempre "Datos observados" de "Interpretacion o recomendacion de la IA" para que pueda validar cada paso.</p>
							</div>

							<div class="rounded-2xl border border-amber-200 bg-amber-50 p-4 dark:border-amber-800 dark:bg-amber-950/20">
								<div class="flex items-center gap-2">
									<ShieldCheck class="h-4 w-4 text-amber-700 dark:text-amber-300" />
									<p class="text-sm font-semibold text-amber-900 dark:text-amber-100">Regla de seguridad</p>
								</div>
								<p class="mt-2 text-sm text-amber-800 dark:text-amber-200">Todo se genera como borrador revisable. Ningun mensaje a estudiantes se envia automaticamente desde esta pantalla.</p>
							</div>
						</div>

						{#if !selectedRunEditable}
							<div class="mt-4 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800 dark:border-amber-800 dark:bg-amber-950/30 dark:text-amber-200">
								Este analisis fue creado por otra persona administradora. Puede revisarlo, pero no continuarlo ni lanzar nuevas acciones desde aqui.
							</div>
						{/if}
					</div>

					{#if selectedRunTemplate}
						<div class="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-700 dark:bg-slate-900">
							<div class="flex items-center justify-between gap-3">
								<div>
									<h3 class="text-lg font-semibold text-slate-900 dark:text-white">Acciones sugeridas</h3>
									<p class="mt-1 text-sm text-slate-500 dark:text-slate-400">Borradores seguros para continuar el trabajo sin volver a redactar desde cero.</p>
								</div>
								<span class="rounded-full bg-slate-100 px-3 py-1 text-xs text-slate-600 dark:bg-slate-800 dark:text-slate-300">Preparan el mensaje en el chat</span>
							</div>

							<div class="mt-5 grid gap-4 lg:grid-cols-3">
								{#each selectedRunTemplate.quickActions as action (action.id)}
									<div class="rounded-2xl border border-slate-200 bg-slate-50 p-4 dark:border-slate-700 dark:bg-slate-800/60">
										<div class="flex h-10 w-10 items-center justify-center rounded-2xl bg-white shadow-sm dark:bg-slate-900">
											{#if action.id.includes('email')}
												<Mail class="h-4 w-4 text-blue-600 dark:text-blue-300" />
											{:else if action.id.includes('notification')}
												<MessageSquareMore class="h-4 w-4 text-emerald-600 dark:text-emerald-300" />
											{:else}
												<Lightbulb class="h-4 w-4 text-amber-600 dark:text-amber-300" />
											{/if}
										</div>
										<h4 class="mt-4 font-medium text-slate-900 dark:text-white">{action.title}</h4>
										<p class="mt-2 text-sm leading-6 text-slate-600 dark:text-slate-300">{action.description}</p>
										<button
											type="button"
											class="mt-4 inline-flex items-center justify-center rounded-xl border border-slate-300 px-3 py-2 text-sm font-medium text-slate-700 transition hover:bg-white disabled:opacity-50 dark:border-slate-600 dark:text-slate-200 dark:hover:bg-slate-900"
											onclick={() =>
												selectedRunActionContext &&
												prepareQuickAction(action.promptFactory(selectedRunActionContext))}
											disabled={!selectedRunEditable}
										>
											{action.buttonLabel}
										</button>
									</div>
								{/each}
							</div>
						</div>
					{/if}

					<div class="overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-sm dark:border-slate-700 dark:bg-slate-900">
						{#if selectedRunEditable}
							<div class="border-b border-slate-200 px-5 py-4 dark:border-slate-700">
								<p class="text-sm font-medium text-slate-900 dark:text-white">Conversacion del analisis</p>
								<p class="mt-1 text-sm text-slate-500 dark:text-slate-400">Continua el analisis o prepara borradores desde las acciones sugeridas.</p>
							</div>
							<div class="h-[calc(100vh-24rem)] min-h-[34rem]">
								{#key data.selectedRun.id}
									<AgentChatComponent bind:this={chatApi} initialMessages={data.selectedRun.messages} apiEndpoint={apiEndpoint} />
								{/key}
							</div>
						{:else}
							<div class="border-b border-slate-200 px-5 py-4 dark:border-slate-700">
								<p class="text-sm font-medium text-slate-900 dark:text-white">Historial en modo lectura</p>
								<p class="mt-1 text-sm text-slate-500 dark:text-slate-400">Puede revisar la trazabilidad, pero no continuar la conversacion.</p>
							</div>
							<div class="max-h-[42rem] space-y-4 overflow-y-auto p-5">
								{#if data.selectedRun.messages.length === 0}
									<div class="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-5 text-sm text-slate-500 dark:border-slate-700 dark:bg-slate-800/60 dark:text-slate-300">Este analisis aun no tiene mensajes guardados.</div>
								{/if}
								{#each data.selectedRun.messages as message (message.id)}
									<div class={`flex ${message.role === 'user' ? 'justify-end' : 'justify-start'}`}>
										<div class={`max-w-[85%] rounded-2xl px-4 py-3 text-sm ${message.role === 'user' ? 'bg-blue-600 text-white' : 'border border-slate-200 bg-slate-50 text-slate-900 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100'}`}>
											{#each message.parts as part}
												{#if part.kind === 'text'}
													<div class="whitespace-pre-wrap leading-6">{part.content}</div>
												{:else if part.kind === 'tool-call'}
													<div class="mt-2 rounded-xl border border-slate-200 px-3 py-2 text-xs dark:border-slate-700">
														<div class="font-medium">{part.toolDisplayName}</div>
														<div class="mt-1 opacity-75">Estado: {part.status}</div>
													</div>
												{/if}
											{/each}
										</div>
									</div>
								{/each}
							</div>
						{/if}
					</div>
				</div>
			{/if}
		</section>

		<aside class="space-y-4">
			<div class="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-700 dark:bg-slate-900">
				<div class="flex items-start justify-between gap-3">
					<div>
						<h2 class="text-lg font-semibold text-slate-900 dark:text-white">Configuracion recomendada activa</h2>
						<p class="mt-1 text-sm text-slate-500 dark:text-slate-400">Los ajustes tecnicos quedan fuera del flujo principal para no mezclar tareas.</p>
					</div>
					<Wrench class="mt-1 h-5 w-5 text-slate-400 dark:text-slate-500" />
				</div>

				<div class="mt-4 space-y-3 text-sm text-slate-600 dark:text-slate-300">
					<div class="rounded-2xl bg-slate-50 px-4 py-3 dark:bg-slate-800/60">
						<div class="text-xs uppercase tracking-wide text-slate-500 dark:text-slate-400">Modelo</div>
						<div class="mt-1 font-medium text-slate-900 dark:text-white">{configurationSummary.model}</div>
					</div>
					<div class="grid grid-cols-2 gap-3">
						<div class="rounded-2xl bg-slate-50 px-4 py-3 dark:bg-slate-800/60">
							<div class="text-xs uppercase tracking-wide text-slate-500 dark:text-slate-400">Herramientas</div>
							<div class="mt-1 font-medium text-slate-900 dark:text-white">{configurationSummary.toolCount}</div>
						</div>
						<div class="rounded-2xl bg-slate-50 px-4 py-3 dark:bg-slate-800/60">
							<div class="text-xs uppercase tracking-wide text-slate-500 dark:text-slate-400">Rondas</div>
							<div class="mt-1 font-medium text-slate-900 dark:text-white">{data.config.maxToolRoundtrips}</div>
						</div>
					</div>
					<div class="rounded-2xl bg-slate-50 px-4 py-3 dark:bg-slate-800/60">
						<div class="text-xs uppercase tracking-wide text-slate-500 dark:text-slate-400">Uso de herramientas</div>
						<div class="mt-1 font-medium text-slate-900 dark:text-white">{configurationSummary.toolChoice}</div>
						<div class="mt-1 text-xs text-slate-500 dark:text-slate-400">{configurationSummary.parallelToolCalls}</div>
					</div>
				</div>

				<a href={settingsHref} class="mt-4 inline-flex items-center gap-2 text-sm font-medium text-blue-700 hover:text-blue-800 dark:text-blue-300 dark:hover:text-blue-200">
					Ajustes avanzados
					<ArrowRight class="h-4 w-4" />
				</a>
			</div>

			<div class="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-700 dark:bg-slate-900">
				<div class="flex items-center justify-between gap-3">
					<div>
						<h2 class="text-lg font-semibold text-slate-900 dark:text-white">Analisis recientes</h2>
						<p class="mt-1 text-sm text-slate-500 dark:text-slate-400">{recentRunCountLabel}</p>
					</div>
					<FileText class="h-5 w-5 text-slate-400 dark:text-slate-500" />
				</div>

				<div class="mt-4 space-y-3">
					{#if data.runs.length === 0}
						<div class="rounded-2xl border border-dashed border-slate-300 px-4 py-5 text-sm text-slate-500 dark:border-slate-600 dark:text-slate-300">Aun no hay analisis creados. Elija una plantilla para empezar.</div>
					{:else}
						{#each data.runs as run (run.id)}
							<a href={`?run=${run.id}`} class={`block rounded-2xl border px-4 py-3 transition ${data.selectedRun?.id === run.id ? 'border-blue-500 bg-blue-50 dark:border-blue-400 dark:bg-blue-950/30' : 'border-slate-200 bg-slate-50 hover:border-slate-300 hover:bg-white dark:border-slate-700 dark:bg-slate-800/50 dark:hover:border-slate-600 dark:hover:bg-slate-800'}`}>
								<div class="flex items-start justify-between gap-3">
									<div class="min-w-0">
										<div class="truncate text-sm font-medium text-slate-900 dark:text-white">{run.title || 'Analisis sin titulo'}</div>
										<div class="mt-1 text-xs text-slate-500 dark:text-slate-400">{run.scope.studentIds.length === 1 ? 'Individual' : 'Cohorte'} · {run.status}</div>
									</div>
									<div class="text-[11px] text-slate-400">{new Date(run.updatedAt).toLocaleDateString('es-ES')}</div>
								</div>
								{#if run.summary}
									<p class="mt-2 line-clamp-2 text-xs text-slate-600 dark:text-slate-300">{run.summary}</p>
								{/if}
							</a>
						{/each}
					{/if}
				</div>
			</div>

			<div class="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-700 dark:bg-slate-900">
				<h2 class="text-lg font-semibold text-slate-900 dark:text-white">Contexto de la actividad</h2>
				<p class="mt-3 text-sm font-medium text-slate-900 dark:text-white">{data.activityContext.name}</p>
				{#if data.activityContext.description}
					<p class="mt-2 text-sm leading-6 text-slate-500 dark:text-slate-400">{data.activityContext.description}</p>
				{/if}

				<div class="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-1">
					<div class="rounded-2xl bg-slate-50 px-4 py-3 dark:bg-slate-800/60">
						<div class="text-xs uppercase tracking-wide text-slate-500 dark:text-slate-400">Participacion media</div>
						<div class="mt-1 font-medium text-slate-900 dark:text-white">{Math.round(data.metrics.engagement.overallScore)}%</div>
					</div>
					<div class="rounded-2xl bg-slate-50 px-4 py-3 dark:bg-slate-800/60">
						<div class="text-xs uppercase tracking-wide text-slate-500 dark:text-slate-400">Estudiantes en riesgo</div>
						<div class="mt-1 font-medium text-slate-900 dark:text-white">{data.metrics.earlyWarning.totalAtRisk}</div>
					</div>
					<div class="rounded-2xl bg-slate-50 px-4 py-3 dark:bg-slate-800/60">
						<div class="text-xs uppercase tracking-wide text-slate-500 dark:text-slate-400">Ultima actividad</div>
						<div class="mt-1 font-medium text-slate-900 dark:text-white">{data.overview.lastActivityAt ? new Date(data.overview.lastActivityAt).toLocaleDateString('es-ES') : 'Sin actividad aun'}</div>
					</div>
				</div>
			</div>
		</aside>
	</div>
</div>
