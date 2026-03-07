import type { UIRendererHandler } from '../../types';

export const attentionControlTestHandler: UIRendererHandler = {
	componentKey: 'AttentionControlTest',
	async validateAndBuildProps(input) {
		return { props: input };
	}
};
