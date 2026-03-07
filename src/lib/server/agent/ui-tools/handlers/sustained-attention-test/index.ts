import type { UIRendererHandler } from '../../types';

export const sustainedAttentionTestHandler: UIRendererHandler = {
	componentKey: 'SustainedAttentionTest',
	async validateAndBuildProps(input) {
		return { props: input };
	}
};
