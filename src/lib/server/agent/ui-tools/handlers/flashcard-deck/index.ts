import type { UIRendererHandler } from '../types';

export const flashcardDeckHandler: UIRendererHandler = {
	componentKey: 'FlashcardDeck',
	async validateAndBuildProps(input) {
		// ToolManager already validates against the tool JSON schema.
		return { props: input };
	}
};
