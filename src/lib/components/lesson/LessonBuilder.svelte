<script lang="ts">
	import {
		ArrowDown,
		ArrowUp,
		BookOpenText,
		Bot,
		Flag,
		GitBranch,
		ListChecks,
		Plus,
		Trash2
	} from 'lucide-svelte';
	import type {
		LessonAgentBlock,
		LessonBlock,
		LessonBlockKind,
		LessonChoiceBlock,
		LessonDefinition,
		LessonOutputField,
		LessonSessionPolicy,
		LessonTransitionCondition
	} from '$lib/types/lesson';

	type BuilderFile = {
		id: string;
		name: string;
		mimeType: string;
	};

	let {
		definition,
		files = [],
		sessionPolicy = 'resume_latest',
		allowRestart = true,
		definitionInputName = 'lessonDefinition',
		sessionPolicyInputName = 'sessionPolicy',
		allowRestartInputName = 'allowRestart',
		onchange
	}: {
		definition: LessonDefinition;
		files?: BuilderFile[];
		sessionPolicy?: LessonSessionPolicy;
		allowRestart?: boolean;
		definitionInputName?: string;
		sessionPolicyInputName?: string;
		allowRestartInputName?: string;
		onchange?: () => void;
	} = $props();

	let builder = $state<LessonDefinition>(structuredClone(definition));
	let runtimeSessionPolicy = $state<LessonSessionPolicy>(sessionPolicy);
	let runtimeAllowRestart = $state(allowRestart);

	const blockIds = $derived(builder.blocks.map((block) => block.id));
	const serializedDefinition = $derived(JSON.stringify(builder, null, 2));
	const availableVariables = $derived(computeAvailableVariables(builder));
	const previewLines = $derived(computePreviewLines(builder));

	function touch() {
		builder = structuredClone(builder);
		onchange?.();
	}

	function ensureUniqueId(base: string) {
		let candidate = base.replace(/[^a-zA-Z0-9_-]/g, '_') || 'block';
		let counter = 1;

		while (builder.blocks.some((block) => block.id === candidate)) {
			candidate = `${base}_${counter}`;
			counter += 1;
		}

		return candidate;
	}

	function createBlock(kind: LessonBlockKind): LessonBlock {
		const id = ensureUniqueId(kind);
		if (kind === 'content') {
			return {
				id,
				kind,
				title: 'Nuevo contenido',
				body: '',
				continueLabel: 'Siguiente',
				next: null,
				assetRefs: []
			};
		}

		if (kind === 'choice') {
			return {
				id,
				kind,
				title: 'Nueva decisión',
				body: '',
				outputKey: 'selection',
				options: [
					{
						id: 'option_a',
						label: 'Opción A',
						value: 'a',
						targetBlockId: '',
						description: ''
					}
				]
			};
		}

		if (kind === 'agent') {
			return {
				id,
				kind,
				title: 'Nuevo bloque IA',
				body: '',
				next: null,
				requiresResponse: true,
				agentConfig: {
					mode: 'guided_turn',
					promptTemplate: '',
					systemPrompt: '',
					placeholder: 'Escribe tu respuesta',
					submitLabel: 'Enviar',
					continueLabel: 'Continuar',
					outputSchema: []
				}
			};
		}

		return {
			id,
			kind,
			title: 'Bloque final',
			body: '¡Has terminado!',
			ctaLabel: 'Volver al curso'
		};
	}

	function addBlock(kind: LessonBlockKind) {
		builder.blocks.push(createBlock(kind));
		if (!builder.entryBlockId) {
			builder.entryBlockId = builder.blocks[0]?.id || '';
		}
		touch();
	}

	function removeBlock(index: number) {
		const removed = builder.blocks[index];
		builder.blocks.splice(index, 1);
		if (builder.entryBlockId === removed?.id) {
			builder.entryBlockId = builder.blocks[0]?.id || '';
		}
		touch();
	}

	function moveBlock(index: number, direction: -1 | 1) {
		const target = index + direction;
		if (target < 0 || target >= builder.blocks.length) return;
		const [block] = builder.blocks.splice(index, 1);
		builder.blocks.splice(target, 0, block);
		touch();
	}

	function changeBlockKind(index: number, nextKind: LessonBlockKind) {
		const current = builder.blocks[index];
		const replacement = createBlock(nextKind);
		replacement.id = current.id;
		replacement.title = current.title;
		if (nextKind !== 'end') replacement.next = current.next ?? null;
		builder.blocks[index] = replacement;
		touch();
	}

	function addChoiceOption(index: number) {
		const block = builder.blocks[index] as LessonChoiceBlock;
		block.options.push({
			id: ensureUniqueId(`option_${block.options.length + 1}`),
			label: `Opción ${block.options.length + 1}`,
			value: `${block.options.length + 1}`,
			targetBlockId: '',
			description: ''
		});
		touch();
	}

	function addBranch(index: number) {
		const block = builder.blocks[index];
		block.branches = block.branches ?? [];
		block.branches.push({
			label: 'Nueva rama',
			targetBlockId: '',
			condition: {
				source: 'session.attemptNumber',
				operator: 'equals',
				value: 1
			}
		});
		touch();
	}

	function addOutputField(index: number) {
		const block = builder.blocks[index] as LessonAgentBlock;
		block.agentConfig.outputSchema = block.agentConfig.outputSchema ?? [];
		block.agentConfig.outputSchema.push({
			key: `field_${block.agentConfig.outputSchema.length + 1}`,
			type: 'string',
			description: ''
		});
		touch();
	}

	function ensureBranchCondition(branch: { condition?: LessonTransitionCondition }) {
		branch.condition ??= {
			source: 'session.attemptNumber',
			operator: 'equals',
			value: 1
		};

		return branch.condition;
	}

	function toggleAsset(blockIndex: number, fileId: string, checked: boolean) {
		const block = builder.blocks[blockIndex];
		if (block.kind !== 'content') return;

		block.assetRefs = block.assetRefs ?? [];
		if (checked) {
			if (!block.assetRefs.some((asset) => asset.fileId === fileId)) {
				block.assetRefs.push({ fileId });
			}
		} else {
			block.assetRefs = block.assetRefs.filter((asset) => asset.fileId !== fileId);
		}
		touch();
	}

	function computeAvailableVariables(current: LessonDefinition) {
		const variables = [
			{ path: 'session.id', description: 'Identificador del intento.' },
			{ path: 'session.attemptNumber', description: 'Número de intento del alumno.' },
			{ path: 'session.status', description: 'Estado actual de la sesión.' },
			{ path: 'session.currentBlockId', description: 'Bloque activo.' }
		];

		for (const block of current.blocks) {
			if (block.kind === 'choice') {
				const outputKey = block.outputKey || 'selection';
				variables.push(
					{ path: `blocks.${block.id}.outputs.${outputKey}`, description: 'Valor elegido.' },
					{ path: `blocks.${block.id}.outputs.selectedLabel`, description: 'Etiqueta elegida.' }
				);
			}

			if (block.kind === 'agent') {
				variables.push(
					{ path: `blocks.${block.id}.outputs.response`, description: 'Respuesta IA.' },
					{ path: `blocks.${block.id}.outputs.lastUserMessage`, description: 'Última entrada del alumno.' }
				);
				for (const field of block.agentConfig.outputSchema ?? []) {
					variables.push({
						path: `blocks.${block.id}.outputs.${field.key}`,
						description: field.description || 'Salida estructurada.'
					});
				}
			}
		}

		return variables;
	}

	function computePreviewLines(current: LessonDefinition) {
		return current.blocks.map((block) => {
			const exits: string[] = [];
			if (block.kind === 'choice') {
				for (const option of block.options) {
					exits.push(`${option.label || option.id} -> ${option.targetBlockId || 'sin destino'}`);
				}
			}
			for (const branch of block.branches ?? []) {
				exits.push(`${branch.label || 'rama'} -> ${branch.targetBlockId || 'sin destino'}`);
			}
			if (block.next) exits.push(`default -> ${block.next}`);
			return `${block.id} (${block.kind})${exits.length ? `: ${exits.join(' | ')}` : ''}`;
		});
	}
