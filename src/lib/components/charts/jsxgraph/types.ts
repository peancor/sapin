export type GraphPlotMode = 'formula' | 'data';
export type GraphDataStyle = 'line' | 'scatter';

export interface GraphPoint {
	x: number;
	y: number;
}

export interface GraphFormulaConfig {
	expression: string;
	domainMin?: number;
	domainMax?: number;
	samples?: number;
	color?: string;
	strokeWidth?: number;
}

export interface GraphDataConfig {
	points: GraphPoint[];
	style?: GraphDataStyle;
	color?: string;
}

export interface GraphAxesConfig {
	xLabel?: string;
	yLabel?: string;
	grid?: boolean;
}

export interface GraphViewportConfig {
	autoFit?: boolean;
	xMin?: number;
	xMax?: number;
	yMin?: number;
	yMax?: number;
}

export interface GraphPlotProps {
	mode: GraphPlotMode;
	title?: string;
	formula?: GraphFormulaConfig;
	data?: GraphDataConfig;
	axes?: GraphAxesConfig;
	viewport?: GraphViewportConfig;
}

export interface GraphViewportBounds {
	xMin: number;
	xMax: number;
	yMin: number;
	yMax: number;
}
