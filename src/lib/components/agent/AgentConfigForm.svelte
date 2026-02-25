<script lang="ts">
	interface Tool {
		id: string;
		name: string;
		displayName: string;
		description: string;
		category: string;
		riskLevel: string;
		requiresConfirmation: boolean;
	}

	interface UIComponent {
		id: string;
		name: string;
		displayName: string;
		description: string;
		category: string;
	}

	interface Props {
		maxToolRoundtrips?: number;
		parallelToolCalls?: boolean;
		toolChoice?: 'auto' | 'required' | 'none';
		tools?: Tool[];
		selectedToolIds?: string[];
		uiComponents?: UIComponent[];
		selectedUIComponentIds?: string[];
		onchange?: () => void;
	}

	let {
		maxToolRoundtrips = $bindable(5),
		parallelToolCalls = $bindable(false),
		toolChoice = $bindable<'auto' | 'required' | 'none'>('auto'),
		tools = [],
		selectedToolIds = $bindable<string[]>([]),
		uiComponents = [],
		selectedUIComponentIds = $bindable<string[]>([]),
		onchange
	}: Props = $props();

	const categoryLabels: Record<string, string> = {
		knowledge: 'Conocimiento',
		evaluation: 'Evaluación',
		communication: 'Comunicación',
		data: 'Datos',
		ui: 'Interfaz UI'
	};

	const riskColors: Record<string, string> = {
		low: 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400',
		medium: 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-400',
		high: 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400'
	};

	// Group tools by category
	let toolsByCategory = $derived(
		tools.reduce<Record<string, Tool[]>>((acc, tool) => {
			if (!acc[tool.category]) acc[tool.category] = [];
			acc[tool.category].push(tool);
			return acc;
		}, {})
	);

	function toggleTool(id: string) {
		if (selectedToolIds.includes(id)) {
			selectedToolIds = selectedToolIds.filter((t) => t !== id);
		} else {
			selectedToolIds = [...selectedToolIds, id];
		}
		onchange?.();
	}

	function toggleUIComponent(id: string) {
		if (selectedUIComponentIds.includes(id)) {
			selectedUIComponentIds = selectedUIComponentIds.filter((c) => c !== id);
		} else {
			selectedUIComponentIds = [...selectedUIComponentIds, id];
		}
		onchange?.();
	}
</script>

