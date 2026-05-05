import { DBAgentSharedResourceUtils } from '$lib/server/db/agent';
import type { UIRendererHandler } from '../../types';

export const sharedImageCardHandler: UIRendererHandler = {
	componentKey: 'SharedImageCard',
	async validateAndBuildProps(input, context) {
		const resourceName =
			typeof input.resourceName === 'string' && input.resourceName.trim().length > 0
				? input.resourceName.trim()
				: undefined;

		if (!resourceName) {
			throw new Error('Invalid shared image config: resourceName is required.');
		}

		if (input.title !== undefined && typeof input.title !== 'string') {
			throw new Error('Invalid shared image config: title must be a string.');
		}

		if (input.caption !== undefined && typeof input.caption !== 'string') {
			throw new Error('Invalid shared image config: caption must be a string.');
		}

		const resolved = await DBAgentSharedResourceUtils.resolveSharedImageByName(
			context.agentContext.activityId,
			resourceName
		);
		if (!resolved.ok) {
			throw new Error(resolved.error);
		}

		const title =
			typeof input.title === 'string' && input.title.trim().length > 0 ? input.title.trim() : undefined;
		const caption =
			typeof input.caption === 'string' && input.caption.trim().length > 0
				? input.caption.trim()
				: undefined;

		return {
			props: {
				resourceId: resolved.resource.resourceId,
				fileId: resolved.resource.fileId,
				name: resolved.resource.name,
				mimeType: resolved.resource.mimeType,
				...(title ? { title } : {}),
				...(caption ? { caption } : {})
			}
		};
	}
};
