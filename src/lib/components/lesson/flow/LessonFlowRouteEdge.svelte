<script lang="ts">
	import {
		BaseEdge,
		Position,
		getSmoothStepPath,
		useSvelteFlow,
		type EdgeProps
	} from '@xyflow/svelte';
	import { onDestroy } from 'svelte';
	import type { LessonFlowEdge, LessonFlowRoutePoint } from '../../../types/lessonFlow';

	let {
		id,
		sourceX,
		sourceY,
		targetX,
		targetY,
		sourcePosition = Position.Bottom,
		targetPosition = Position.Top,
		markerEnd,
		style,
		label,
		labelStyle,
		interactionWidth = 24,
		selected = false,
		data
	}: EdgeProps<LessonFlowEdge> = $props();

	const { screenToFlowPosition } = useSvelteFlow();
	let activePointIndex = $state<number | null>(null);
	let activePointerId = $state<number | null>(null);

	const routePoints = $derived.by(() => {
		const points = data?.routePoints ?? [];
		if (data?.isAutoRouted && points.length >= 4) {
			return createRuntimeAutoRoutePoints(points);
		}
		return points;
	});
	const edgePath = $derived.by(() => {
		if (routePoints.length > 0) {
			return createRoutePath([
				{ x: sourceX, y: sourceY },
				...routePoints,
				{ x: targetX, y: targetY }
			]);
		}

		const [path] = getSmoothStepPath({
			sourceX,
			sourceY,
			sourcePosition,
			targetX,
			targetY,
			targetPosition,
			borderRadius: 12,
			offset: 24
		});
		return path;
	});
	const labelPosition = $derived.by(() => {
		if (routePoints.length > 0) {
			const labelPoint = routePoints[Math.floor(routePoints.length / 2)];
			return { x: labelPoint.x, y: labelPoint.y - 14 };
		}

		return {
			x: (sourceX + targetX) / 2,
			y: (sourceY + targetY) / 2
		};
	});
	const edgeStyle = $derived(
		`${style ?? ''};stroke-linecap:round;stroke-linejoin:round;${selected ? ';filter:drop-shadow(0 3px 8px rgba(15,37,55,0.22))' : ''}`
	);
	const pointFill = $derived(data?.edgeType === 'branch' ? '#ff9f2e' : '#2e7d32');
	const pointStroke = $derived(data?.edgeType === 'choice-option' ? '#0f2537' : '#ffffff');

	function createRoutePath(points: LessonFlowRoutePoint[]): string {
		return points
			.map((point, index) => `${index === 0 ? 'M' : 'L'} ${round(point.x)} ${round(point.y)}`)
			.join(' ');
	}

	function createRuntimeAutoRoutePoints(points: LessonFlowRoutePoint[]): LessonFlowRoutePoint[] {
		const laneX = points[1]?.x ?? points[0]?.x ?? sourceX;

		return [
			{ x: sourceX, y: sourceY },
			{ x: laneX, y: sourceY },
			{ x: laneX, y: targetY },
			{ x: targetX, y: targetY }
		];
	}

	function round(value: number): number {
		return Math.round(value * 10) / 10;
	}

	function startDrag(event: PointerEvent, pointIndex: number) {
		event.preventDefault();
		event.stopPropagation();
		activePointIndex = pointIndex;
		activePointerId = event.pointerId;
		window.addEventListener('pointermove', handleWindowPointerMove);
		window.addEventListener('pointerup', handleWindowPointerUp);
		window.addEventListener('pointercancel', handleWindowPointerUp);
	}

	function handleWindowPointerMove(event: PointerEvent) {
		if (activePointIndex === null || activePointerId !== event.pointerId) return;
		event.preventDefault();
		event.stopPropagation();
		const nextPoint = screenToFlowPosition(
			{ x: event.clientX, y: event.clientY },
			{ snapToGrid: false }
		);
		data?.onRoutePointChange?.(id, activePointIndex, nextPoint);
	}

	function handleWindowPointerUp(event: PointerEvent) {
		if (activePointerId !== event.pointerId) return;
		event.preventDefault();
		event.stopPropagation();
		stopDrag();
	}

	function stopDrag() {
		activePointIndex = null;
		activePointerId = null;
		window.removeEventListener('pointermove', handleWindowPointerMove);
		window.removeEventListener('pointerup', handleWindowPointerUp);
		window.removeEventListener('pointercancel', handleWindowPointerUp);
	}

	function nudgePoint(event: KeyboardEvent, pointIndex: number) {
		const step = event.shiftKey ? 40 : 12;
		const deltas: Record<string, LessonFlowRoutePoint> = {
			ArrowUp: { x: 0, y: -step },
			ArrowDown: { x: 0, y: step },
			ArrowLeft: { x: -step, y: 0 },
			ArrowRight: { x: step, y: 0 }
		};
		const delta = deltas[event.key];
		if (!delta) return;
		event.preventDefault();
		event.stopPropagation();
		data?.onRoutePointNudge?.(id, pointIndex, delta);
	}

	onDestroy(() => {
		stopDrag();
	});
</script>

<BaseEdge
	{id}
	path={edgePath}
	{label}
	labelX={labelPosition.x}
	labelY={labelPosition.y}
	{labelStyle}
	{markerEnd}
	style={edgeStyle}
	{interactionWidth}
/>

{#if selected && routePoints.length > 0}
	{#each routePoints as point, index (`${id}:route:${index}`)}
		<g
			role="button"
			tabindex="0"
			aria-label={`Punto de ruta ${index + 1}`}
			class="nodrag nopan cursor-grab outline-none"
			transform={`translate(${point.x} ${point.y})`}
			onpointerdown={(event) => startDrag(event, index)}
			onkeydown={(event) => nudgePoint(event, index)}
		>
			<title>Punto de ruta {index + 1}</title>
			<circle r="18" fill="transparent" />
			<circle
				r={activePointIndex === index ? 13 : 11}
				fill="#ffffff"
				stroke={pointFill}
				stroke-width="3"
			/>
			<circle r="5.5" fill={pointFill} stroke={pointStroke} stroke-width="1" />
		</g>
	{/each}
{/if}
