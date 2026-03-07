import type { UIRendererHandler } from '../../types';

export const immersiveTimedQuizHandler: UIRendererHandler = {
	componentKey: 'ImmersiveTimedQuiz',
	async validateAndBuildProps(input) {
		return { props: input };
	}
};
