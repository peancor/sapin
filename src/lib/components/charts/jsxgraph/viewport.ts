import type { GraphPlotProps, GraphPoint, GraphViewportBounds, GraphViewportConfig } from './types';

const DEFAULT_MIN = -10;
const DEFAULT_MAX = 10;
const PADDING_RATIO = 0.1;

export const DEFAULT_GRAPH_VIEWPORT: GraphViewportBounds = {
	xMin: DEFAULT_MIN,
	xMax: DEFAULT_MAX,
	yMin: DEFAULT_MIN,
	yMax: DEFAULT_MAX
};

function isFiniteNumber(value: unknown): value is number {
	return typeof value === 'number' && isFinite(value);
}

function normalizeAxisRange(min: number, max: number): { min: number; max: number } {
	if (min < max) return { min, max };
	return { min: DEFAULT_MIN, max: DEFAULT_MAX };
}

function withPadding(min: number, max: number): { min: number; max: number } {
	const span = Math.max(max - min, 1e-6);
	const padding = span * PADDING_RATIO;
	return {
		min: min - padding,
		max: max + padding
	};
}

export function computeBoundsFromPoints(points: GraphPoint[]): GraphViewportBounds | null {
	const valid = points.filter((point) => isFiniteNumber(point.x) && isFiniteNumber(point.y));
	if (valid.length === 0) return null;

	let xMin = valid[0].x;
	let xMax = valid[0].x;
	let yMin = valid[0].y;
	let yMax = valid[0].y;

	for (const point of valid) {
		xMin = Math.min(xMin, point.x);
		xMax = Math.max(xMax, point.x);
		yMin = Math.min(yMin, point.y);
		yMax = Math.max(yMax, point.y);
	}

	const paddedX = withPadding(xMin, xMax);
	const paddedY = withPadding(yMin, yMax);

	return {
		xMin: paddedX.min,
		xMax: paddedX.max,
		yMin: paddedY.min,
		yMax: paddedY.max
	};
}

export function computeBoundsFromFormula(
	fn: (x: number) => number,
	domainMin: number,
	domainMax: number,
	samples: number
): GraphViewportBounds | null {
	if (!isFiniteNumber(domainMin) || !isFiniteNumber(domainMax) || domainMin >= domainMax) {
		return null;
	}

	const safeSamples = Math.max(20, Math.min(2000, samples));
	const step = (domainMax - domainMin) / (safeSamples - 1);
	const sampled: GraphPoint[] = [];

	for (let i = 0; i < safeSamples; i++) {
		const x = domainMin + step * i;
		try {
			const y = fn(x);
			if (isFiniteNumber(y)) {
				sampled.push({ x, y });
			}
		} catch {
			// Ignore invalid sample points.
		}
	}

	if (sampled.length === 0) return null;
	return computeBoundsFromPoints(sampled);
}

function applyViewportOverrides(
	base: GraphViewportBounds,
	viewport: GraphViewportConfig | undefined
): GraphViewportBounds {
	if (!viewport) return base;

	const xMin = isFiniteNumber(viewport.xMin) ? viewport.xMin : base.xMin;
	const xMax = isFiniteNumber(viewport.xMax) ? viewport.xMax : base.xMax;
	const yMin = isFiniteNumber(viewport.yMin) ? viewport.yMin : base.yMin;
	const yMax = isFiniteNumber(viewport.yMax) ? viewport.yMax : base.yMax;

	const normalizedX = normalizeAxisRange(xMin, xMax);
	const normalizedY = normalizeAxisRange(yMin, yMax);

	return {
		xMin: normalizedX.min,
		xMax: normalizedX.max,
		yMin: normalizedY.min,
		yMax: normalizedY.max
	};
}

export function resolveViewportBounds(
	plot: GraphPlotProps,
	formulaFn?: (x: number) => number
): GraphViewportBounds {
	const shouldAutoFit = plot.viewport?.autoFit !== false;

	let base = DEFAULT_GRAPH_VIEWPORT;

	if (shouldAutoFit) {
		if (plot.mode === 'data' && plot.data) {
			base = computeBoundsFromPoints(plot.data.points) ?? DEFAULT_GRAPH_VIEWPORT;
		}

		if (plot.mode === 'formula' && plot.formula && formulaFn) {
			const domainMin = plot.formula.domainMin ?? DEFAULT_MIN;
			const domainMax = plot.formula.domainMax ?? DEFAULT_MAX;
			const samples = plot.formula.samples ?? 300;
			base =
				computeBoundsFromFormula(formulaFn, domainMin, domainMax, samples) ??
				DEFAULT_GRAPH_VIEWPORT;
		}
	}

	return applyViewportOverrides(base, plot.viewport);
}
