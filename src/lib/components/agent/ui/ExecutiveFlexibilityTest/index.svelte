<script lang="ts">
	import type { ImmersiveState } from '../shared/cognitive-tests';

	interface Props {
		title?: string;
		testType?: 'trail_making' | 'wcst';
		instructions?: string;
		onImmersiveStateChange?: (state: ImmersiveState) => void;
	}

	let { title, testType = 'trail_making', instructions, onImmersiveStateChange }: Props = $props();

	$effect(() => {
		onImmersiveStateChange?.({
			canCloseSafely: true,
			closePrompt: 'Puedes cerrar cuando quieras.'
		});
	});
</script>

<div class="min-h-full rounded-[2rem] border border-white/10 bg-[radial-gradient(circle_at_top,_rgba(132,204,22,0.18),_transparent_30%),linear-gradient(180deg,rgba(8,28,21,0.97),rgba(4,12,12,0.99))] text-white shadow-2xl">
	<div class="grid min-h-[70vh] gap-8 px-6 py-8 lg:grid-cols-[1.08fr_0.92fr] lg:px-10 lg:py-10">
		<div class="flex flex-col justify-center">
			<p class="text-sm font-semibold uppercase tracking-[0.28em] text-lime-300">Funcion ejecutiva</p>
			<h3 class="mt-3 text-4xl font-black tracking-tight sm:text-5xl">
				{title ?? (testType === 'wcst' ? 'Wisconsin Card Sorting Test' : 'Trail Making Test')}
			</h3>
			<p class="mt-4 max-w-2xl text-lg leading-8 text-slate-200">
				{instructions ??
					(testType === 'wcst'
						? 'La familia de WCST queda registrada en el chat con su shell inmersivo, para que la siguiente iteracion se concentre solo en la logica de reglas latentes y feedback.'
						: 'La familia de Trail Making queda registrada en el chat con su shell inmersivo, lista para una siguiente iteracion con canvas/SVG y validacion espacial.')}
			</p>

			<div class="mt-8 grid gap-3 sm:grid-cols-3">
				<div class="rounded-3xl border border-white/10 bg-white/6 p-4">
					<p class="text-xs font-semibold uppercase tracking-[0.18em] text-lime-200">Estado</p>
					<p class="mt-2 text-3xl font-black">Roadmap</p>
				</div>
				<div class="rounded-3xl border border-white/10 bg-white/6 p-4">
					<p class="text-xs font-semibold uppercase tracking-[0.18em] text-lime-200">Persistencia</p>
					<p class="mt-2 text-3xl font-black">Lista</p>
				</div>
				<div class="rounded-3xl border border-white/10 bg-white/6 p-4">
					<p class="text-xs font-semibold uppercase tracking-[0.18em] text-lime-200">Motor</p>
					<p class="mt-2 text-3xl font-black">Pendiente</p>
				</div>
			</div>
		</div>

		<div class="rounded-[2rem] border border-white/10 bg-white/6 p-6 shadow-xl">
			<p class="text-sm font-semibold uppercase tracking-[0.22em] text-lime-200">Siguiente iteracion</p>
			<div class="mt-6 space-y-4">
				<div class="rounded-3xl border border-white/10 bg-slate-950/35 p-5">
					<h4 class="text-xl font-semibold">{testType === 'wcst' ? 'WCST' : 'TMT'} dentro del shell inmersivo</h4>
					<p class="mt-2 text-sm leading-7 text-slate-300">
						El overlay, launcher, modos de reabrir y guardas de cierre ya quedan conectados a esta familia.
					</p>
				</div>
				<div class="rounded-3xl border border-white/10 bg-slate-950/35 p-5">
					<h4 class="text-xl font-semibold">Contrato previsto</h4>
					<p class="mt-2 text-sm leading-7 text-slate-300">
						La respuesta seguira el mismo patron: `summary`, `trialLog`, `score` y `completed`, sin tocar `ui-response`.
					</p>
				</div>
				<div class="rounded-3xl border border-white/10 bg-slate-950/35 p-5">
					<h4 class="text-xl font-semibold">Objetivo</h4>
					<p class="mt-2 text-sm leading-7 text-slate-300">
						Separar la futura logica espacial/adaptativa del resto de familias para no mezclar engines incompatibles.
					</p>
				</div>
			</div>
		</div>
	</div>
</div>
