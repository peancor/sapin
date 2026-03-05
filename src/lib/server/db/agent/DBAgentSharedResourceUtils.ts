import { db } from '..';
import { eq } from 'drizzle-orm';
import * as schema from '../schema';

export interface SharedImageResource {
	resourceId: string;
	fileId: string;
	name: string;
	mimeType: string;
}

export type SharedImageResourceResolution =
	| { ok: true; resource: SharedImageResource }
	| { ok: false; error: string };

type SharedImageCandidate = typeof schema.interactiveLearningFile.$inferSelect;

export default class DBAgentSharedResourceUtils {
	private static extractFileIdFromPath(path: string | null | undefined): string | null {
		if (!path) return null;
		const match = path.match(/\/api\/files\/([^/?#]+)/i);
		return match?.[1] ?? null;
	}

	private static normalizeResourceName(value: string): string {
		return value
			.normalize('NFD')
			.replace(/[\u0300-\u036f]/g, '')
			.trim()
			.toLowerCase()
			.replace(/[^a-z0-9]+/g, ' ')
			.replace(/\s+/g, ' ');
	}

	private static removeExtension(value: string): string {
		return value.replace(/\.[a-z0-9]{1,6}$/i, '');
	}

	private static scoreImageNameMatch(query: string, candidateName: string): number {
		const q = this.normalizeResourceName(query);
		const c = this.normalizeResourceName(candidateName);
		const qNoExt = this.removeExtension(q);
		const cNoExt = this.removeExtension(c);

		if (q.length === 0 || c.length === 0) return 0;
		if (q === c) return 140;
		if (qNoExt === cNoExt) return 130;
		if (c.startsWith(q) || cNoExt.startsWith(qNoExt)) return 110;
		if (c.includes(q) || cNoExt.includes(qNoExt)) return 90;

		const queryTokens = qNoExt.split(' ').filter((token) => token.length > 1);
		if (queryTokens.length === 0) return 0;

		let overlap = 0;
		for (const token of queryTokens) {
			if (cNoExt.includes(token)) overlap++;
		}

		return overlap > 0 ? 40 + overlap * 10 : 0;
	}

	private static toSharedImageResource(
		resource: SharedImageCandidate,
		errorContext: string
	): SharedImageResourceResolution {
		if (!resource.mimeType.startsWith('image/')) {
			return {
				ok: false,
				error: `Shared resource "${errorContext}" is not an image.`
			};
		}

		const fileId = resource.fileStorageId ?? this.extractFileIdFromPath(resource.path);
		if (!fileId) {
			return {
				ok: false,
				error: `Shared resource "${errorContext}" has no valid file reference.`
			};
		}

		return {
			ok: true,
			resource: {
				resourceId: resource.id,
				fileId,
				name: resource.name,
				mimeType: resource.mimeType
			}
		};
	}

	static async resolveSharedImageByName(
		activityId: string,
		resourceName: string
	): Promise<SharedImageResourceResolution> {
		const resources = await db
			.select()
			.from(schema.interactiveLearningFile)
			.where(eq(schema.interactiveLearningFile.interactiveLearningId, activityId));

		const imageResources = resources.filter((resource) => resource.mimeType.startsWith('image/'));
		if (imageResources.length === 0) {
			return {
				ok: false,
				error: `No shared images are available in this activity for "${resourceName}".`
			};
		}

		const scored = imageResources
			.map((resource) => ({
				resource,
				score: this.scoreImageNameMatch(resourceName, resource.name)
			}))
			.filter((entry) => entry.score > 0)
			.sort((a, b) => {
				if (b.score !== a.score) return b.score - a.score;
				return b.resource.createdAt.getTime() - a.resource.createdAt.getTime();
			});

		const bestMatch = scored[0]?.resource;
		if (!bestMatch) {
			return {
				ok: false,
				error: `No shared image matching "${resourceName}" was found in this activity.`
			};
		}

		return this.toSharedImageResource(bestMatch, resourceName);
	}
}
