import type { UIRendererHandler } from '../../types';

export const timedQuizCardHandler: UIRendererHandler = {
	componentKey: 'TimedQuizCard',
	async validateAndBuildProps(input) {
		// ToolManager already validates against the tool JSON schema.
		return { props: input };
	}
};
