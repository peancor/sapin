<script lang="ts">
	import { Dropdown, DropdownItem, Modal, Badge } from 'flowbite-svelte';
	import { BookOpen, ExternalLink, FileText, HelpCircle, Link } from 'lucide-svelte';
	import {
		buildMoodleActivityBaseUrl,
		buildMoodleActivityFilterCodesUrl,
		type MoodleActivityLinkTarget
	} from '$lib/utils';

	interface Props {
		interactive: MoodleActivityLinkTarget & { name?: string };
		notify: (message: string, type: 'success' | 'error') => void;
		buttonClass?: string;
		label?: string;
		triggerIdPrefix?: string;
	}

	let {
		interactive,
		notify,
		buttonClass = 'rounded p-2 text-gray-400 hover:bg-gray-100 hover:text-gray-600 dark:hover:bg-gray-600',
		label,
		triggerIdPrefix = 'moodle-activity-link-menu'
	}: Props = $props();

	let showGuide = $state(false);
	const triggerId = $derived(`${triggerIdPrefix}-${interactive.id}`);

	async function copyTextToClipboard(value: string) {
		try {
			await navigator.clipboard.writeText(value);
		} catch {
			const textarea = document.createElement('textarea');
			textarea.value = value;
			textarea.setAttribute('readonly', '');
			textarea.style.position = 'absolute';
			textarea.style.left = '-9999px';
			document.body.appendChild(textarea);
			textarea.select();
			document.execCommand('copy');
			document.body.removeChild(textarea);
		}
	}

	async function copyRecommendedUrl() {
		try {
			await copyTextToClipboard(buildMoodleActivityBaseUrl(interactive, window.location.origin));
			notify('URL para recurso URL de Moodle copiada', 'success');
		} catch {
			notify('Error al copiar el enlace', 'error');
		}
	}

	async function copyFilterCodesUrl() {
		try {
			await copyTextToClipboard(
				buildMoodleActivityFilterCodesUrl(interactive, window.location.origin)
			);
			notify('Enlace con FilterCodes copiado', 'success');
		} catch {
			notify('Error al copiar el enlace', 'error');
		}
	}
</script>

<button type="button" id={triggerId} class={buttonClass} title="Opciones de enlace para Moodle">
	<Link class="h-4 w-4" />
	{#if label}
		<span>{label}</span>
	{:else}
		<span class="sr-only">Opciones de enlace para Moodle</span>
	{/if}
</button>

<Dropdown triggeredBy={`#${triggerId}`} simple class="w-80">
	<DropdownItem onclick={copyRecommendedUrl}>
		<div class="flex items-start gap-3">
			<ExternalLink class="text-primary-600 dark:text-primary-400 mt-0.5 h-4 w-4" />
			<div>
				<div class="flex items-center gap-2 font-medium text-gray-900 dark:text-white">
					Recurso URL de Moodle
					<Badge color="green" class="text-[0.65rem]">Recomendado</Badge>
				</div>
				<p class="mt-1 text-xs text-gray-500 dark:text-gray-400">
					Copia la URL base y configura Variables de URL en Moodle.
				</p>
			</div>
		</div>
	</DropdownItem>
	<DropdownItem onclick={copyFilterCodesUrl}>
		<div class="flex items-start gap-3">
			<FileText class="mt-0.5 h-4 w-4 text-gray-500 dark:text-gray-400" />
			<div>
				<div class="font-medium text-gray-900 dark:text-white">Contenido con FilterCodes</div>
				<p class="mt-1 text-xs text-gray-500 dark:text-gray-400">
					Para páginas, etiquetas, libros o textos donde Moodle procese {`{userid}`}.
				</p>
			</div>
		</div>
	</DropdownItem>
	<DropdownItem onclick={() => (showGuide = true)}>
		<div class="flex items-start gap-3">
			<HelpCircle class="mt-0.5 h-4 w-4 text-gray-500 dark:text-gray-400" />
			<div>
				<div class="font-medium text-gray-900 dark:text-white">Ver guía rápida</div>
				<p class="mt-1 text-xs text-gray-500 dark:text-gray-400">
					Pasos para configurar el enlace.
				</p>
			</div>
		</div>
	</DropdownItem>
</Dropdown>

<Modal bind:open={showGuide} size="lg" autoclose={false}>
	<div class="space-y-6">
		<div class="flex items-start gap-4">
			<div
				class="bg-primary-100 text-primary-700 dark:bg-primary-900/40 dark:text-primary-300 flex h-11 w-11 shrink-0 items-center justify-center rounded-lg"
			>
				<BookOpen class="h-5 w-5" />
			</div>
			<div>
				<h3 class="text-xl font-bold text-gray-900 dark:text-white">
					Publicar esta actividad en Moodle
				</h3>
				<p class="mt-1 text-sm text-gray-500 dark:text-gray-400">
					Usa esta guía cuando vayas a añadir la actividad como recurso URL en Moodle.
				</p>
			</div>
		</div>

		<div
			class="rounded-lg border border-blue-200 bg-blue-50 p-4 dark:border-blue-800 dark:bg-blue-950/30"
		>
			<p class="text-sm font-semibold text-blue-900 dark:text-blue-100">
				Opción recomendada para docentes
			</p>
			<p class="mt-1 text-sm text-blue-800 dark:text-blue-200">
				Copia <strong>Recurso URL de Moodle</strong>, pega esa URL en Moodle y añade la variable
				<code class="rounded bg-white px-1 py-0.5 text-xs dark:bg-gray-900">externalId</code>.
			</p>
		</div>

		<ol class="space-y-3 text-sm text-gray-700 dark:text-gray-300">
			<li class="flex gap-3">
				<span class="font-semibold text-gray-900 dark:text-white">1.</span>
				<span>En Sapin, elige <strong>Recurso URL de Moodle</strong> para copiar la URL base.</span>
			</li>
			<li class="flex gap-3">
				<span class="font-semibold text-gray-900 dark:text-white">2.</span>
				<span>En Moodle, activa edición y añade un recurso de tipo <strong>URL</strong>.</span>
			</li>
			<li class="flex gap-3">
				<span class="font-semibold text-gray-900 dark:text-white">3.</span>
				<span>Pega la URL copiada en el campo <strong>URL externa</strong>.</span>
			</li>
			<li class="flex gap-3">
				<span class="font-semibold text-gray-900 dark:text-white">4.</span>
				<span>
					Abre <strong>Variables de URL</strong> y configura
					<code class="rounded bg-gray-100 px-1 py-0.5 text-xs dark:bg-gray-800">externalId</code>
					como <strong>Usuario &gt; id</strong>.
				</span>
			</li>
			<li class="flex gap-3">
				<span class="font-semibold text-gray-900 dark:text-white">5.</span>
				<span>Guarda el recurso y pruébalo con una cuenta de estudiante.</span>
			</li>
		</ol>

		<div
			class="rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900 dark:border-amber-800 dark:bg-amber-950/30 dark:text-amber-100"
		>
			<p class="font-semibold">No pegues FilterCodes en el campo URL del recurso URL.</p>
			<p class="mt-1">
				La opción con <code class="rounded bg-white px-1 py-0.5 text-xs dark:bg-gray-900"
					>{`{userid}`}</code
				>
				solo es para contenidos donde Moodle sí procese FilterCodes, como páginas, etiquetas, libros o
				texto enriquecido.
			</p>
		</div>
	</div>
</Modal>
