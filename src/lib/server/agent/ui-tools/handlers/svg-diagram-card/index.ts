import { prepareSvgDiagram } from '$lib/utils/svgDiagram';
import type { UIRendererHandler } from '../../types';

export const svgDiagramCardHandler: UIRendererHandler = {
	componentKey: 'SvgDiagramCard',
	async validateAndBuildProps(input) {
		const rawSvg =
			typeof input.svg === 'string' && input.svg.trim().length > 0 ? input.svg.trim() : undefined;

		if (!rawSvg) {
			throw new Error('Invalid SVG diagram config: svg is required.');
		}

		if (input.title !== undefined && typeof input.title !== 'string') {
			throw new Error('Invalid SVG diagram config: title must be a string.');
		}

		if (input.caption !== undefined && typeof input.caption !== 'string') {
			throw new Error('Invalid SVG diagram config: caption must be a string.');
		}

		if (input.ariaLabel !== undefined && typeof input.ariaLabel !== 'string') {
			throw new Error('Invalid SVG diagram config: ariaLabel must be a string.');
		}

		const prepared = prepareSvgDiagram(rawSvg);

		return {
			props: {
				svg: prepared.svg,
				notes: prepared.notes,
				...(typeof input.title === 'string' && input.title.trim()
					? { title: input.title.trim() }
					: {}),
				...(typeof input.caption === 'string' && input.caption.trim()
					? { caption: input.caption.trim() }
					: {}),
				...(typeof input.ariaLabel === 'string' && input.ariaLabel.trim()
					? { ariaLabel: input.ariaLabel.trim() }
					: {})
			}
		};
	}
};
