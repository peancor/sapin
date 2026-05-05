import type { UIRendererHandler } from '../../types';

export const drivingPsychotechTestHandler: UIRendererHandler = {
	componentKey: 'DrivingPsychotechTest',
	async validateAndBuildProps(input) {
		return { props: input };
	}
};