</script>

<input type="hidden" name={definitionInputName} value={serializedDefinition} />

<div class="space-y-6">
	<div class="rounded-xl border border-gray-200 bg-white p-5 dark:border-gray-700 dark:bg-gray-900/30">
		<div class="mb-4 flex items-center justify-between">
			<div>
				<h3 class="text-lg font-semibold text-gray-900 dark:text-white">Runtime de la lesson</h3>
				<p class="text-sm text-gray-500 dark:text-gray-400">
					Controla cómo se crean y reanudan los intentos.
				</p>
			</div>
		</div>

		<div class="grid gap-4 md:grid-cols-2">
			<label class="block">
				<span class="mb-2 block text-sm font-medium text-gray-700 dark:text-gray-300">Política de sesión</span>
				<select
					class="w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm dark:border-gray-600 dark:bg-gray-800 dark:text-white"
					name={sessionPolicyInputName}
					bind:value={runtimeSessionPolicy}
					onchange={onchange}
				>
					<option value="resume_latest">Reanudar el último intento</option>
					<option value="always_new_attempt">Crear un intento nuevo siempre</option>
				</select>
			</label>

			<label class="flex items-center gap-3 rounded-lg border border-gray-200 px-4 py-3 dark:border-gray-700">
				<input
					type="checkbox"
					class="h-4 w-4 rounded border-gray-300"
					name={allowRestartInputName}
					bind:checked={runtimeAllowRestart}
					onchange={onchange}
				/>
				<div>
					<p class="text-sm font-medium text-gray-800 dark:text-gray-100">Permitir reinicio</p>
					<p class="text-xs text-gray-500 dark:text-gray-400">Crear un intento nuevo conservando el histórico.</p>
				</div>
			</label>
		</div>
	</div>

	<div class="rounded-xl border border-gray-200 bg-white p-5 dark:border-gray-700 dark:bg-gray-900/30">
		<div class="mb-4 flex flex-wrap items-center justify-between gap-3">
			<div>
				<h3 class="text-lg font-semibold text-gray-900 dark:text-white">Bloques</h3>
				<p class="text-sm text-gray-500 dark:text-gray-400">
					Define la secuencia, ramas y salidas reutilizables de la lesson.
				</p>
			</div>
			<div class="flex flex-wrap gap-2">
				<button type="button" class="rounded-lg border px-3 py-2 text-sm" onclick={() => addBlock('content')}>
					<Plus class="mr-1 inline h-4 w-4" /> Contenido
				</button>
				<button type="button" class="rounded-lg border px-3 py-2 text-sm" onclick={() => addBlock('choice')}>
					<Plus class="mr-1 inline h-4 w-4" /> Decisión
				</button>
				<button type="button" class="rounded-lg border px-3 py-2 text-sm" onclick={() => addBlock('agent')}>
					<Plus class="mr-1 inline h-4 w-4" /> IA
				</button>
				<button type="button" class="rounded-lg border px-3 py-2 text-sm" onclick={() => addBlock('end')}>
					<Plus class="mr-1 inline h-4 w-4" /> Final
				</button>
			</div>
		</div>

		<div class="space-y-4">
			{#each builder.blocks as block, index (block.id)}
				<div class="rounded-xl border border-gray-200 p-4 dark:border-gray-700">
					<div class="mb-4 flex items-start justify-between gap-3">
						<div class="flex items-center gap-2">
							<div class="rounded-lg bg-gray-100 p-2 dark:bg-gray-800">
								{#if block.kind === 'content'}
									<BookOpenText class="h-4 w-4" />
								{:else if block.kind === 'choice'}
									<ListChecks class="h-4 w-4" />
								{:else if block.kind === 'agent'}
									<Bot class="h-4 w-4" />
								{:else}
									<Flag class="h-4 w-4" />
								{/if}
							</div>
							<div>
								<p class="text-sm font-semibold text-gray-900 dark:text-white">{block.title || block.id}</p>
								<p class="text-xs text-gray-500 dark:text-gray-400">{block.id}</p>
							</div>
						</div>
						<div class="flex gap-1">
							<button type="button" class="rounded p-2 hover:bg-gray-100 dark:hover:bg-gray-800" onclick={() => moveBlock(index, -1)}><ArrowUp class="h-4 w-4" /></button>
							<button type="button" class="rounded p-2 hover:bg-gray-100 dark:hover:bg-gray-800" onclick={() => moveBlock(index, 1)}><ArrowDown class="h-4 w-4" /></button>
							<button type="button" class="rounded p-2 text-red-600 hover:bg-red-50 dark:hover:bg-red-950/20" onclick={() => removeBlock(index)}><Trash2 class="h-4 w-4" /></button>
						</div>
					</div>

					<div class="grid gap-4 md:grid-cols-3">
						<label class="block">
							<span class="mb-1 block text-xs font-medium uppercase tracking-wide text-gray-500">ID</span>
							<input class="w-full rounded-lg border px-3 py-2 text-sm dark:border-gray-600 dark:bg-gray-800 dark:text-white" bind:value={block.id} oninput={touch} />
						</label>
						<label class="block md:col-span-2">
							<span class="mb-1 block text-xs font-medium uppercase tracking-wide text-gray-500">Título</span>
							<input class="w-full rounded-lg border px-3 py-2 text-sm dark:border-gray-600 dark:bg-gray-800 dark:text-white" bind:value={block.title} oninput={touch} />
						</label>
						<label class="block">
							<span class="mb-1 block text-xs font-medium uppercase tracking-wide text-gray-500">Tipo</span>
							<select class="w-full rounded-lg border px-3 py-2 text-sm dark:border-gray-600 dark:bg-gray-800 dark:text-white" bind:value={block.kind} onchange={(event) => changeBlockKind(index, (event.currentTarget as HTMLSelectElement).value as LessonBlockKind)}>
								<option value="content">Contenido</option>
								<option value="choice">Decisión</option>
								<option value="agent">IA</option>
								<option value="end">Final</option>
							</select>
						</label>
						<label class="block">
							<span class="mb-1 block text-xs font-medium uppercase tracking-wide text-gray-500">Bloque de entrada</span>
							<input type="radio" checked={builder.entryBlockId === block.id} onchange={() => { builder.entryBlockId = block.id; touch(); }} />
						</label>
					</div>

					{#if block.kind === 'content' || block.kind === 'choice' || block.kind === 'agent' || block.kind === 'end'}
						<label class="mt-4 block">
							<span class="mb-1 block text-xs font-medium uppercase tracking-wide text-gray-500">Contenido / descripción</span>
							<textarea class="min-h-28 w-full rounded-lg border px-3 py-2 text-sm dark:border-gray-600 dark:bg-gray-800 dark:text-white" bind:value={block.body} oninput={touch}></textarea>
						</label>
					{/if}

					{#if block.kind === 'content'}
						<div class="mt-4 grid gap-4 md:grid-cols-2">
							<label class="block">
								<span class="mb-1 block text-xs font-medium uppercase tracking-wide text-gray-500">Texto del botón</span>
								<input class="w-full rounded-lg border px-3 py-2 text-sm dark:border-gray-600 dark:bg-gray-800 dark:text-white" bind:value={block.continueLabel} oninput={touch} />
							</label>
							<label class="block">
								<span class="mb-1 block text-xs font-medium uppercase tracking-wide text-gray-500">Siguiente bloque</span>
								<select class="w-full rounded-lg border px-3 py-2 text-sm dark:border-gray-600 dark:bg-gray-800 dark:text-white" bind:value={block.next} onchange={touch}>
									<option value="">Sin destino</option>
									{#each blockIds as blockId (blockId)}
										<option value={blockId}>{blockId}</option>
									{/each}
								</select>
							</label>
						</div>

						{#if files.length > 0}
							<div class="mt-4">
								<p class="mb-2 text-xs font-medium uppercase tracking-wide text-gray-500">Recursos asociados</p>
								<div class="grid gap-2 md:grid-cols-2">
									{#each files as file (file.id)}
										<label class="flex items-center gap-2 rounded-lg border border-gray-200 px-3 py-2 text-sm dark:border-gray-700">
											<input
												type="checkbox"
												checked={!!block.assetRefs?.some((asset) => asset.fileId === file.id)}
												onchange={(event) => toggleAsset(index, file.id, (event.currentTarget as HTMLInputElement).checked)}
											/>
											<span>{file.name}</span>
										</label>
									{/each}
								</div>
							</div>
						{/if}
					{/if}

					{#if block.kind === 'choice'}
						<div class="mt-4 space-y-3">
							<div class="flex items-center justify-between">
								<p class="text-xs font-medium uppercase tracking-wide text-gray-500">Opciones</p>
								<button type="button" class="rounded-lg border px-3 py-1.5 text-xs" onclick={() => addChoiceOption(index)}>
									<Plus class="mr-1 inline h-3 w-3" /> Añadir opción
								</button>
							</div>
							<label class="block">
								<span class="mb-1 block text-xs font-medium uppercase tracking-wide text-gray-500">Clave de salida</span>
								<input class="w-full rounded-lg border px-3 py-2 text-sm dark:border-gray-600 dark:bg-gray-800 dark:text-white" bind:value={block.outputKey} oninput={touch} />
							</label>
							{#each block.options as option, optionIndex (option.id)}
								<div class="grid gap-3 rounded-lg border border-gray-200 p-3 md:grid-cols-2 dark:border-gray-700">
									<input class="rounded-lg border px-3 py-2 text-sm dark:border-gray-600 dark:bg-gray-800 dark:text-white" bind:value={option.id} oninput={touch} placeholder="id" />
									<input class="rounded-lg border px-3 py-2 text-sm dark:border-gray-600 dark:bg-gray-800 dark:text-white" bind:value={option.label} oninput={touch} placeholder="Etiqueta" />
									<input class="rounded-lg border px-3 py-2 text-sm dark:border-gray-600 dark:bg-gray-800 dark:text-white" bind:value={option.value} oninput={touch} placeholder="Valor" />
									<select class="rounded-lg border px-3 py-2 text-sm dark:border-gray-600 dark:bg-gray-800 dark:text-white" bind:value={option.targetBlockId} onchange={touch}>
										<option value="">Destino</option>
										{#each blockIds as blockId (blockId)}
											<option value={blockId}>{blockId}</option>
										{/each}
									</select>
									<textarea class="md:col-span-2 rounded-lg border px-3 py-2 text-sm dark:border-gray-600 dark:bg-gray-800 dark:text-white" bind:value={option.description} oninput={touch} placeholder="Descripción opcional"></textarea>
									<button type="button" class="md:col-span-2 justify-self-end rounded-lg border border-red-200 px-3 py-2 text-xs text-red-600" onclick={() => { block.options.splice(optionIndex, 1); touch(); }}>
										<Trash2 class="mr-1 inline h-3 w-3" /> Eliminar opción
									</button>
								</div>
							{/each}
						</div>
					{/if}

					{#if block.kind === 'agent'}
						<div class="mt-4 space-y-4">
							<div class="grid gap-4 md:grid-cols-2">
								<label class="block">
									<span class="mb-1 block text-xs font-medium uppercase tracking-wide text-gray-500">Modo</span>
									<select class="w-full rounded-lg border px-3 py-2 text-sm dark:border-gray-600 dark:bg-gray-800 dark:text-white" bind:value={block.agentConfig.mode} onchange={touch}>
										<option value="guided_turn">Respuesta guiada</option>
										<option value="mini_chat">Mini chat</option>
									</select>
								</label>
								<label class="block">
									<span class="mb-1 block text-xs font-medium uppercase tracking-wide text-gray-500">Modelo</span>
									<input class="w-full rounded-lg border px-3 py-2 text-sm dark:border-gray-600 dark:bg-gray-800 dark:text-white" bind:value={block.agentConfig.model} oninput={touch} placeholder="Opcional: usa el modelo por defecto si lo dejas vacío" />
								</label>
							</div>

							<label class="block">
								<span class="mb-1 block text-xs font-medium uppercase tracking-wide text-gray-500">Prompt base</span>
								<textarea class="min-h-28 w-full rounded-lg border px-3 py-2 text-sm dark:border-gray-600 dark:bg-gray-800 dark:text-white" bind:value={block.agentConfig.promptTemplate} oninput={touch}></textarea>
							</label>

							<label class="block">
								<span class="mb-1 block text-xs font-medium uppercase tracking-wide text-gray-500">System prompt</span>
								<textarea class="min-h-20 w-full rounded-lg border px-3 py-2 text-sm dark:border-gray-600 dark:bg-gray-800 dark:text-white" bind:value={block.agentConfig.systemPrompt} oninput={touch}></textarea>
							</label>

							<div class="grid gap-4 md:grid-cols-3">
								<input class="rounded-lg border px-3 py-2 text-sm dark:border-gray-600 dark:bg-gray-800 dark:text-white" bind:value={block.agentConfig.placeholder} oninput={touch} placeholder="Placeholder" />
								<input class="rounded-lg border px-3 py-2 text-sm dark:border-gray-600 dark:bg-gray-800 dark:text-white" bind:value={block.agentConfig.submitLabel} oninput={touch} placeholder="Texto botón enviar" />
								<input class="rounded-lg border px-3 py-2 text-sm dark:border-gray-600 dark:bg-gray-800 dark:text-white" bind:value={block.agentConfig.continueLabel} oninput={touch} placeholder="Texto botón continuar" />
							</div>

							<div class="grid gap-4 md:grid-cols-2">
								<input class="rounded-lg border px-3 py-2 text-sm dark:border-gray-600 dark:bg-gray-800 dark:text-white" bind:value={block.agentConfig.initialAssistantMessage} oninput={touch} placeholder="Mensaje inicial opcional" />
								<input class="rounded-lg border px-3 py-2 text-sm dark:border-gray-600 dark:bg-gray-800 dark:text-white" bind:value={block.agentConfig.maxTurns} oninput={touch} placeholder="Máx. turnos opcional" />
							</div>

							<label class="flex items-center gap-3">
								<input type="checkbox" bind:checked={block.requiresResponse} onchange={touch} />
								<span class="text-sm text-gray-700 dark:text-gray-300">Exigir respuesta antes de continuar</span>
							</label>

							<div class="space-y-3">
								<div class="flex items-center justify-between">
									<p class="text-xs font-medium uppercase tracking-wide text-gray-500">Salida estructurada</p>
									<button type="button" class="rounded-lg border px-3 py-1.5 text-xs" onclick={() => addOutputField(index)}>
										<Plus class="mr-1 inline h-3 w-3" /> Añadir campo
									</button>
								</div>
								{#each block.agentConfig.outputSchema ?? [] as field, fieldIndex (`${block.id}-${field.key}-${fieldIndex}`)}
									<div class="grid gap-3 rounded-lg border border-gray-200 p-3 md:grid-cols-3 dark:border-gray-700">
										<input class="rounded-lg border px-3 py-2 text-sm dark:border-gray-600 dark:bg-gray-800 dark:text-white" bind:value={field.key} oninput={touch} placeholder="key" />
										<select class="rounded-lg border px-3 py-2 text-sm dark:border-gray-600 dark:bg-gray-800 dark:text-white" bind:value={field.type} onchange={touch}>
											<option value="string">string</option>
											<option value="number">number</option>
											<option value="boolean">boolean</option>
											<option value="json">json</option>
										</select>
										<input class="rounded-lg border px-3 py-2 text-sm dark:border-gray-600 dark:bg-gray-800 dark:text-white" bind:value={field.description} oninput={touch} placeholder="Descripción" />
										<button type="button" class="md:col-span-3 justify-self-end rounded-lg border border-red-200 px-3 py-2 text-xs text-red-600" onclick={() => { (block.agentConfig.outputSchema as LessonOutputField[]).splice(fieldIndex, 1); touch(); }}>
											<Trash2 class="mr-1 inline h-3 w-3" /> Eliminar campo
										</button>
									</div>
								{/each}
							</div>
						</div>
					{/if}

					{#if block.kind !== 'choice' && block.kind !== 'end'}
						<div class="mt-4 space-y-3 rounded-lg border border-dashed border-gray-200 p-4 dark:border-gray-700">
							<div class="flex items-center justify-between">
								<p class="text-xs font-medium uppercase tracking-wide text-gray-500">Branching</p>
								<button type="button" class="rounded-lg border px-3 py-1.5 text-xs" onclick={() => addBranch(index)}>
									<GitBranch class="mr-1 inline h-3 w-3" /> Añadir rama
								</button>
							</div>

							<label class="block">
								<span class="mb-1 block text-xs font-medium uppercase tracking-wide text-gray-500">Siguiente por defecto</span>
								<select class="w-full rounded-lg border px-3 py-2 text-sm dark:border-gray-600 dark:bg-gray-800 dark:text-white" bind:value={block.next} onchange={touch}>
									<option value="">Sin destino</option>
									{#each blockIds as blockId (blockId)}
										<option value={blockId}>{blockId}</option>
									{/each}
								</select>
							</label>

							{#each block.branches ?? [] as branch, branchIndex (`${block.id}-${branchIndex}`)}
								{@const condition = ensureBranchCondition(branch)}
								<div class="grid gap-3 rounded-lg border border-gray-200 p-3 md:grid-cols-2 dark:border-gray-700">
									<input class="rounded-lg border px-3 py-2 text-sm dark:border-gray-600 dark:bg-gray-800 dark:text-white" bind:value={branch.label} oninput={touch} placeholder="Etiqueta de rama" />
									<select class="rounded-lg border px-3 py-2 text-sm dark:border-gray-600 dark:bg-gray-800 dark:text-white" bind:value={branch.targetBlockId} onchange={touch}>
										<option value="">Destino</option>
										{#each blockIds as blockId (blockId)}
											<option value={blockId}>{blockId}</option>
										{/each}
									</select>
									<input class="rounded-lg border px-3 py-2 text-sm dark:border-gray-600 dark:bg-gray-800 dark:text-white" bind:value={condition.source} oninput={touch} placeholder="source: session.attemptNumber o blocks.id.outputs.key" />
									<select class="rounded-lg border px-3 py-2 text-sm dark:border-gray-600 dark:bg-gray-800 dark:text-white" bind:value={condition.operator} onchange={touch}>
										<option value="equals">equals</option>
										<option value="not_equals">not_equals</option>
										<option value="contains">contains</option>
										<option value="exists">exists</option>
										<option value="not_exists">not_exists</option>
										<option value="gt">gt</option>
										<option value="gte">gte</option>
										<option value="lt">lt</option>
										<option value="lte">lte</option>
									</select>
									<input class="md:col-span-2 rounded-lg border px-3 py-2 text-sm dark:border-gray-600 dark:bg-gray-800 dark:text-white" bind:value={condition.value} oninput={touch} placeholder="Valor esperado" />
									<button type="button" class="md:col-span-2 justify-self-end rounded-lg border border-red-200 px-3 py-2 text-xs text-red-600" onclick={() => { block.branches?.splice(branchIndex, 1); touch(); }}>
										<Trash2 class="mr-1 inline h-3 w-3" /> Eliminar rama
									</button>
								</div>
							{/each}
						</div>
					{/if}
				</div>
			{/each}
		</div>
	</div>

	<div class="grid gap-6 lg:grid-cols-2">
		<div class="rounded-xl border border-gray-200 bg-white p-5 dark:border-gray-700 dark:bg-gray-900/30">
			<h3 class="mb-3 text-lg font-semibold text-gray-900 dark:text-white">Variables disponibles</h3>
			<div class="space-y-2 text-sm">
				{#each availableVariables as variable (variable.path)}
					<div class="rounded-lg border border-gray-200 px-3 py-2 dark:border-gray-700">
						<code class="text-xs text-primary-600 dark:text-primary-300">{`{{${variable.path}}}`}</code>
						<p class="mt-1 text-gray-600 dark:text-gray-400">{variable.description}</p>
					</div>
				{/each}
			</div>
		</div>

		<div class="rounded-xl border border-gray-200 bg-white p-5 dark:border-gray-700 dark:bg-gray-900/30">
			<h3 class="mb-3 text-lg font-semibold text-gray-900 dark:text-white">Vista previa del flujo</h3>
			<div class="space-y-2 text-sm text-gray-700 dark:text-gray-300">
				<p class="rounded-lg bg-gray-50 px-3 py-2 dark:bg-gray-800">Entrada: <strong>{builder.entryBlockId}</strong></p>
				{#each previewLines as line (line)}
					<p class="rounded-lg border border-gray-200 px-3 py-2 dark:border-gray-700">{line}</p>
				{/each}
			</div>
		</div>
	</div>
</div>
