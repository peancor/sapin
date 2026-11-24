<script lang="ts">
	import * as m from '$lib/paraglide/messages';
	import { resultRecord } from '$lib/utils/agentToolActivity';
	import { percentOfWidth, readTrial, trackMark } from './savedTrial';
	import { savedMetrics, trialStimulus, trialTerm } from './transcriptTestData';

	let { response, preview = false }: { response?: Record<string, unknown>; preview?: boolean } =
		$props();
	const trials = $derived(
		Array.isArray(response?.trialLog) ? response.trialLog.map(resultRecord) : []
	);
	const segments = $derived(
		Array.isArray(response?.segmentLog) ? response.segmentLog.map(resultRecord) : []
	);
	function readableAnswer(value: unknown, expected: boolean) {
		if (value === null) return expected ? m.transcript_inhibit() : m.transcript_no_action();
		if (value === undefined) return m.transcript_unavailable();
		return trialTerm(value);
	}
</script>

{#if response}
	{#if typeof response.score === 'number'}
		<p>{m.transcript_score({ score: Math.round(response.score * 100) })}</p>
	{/if}
	<dl class="my-2 flex flex-wrap gap-x-5 gap-y-1 text-sm">
		{#each savedMetrics(response) as metric (metric.key)}
			<div>
				<dt class="font-medium">{metric.label}</dt>
				<dd>{metric.value}</dd>
			</div>
		{/each}
	</dl>
	{#if trials.length}
		<table>
			<thead>
				<tr>
					<th>{m.transcript_trial()}</th>
					<th>{m.transcript_stimulus()}</th>
					<th>{m.transcript_expected()}</th>
					<th>{m.transcript_response()}</th>
					<th>{m.transcript_outcome()}</th>
					<th
						>{response.testType === 'time_to_contact'
							? m.transcript_signed_error()
							: m.transcript_rt()}</th
					>
				</tr>
			</thead>
			<tbody>
				{#each trials as trial, i (i)}
					{@const entry = readTrial(trial, response.testType ?? trial.testType)}
					<tr>
						<td>{i + 1} · {trialTerm(entry.phase)}</td>
						<td>
							{entry.stimulus ?? trialStimulus(trial)}
							{#if entry.mode}<small class="block">{trialTerm(entry.mode)}</small>{/if}
						</td>
						<td>{readableAnswer(entry.expected, true)}</td>
						<td>{readableAnswer(entry.actual, false)}</td>
						<td>{trialTerm(entry.outcome)}</td>
						<td>{trialTerm(entry.time)}</td>
					</tr>
				{/each}
			</tbody>
		</table>
	{:else if segments.length}
		<table>
			<thead>
				<tr>
					<th>{m.transcript_phase()}</th>
					<th>{m.transcript_elapsed()}</th>
					<th>{m.transcript_track_centers()}</th>
					<th>{m.transcript_left_offset()}</th>
					<th>{m.transcript_right_offset()}</th>
					<th>{m.transcript_track()}</th>
				</tr>
			</thead>
			<tbody>
				{#each segments as sample, i (i)}
					<tr>
						<td>{trialTerm(sample.phase)}</td>
						<td>{trialTerm(sample.tMs)}</td>
						<td
							>{percentOfWidth(sample.leftCenterNorm)} / {percentOfWidth(
								sample.rightCenterNorm
							)}</td
						>
						<td>{percentOfWidth(sample.leftOffsetNorm)}</td>
						<td>{percentOfWidth(sample.rightOffsetNorm)}</td>
						<td>{trackMark(sample.leftOnTrack)} / {trackMark(sample.rightOnTrack)}</td>
					</tr>
				{/each}
			</tbody>
		</table>
	{:else}
		<p>{m.transcript_summary_only()}</p>
	{/if}
{:else if preview}
	<p>{m.transcript_preview_test()}</p>
{:else}
	<p>{m.transcript_pending()}</p>
{/if}
