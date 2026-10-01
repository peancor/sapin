import { graphPlotPropsSchema } from '$lib/components/charts/jsxgraph/schema';
import type { UIRendererHandler } from '../../types';

export const graphPlotCardHandler: UIRendererHandler = {
	componentKey: 'GraphPlotCard',
	async validateAndBuildProps(input) {
		const parsed = graphPlotPropsSchema.safeParse(input);
		if (!parsed.success) {
			const issue = parsed.error.issues[0];
			throw new Error(`Invalid graph plot config: ${issue?.message ?? 'schema validation failed'}`);
		}

		return { props: parsed.data };
	}
};
