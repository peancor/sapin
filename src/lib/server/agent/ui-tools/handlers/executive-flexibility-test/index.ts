import type { UIRendererHandler } from '../../types';

export const executiveFlexibilityTestHandler: UIRendererHandler = {
	componentKey: 'ExecutiveFlexibilityTest',
	async validateAndBuildProps(input) {
		return { props: input };
	}
};
