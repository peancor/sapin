import { z } from 'zod';
import type { GraphPlotProps } from './types';

const finiteNumber = z.number().finite();

const graphPointSchema = z.object({
	x: finiteNumber,
	y: finiteNumber
});

const graphFormulaSchema = z
	.object({
		expression: z.string().trim().min(1),
		domainMin: finiteNumber.optional(),
		domainMax: finiteNumber.optional(),
		samples: z.number().int().min(20).max(2000).optional(),
		color: z.string().trim().min(1).optional(),
		strokeWidth: finiteNumber.min(1).max(8).optional()
	})
	.superRefine((value, ctx) => {
		if (
			value.domainMin !== undefined &&
			value.domainMax !== undefined &&
			value.domainMin >= value.domainMax
		) {
			ctx.addIssue({
				code: z.ZodIssueCode.custom,
				path: ['domainMin'],
				message: 'domainMin must be lower than domainMax'
			});
		}
	});

const graphDataSchema = z.object({
	points: z.array(graphPointSchema).min(2),
	style: z.enum(['line', 'scatter']).optional(),
	color: z.string().trim().min(1).optional()
});

const graphAxesSchema = z.object({
	xLabel: z.string().trim().min(1).optional(),
	yLabel: z.string().trim().min(1).optional(),
	grid: z.boolean().optional()
});

const graphViewportSchema = z
	.object({
		autoFit: z.boolean().optional(),
		xMin: finiteNumber.optional(),
		xMax: finiteNumber.optional(),
		yMin: finiteNumber.optional(),
		yMax: finiteNumber.optional()
	})
	.superRefine((value, ctx) => {
		if (value.xMin !== undefined && value.xMax !== undefined && value.xMin >= value.xMax) {
			ctx.addIssue({
				code: z.ZodIssueCode.custom,
				path: ['xMin'],
				message: 'xMin must be lower than xMax'
			});
		}

		if (value.yMin !== undefined && value.yMax !== undefined && value.yMin >= value.yMax) {
			ctx.addIssue({
				code: z.ZodIssueCode.custom,
				path: ['yMin'],
				message: 'yMin must be lower than yMax'
			});
		}
	});

export const graphPlotPropsSchema = z
	.object({
		mode: z.enum(['formula', 'data']),
		title: z.string().trim().min(1).optional(),
		formula: graphFormulaSchema.optional(),
		data: graphDataSchema.optional(),
		axes: graphAxesSchema.optional(),
		viewport: graphViewportSchema.optional()
	})
	.superRefine((value, ctx) => {
		if (value.mode === 'formula') {
			if (!value.formula) {
				ctx.addIssue({
					code: z.ZodIssueCode.custom,
					path: ['formula'],
					message: 'formula is required in formula mode'
				});
			}
			if (value.data) {
				ctx.addIssue({
					code: z.ZodIssueCode.custom,
					path: ['data'],
					message: 'data must not be provided in formula mode'
				});
			}
		}

		if (value.mode === 'data') {
			if (!value.data) {
				ctx.addIssue({
					code: z.ZodIssueCode.custom,
					path: ['data'],
					message: 'data is required in data mode'
				});
			}
			if (value.formula) {
				ctx.addIssue({
					code: z.ZodIssueCode.custom,
					path: ['formula'],
					message: 'formula must not be provided in data mode'
				});
			}
		}
	});

export function parseGraphPlotProps(input: unknown): GraphPlotProps {
	return graphPlotPropsSchema.parse(input) as GraphPlotProps;
}