<div class="space-y-6">
	<!-- Hidden inputs for form submission -->
	<input type="hidden" name="selectedToolIds" value={JSON.stringify(selectedToolIds)} />
	<input type="hidden" name="selectedUIComponentIds" value={JSON.stringify(selectedUIComponentIds)} />

	<!-- Comportamiento del Agente -->
	<div class="rounded-lg border border-gray-200 p-4 dark:border-gray-700">
		<h3 class="mb-4 text-sm font-semibold uppercase tracking-wider text-gray-500 dark:text-gray-400">
			Comportamiento del Agente
		</h3>
		<div class="grid gap-4 sm:grid-cols-2">
			<!-- Max Tool Roundtrips -->
			<div>
				<label
					for="maxToolRoundtrips"
					class="mb-1 block text-sm font-medium text-gray-700 dark:text-gray-300"
				>
					Rondas máximas de herramientas
				</label>
				<input
					id="maxToolRoundtrips"
					type="number"
					name="maxToolRoundtrips"
					min="1"
					max="20"
					bind:value={maxToolRoundtrips}
					oninput={onchange}
					class="w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500 dark:border-gray-600 dark:bg-gray-700 dark:text-white"
				/>
				<p class="mt-1 text-xs text-gray-500 dark:text-gray-400">
					Número máximo de veces que el agente puede invocar herramientas (1–20)
				</p>
			</div>

			<!-- Parallel Tool Calls -->
			<div>
				<label class="mb-1 block text-sm font-medium text-gray-700 dark:text-gray-300">
					Llamadas paralelas
				</label>
				<label class="flex cursor-pointer items-center gap-3">
					<input
						type="checkbox"
						name="parallelToolCalls"
						bind:checked={parallelToolCalls}
						onchange={onchange}
						class="h-4 w-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
					/>
					<span class="text-sm text-gray-700 dark:text-gray-300">
						Permitir invocar múltiples herramientas a la vez
					</span>
				</label>
			</div>

			<!-- Tool Choice -->
			<div class="sm:col-span-2">
				<label class="mb-2 block text-sm font-medium text-gray-700 dark:text-gray-300">
					Modo de selección de herramientas
				</label>
				<div class="flex flex-wrap gap-4">
					{#each [{ value: 'auto', label: 'Automático', desc: 'El modelo decide si usa herramientas' }, { value: 'required', label: 'Requerido', desc: 'Siempre debe usar al menos una herramienta' }, { value: 'none', label: 'Ninguno', desc: 'No puede usar herramientas' }] as option (option.value)}
						<label class="flex cursor-pointer items-start gap-2">
							<input
								type="radio"
								name="toolChoice"
								value={option.value}
								bind:group={toolChoice}
								onchange={onchange}
								class="mt-0.5 h-4 w-4 border-gray-300 text-blue-600 focus:ring-blue-500"
							/>
							<div>
								<span class="text-sm font-medium text-gray-700 dark:text-gray-300">
									{option.label}
								</span>
								<p class="text-xs text-gray-500 dark:text-gray-400">{option.desc}</p>
							</div>
						</label>
					{/each}
				</div>
			</div>
		</div>
	</div>

	<!-- Herramientas -->
	{#if tools.length > 0}
		<div class="rounded-lg border border-gray-200 p-4 dark:border-gray-700">
			<h3 class="mb-4 text-sm font-semibold uppercase tracking-wider text-gray-500 dark:text-gray-400">
				Herramientas habilitadas
			</h3>
			<div class="space-y-4">
				{#each Object.entries(toolsByCategory) as [category, categoryTools] (category)}
					<div>
						<p class="mb-2 text-xs font-semibold text-gray-500 dark:text-gray-400">
							{categoryLabels[category] ?? category}
						</p>
						<div class="grid gap-2 sm:grid-cols-2">
							{#each categoryTools as tool (tool.id)}
								<label
									class="flex cursor-pointer items-start gap-3 rounded-lg border border-gray-200 p-3 transition-colors hover:bg-gray-50 dark:border-gray-700 dark:hover:bg-gray-700/50 {selectedToolIds.includes(
										tool.id
									)
										? 'border-blue-300 bg-blue-50 dark:border-blue-700 dark:bg-blue-900/20'
										: ''}"
								>
									<input
										type="checkbox"
										checked={selectedToolIds.includes(tool.id)}
										onchange={() => toggleTool(tool.id)}
										class="mt-0.5 h-4 w-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
									/>
									<div class="min-w-0 flex-1">
										<div class="flex flex-wrap items-center gap-1.5">
											<span class="text-sm font-medium text-gray-900 dark:text-white">
												{tool.displayName}
											</span>
											<span
												class="rounded px-1.5 py-0.5 text-xs font-medium {riskColors[tool.riskLevel] ??
													riskColors.low}"
											>
												{tool.riskLevel}
											</span>
											{#if tool.requiresConfirmation}
												<span
													class="rounded bg-purple-100 px-1.5 py-0.5 text-xs font-medium text-purple-800 dark:bg-purple-900/30 dark:text-purple-400"
												>
													HITL
												</span>
											{/if}
										</div>
										<p class="mt-0.5 line-clamp-2 text-xs text-gray-500 dark:text-gray-400">
											{tool.description}
										</p>
									</div>
								</label>
							{/each}
						</div>
					</div>
				{/each}
			</div>
		</div>
	{/if}

	<!-- Componentes UI -->
	{#if uiComponents.length > 0}
		<div class="rounded-lg border border-gray-200 p-4 dark:border-gray-700">
			<h3 class="mb-4 text-sm font-semibold uppercase tracking-wider text-gray-500 dark:text-gray-400">
				Componentes UI habilitados
			</h3>
			<div class="grid gap-2 sm:grid-cols-2">
				{#each uiComponents as comp (comp.id)}
					<label
						class="flex cursor-pointer items-start gap-3 rounded-lg border border-gray-200 p-3 transition-colors hover:bg-gray-50 dark:border-gray-700 dark:hover:bg-gray-700/50 {selectedUIComponentIds.includes(
							comp.id
						)
							? 'border-blue-300 bg-blue-50 dark:border-blue-700 dark:bg-blue-900/20'
							: ''}"
					>
						<input
							type="checkbox"
							checked={selectedUIComponentIds.includes(comp.id)}
							onchange={() => toggleUIComponent(comp.id)}
							class="mt-0.5 h-4 w-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
						/>
						<div class="min-w-0 flex-1">
							<div class="flex items-center gap-1.5">
								<span class="text-sm font-medium text-gray-900 dark:text-white">
									{comp.displayName}
								</span>
								<span
									class="rounded bg-gray-100 px-1.5 py-0.5 text-xs text-gray-600 dark:bg-gray-700 dark:text-gray-400"
								>
									{comp.category}
								</span>
							</div>
							<p class="mt-0.5 line-clamp-2 text-xs text-gray-500 dark:text-gray-400">
								{comp.description}
							</p>
						</div>
					</label>
				{/each}
			</div>
		</div>
	{/if}
</div>
