import { prepareTikzjaxBrowserDiagram } from '$lib/utils/tikzjaxBrowserDiagram';
import type { UIRendererHandler } from '../../types';

export const tikzjaxDiagramCardHandler: UIRendererHandler = {
	componentKey: 'TikzjaxDiagramCard',
	async validateAndBuildProps(input) {
		const source =
			typeof input.source === 'string' && input.source.trim().length > 0
				? input.source.trim()
				: undefined;

		if (!source) {
			throw new Error('Invalid TikZJax diagram config: source is required.');
		}

		if (input.title !== undefined && typeof input.title !== 'string') {
			throw new Error('Invalid TikZJax diagram config: title must be a string.');
		}

		if (input.caption !== undefined && typeof input.caption !== 'string') {
			throw new Error('Invalid TikZJax diagram config: caption must be a string.');
		}

		if (input.ariaLabel !== undefined && typeof input.ariaLabel !== 'string') {
			throw new Error('Invalid TikZJax diagram config: ariaLabel must be a string.');
		}

		if (
			input.texPackages !== undefined &&
			(!Array.isArray(input.texPackages) || input.texPackages.some((item) => typeof item !== 'string'))
		) {
			throw new Error('Invalid TikZJax diagram config: texPackages must be an array of strings.');
		}

		if (
			input.tikzLibraries !== undefined &&
			(!Array.isArray(input.tikzLibraries) ||
				input.tikzLibraries.some((item) => typeof item !== 'string'))
		) {
			throw new Error(
				'Invalid TikZJax diagram config: tikzLibraries must be an array of strings.'
			);
		}

		if (input.addToPreamble !== undefined && typeof input.addToPreamble !== 'string') {
			throw new Error('Invalid TikZJax diagram config: addToPreamble must be a string.');
		}

		const prepared = prepareTikzjaxBrowserDiagram({
			source,
			texPackages: Array.isArray(input.texPackages) ? input.texPackages : undefined,
			tikzLibraries: Array.isArray(input.tikzLibraries) ? input.tikzLibraries : undefined,
			addToPreamble: typeof input.addToPreamble === 'string' ? input.addToPreamble : undefined,
			ariaLabel: typeof input.ariaLabel === 'string' ? input.ariaLabel : undefined
		});

		return {
			props: {
				request: prepared.request,
				normalizedSource: prepared.normalizedSource,
				normalizationNotes: prepared.normalizationNotes,
				detectedPackages: prepared.detectedPackages,
				detectedLibraries: prepared.detectedLibraries,
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
