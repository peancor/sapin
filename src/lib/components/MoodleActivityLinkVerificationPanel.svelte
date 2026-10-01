<script lang="ts">
	import { AlertTriangle, CheckCircle2, ClipboardCheck, ExternalLink, Info } from 'lucide-svelte';
	import { resolve } from '$app/paths';
	import type { MoodleLinkVerification } from '$lib/types/moodleLinkVerification';

	interface Props {
		verification: MoodleLinkVerification;
	}

	let { verification }: Props = $props();

	const statusLabel = $derived(
		verification.hasValidIdentifier
			? 'Identificador válido recibido'
			: verification.hasIdentifier
				? 'Identificador no válido'
				: 'Falta el identificador'
	);
	const title = $derived(
		verification.hasValidIdentifier
			? 'Enlace Moodle detectado correctamente'
			: verification.hasIdentifier
				? 'Moodle no ha sustituido el identificador'
				: 'Moodle no está enviando el identificador'
	);
	const description = $derived(
		verification.hasValidIdentifier
			? 'Sapin ha recibido el parámetro de usuario desde Moodle. No se inicia la actividad porque esta sesión pertenece a personal docente.'
			: verification.hasIdentifier
				? 'Sapin ha recibido el parámetro, pero el valor no es numérico. Esto suele indicar que Moodle está enviando la plantilla literal en vez de sustituirla por el id del usuario.'
				: 'El enlace llega a Sapin, pero Moodle no ha añadido el parámetro de usuario. Revisa Variables de URL en el recurso Moodle.'
	);
	const badgeClasses = $derived(
		verification.hasValidIdentifier
			? 'border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-200'
			: 'border-amber-200 bg-amber-50 text-amber-800 dark:border-amber-800 dark:bg-amber-950/40 dark:text-amber-100'
	);
	const Icon = $derived(verification.hasValidIdentifier ? CheckCircle2 : AlertTriangle);
</script>

<div class="min-h-screen bg-gray-50 px-4 py-10 text-gray-900 dark:bg-gray-950 dark:text-white">
	<div class="mx-auto flex w-full max-w-3xl flex-col gap-6">
		<section
			class="rounded-lg border border-gray-200 bg-white p-6 shadow-sm dark:border-gray-800 dark:bg-gray-900"
		>
			<div class="flex flex-col gap-5 sm:flex-row sm:items-start">
				<div
					class={`inline-flex h-12 w-12 shrink-0 items-center justify-center rounded-lg border ${badgeClasses}`}
				>
					<Icon class="h-6 w-6" />
				</div>
				<div class="min-w-0 flex-1">
					<p
						class={`mb-3 inline-flex rounded-full border px-3 py-1 text-xs font-medium ${badgeClasses}`}
					>
						{statusLabel}
					</p>
					<h1 class="text-2xl font-bold tracking-normal">{title}</h1>
					<p class="mt-2 text-sm leading-6 text-gray-600 dark:text-gray-300">{description}</p>
				</div>
			</div>
		</section>

		<section class="grid gap-4 md:grid-cols-2">
			<div
				class="rounded-lg border border-gray-200 bg-white p-5 dark:border-gray-800 dark:bg-gray-900"
			>
				<div class="mb-4 flex items-center gap-2 text-sm font-semibold">
					<ClipboardCheck class="h-4 w-4 text-blue-600 dark:text-blue-300" />
					Actividad
				</div>
				<dl class="space-y-3 text-sm">
					<div>
						<dt class="text-gray-500 dark:text-gray-400">Nombre</dt>
						<dd class="mt-1 font-medium">{verification.activityName}</dd>
					</div>
					<div>
						<dt class="text-gray-500 dark:text-gray-400">Curso</dt>
						<dd class="mt-1 font-medium">{verification.courseName ?? 'Sin curso asociado'}</dd>
					</div>
					<div>
						<dt class="text-gray-500 dark:text-gray-400">Estado</dt>
						<dd class="mt-1 font-medium">{verification.activityStatus}</dd>
					</div>
				</dl>
			</div>

			<div
				class="rounded-lg border border-gray-200 bg-white p-5 dark:border-gray-800 dark:bg-gray-900"
			>
				<div class="mb-4 flex items-center gap-2 text-sm font-semibold">
					<Info class="h-4 w-4 text-blue-600 dark:text-blue-300" />
					Parámetro Moodle
				</div>
				{#if verification.hasIdentifier}
					<dl class="space-y-3 text-sm">
						<div>
							<dt class="text-gray-500 dark:text-gray-400">Parámetro recibido</dt>
							<dd class="mt-1 font-mono text-base">{verification.parameterName}</dd>
						</div>
						<div>
							<dt class="text-gray-500 dark:text-gray-400">Valor recibido</dt>
							<dd class="mt-1 font-mono text-base break-all">{verification.parameterValue}</dd>
						</div>
					</dl>
					{#if verification.isLegacyParameter}
						<p
							class="mt-4 rounded-lg border border-blue-200 bg-blue-50 p-3 text-sm text-blue-800 dark:border-blue-800 dark:bg-blue-950/40 dark:text-blue-100"
						>
							Este enlace usa un parámetro compatible antiguo. La recomendación actual es usar
							<code>id</code>.
						</p>
					{/if}
					{#if !verification.hasValidIdentifier}
						<p
							class="mt-4 rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900 dark:border-amber-800 dark:bg-amber-950/40 dark:text-amber-100"
						>
							El valor debe ser numérico, por ejemplo
							<code>12345</code>. Si ves algo como <code>{'{userid}'}</code>, Moodle no está
							sustituyendo la variable de usuario.
						</p>
					{/if}
				{:else}
					<p class="text-sm leading-6 text-gray-600 dark:text-gray-300">
						Configura en Moodle la variable de URL
						<code class="rounded bg-gray-100 px-1 py-0.5 dark:bg-gray-800">id</code>
						con el valor <strong>Usuario &gt; id</strong>.
					</p>
				{/if}
			</div>
		</section>

		<section
			class="rounded-lg border border-gray-200 bg-white p-5 text-sm text-gray-600 dark:border-gray-800 dark:bg-gray-900 dark:text-gray-300"
		>
			<p>
				Esta comprobación solo valida la configuración técnica del enlace. Para probar el flujo
				completo, abre la actividad desde Moodle con una cuenta de estudiante importada en Sapin.
			</p>
			{#if verification.courseId}
				<a
					class="mt-4 inline-flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700"
					href={resolve(`/course/${verification.courseId}/admin`)}
				>
					Volver al curso
					<ExternalLink class="h-4 w-4" />
				</a>
			{/if}
		</section>
	</div>
</div>
