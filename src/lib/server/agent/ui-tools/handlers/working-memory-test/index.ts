import type { UIRendererHandler } from '../../types';

export const workingMemoryTestHandler: UIRendererHandler = {
	componentKey: 'WorkingMemoryTest',
	async validateAndBuildProps(input) {
		return { props: input };
	}
};
