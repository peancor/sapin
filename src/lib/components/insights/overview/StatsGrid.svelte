<script lang="ts">
	import StatCard from './StatCard.svelte';
	import { Users, MessageSquare, TrendingUp, AlertTriangle, CheckCircle } from 'lucide-svelte';
	import type { ChatSummaryStats, ConsolidatedMetrics } from '$lib/types/insights';

	interface Props {
		chatStats: ChatSummaryStats;
		metrics: ConsolidatedMetrics | null;
	}

	let { chatStats, metrics }: Props = $props();
</script>

<div class="grid grid-cols-1 gap-4 sm:grid-cols-2 sm:gap-6 lg:grid-cols-3">
	<StatCard
		title="Total Estudiantes"
		value={chatStats.uniqueStudentCount}
		subtitle="participantes unicos"
		icon={Users}
		color="blue"
	/>

	<StatCard
		title="Total Chats"
		value={chatStats.totalChats}
		subtitle="conversaciones"
		icon={MessageSquare}
		color="indigo"
	/>

	<StatCard
		title="Promedio Msgs/Chat"
		value={chatStats.averageMessagesPerChat.toFixed(1)}
		subtitle="mensajes por conversacion"
		icon={TrendingUp}
		color="purple"
	/>

	{#if metrics}
		<StatCard
			title="Engagement"
			value="{metrics.engagement.overallScore}%"
			subtitle="puntuacion general"
			icon={TrendingUp}
			color="green"
		/>

		<StatCard
			title="Tasa Completado"
			value="{metrics.performance.averageCompletionRate}%"
			subtitle="{metrics.participation.completed} de {chatStats.uniqueStudentCount}"
			icon={CheckCircle}
			color="blue"
		/>

		<StatCard
			title="En Riesgo"
			value={metrics.earlyWarning.totalAtRisk}
			subtitle="estudiantes necesitan atencion"
			icon={AlertTriangle}
			color={metrics.earlyWarning.totalAtRisk > 0 ? 'red' : 'green'}
		/>
	{/if}
</div>
