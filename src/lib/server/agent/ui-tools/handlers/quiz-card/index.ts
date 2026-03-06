import type { UIRendererHandler } from '../types';

export const quizCardHandler: UIRendererHandler = {
	componentKey: 'QuizCard',
	async validateAndBuildProps(input) {
		// ToolManager already validates against the tool JSON schema.
		return { props: input };
	}
};
