import { SignJWT } from 'jose';
import { db } from '$lib/server/db';
import * as table from '$lib/server/db/schema';
import { and, eq } from 'drizzle-orm';
import { LTI_CLAIMS } from './claims';
import { getActiveSigningKey } from './keys';

export type DeepLinkContentItemInput = {
	origin: string;
	courseId: string;
	activityId: string;
	title: string;
	enableGradebook: boolean;
};

export type DeepLinkContentItem = {
	type: 'ltiResourceLink';
	title: string;
	url: string;
	custom: {
		sapin_activity_id: string;
		sapin_course_id: string;
	};
	lineItem?: {
		scoreMaximum: number;
		label: string;
		resourceId: string;
		tag: string;
	};
};

export function buildDeepLinkContentItem(input: DeepLinkContentItemInput): DeepLinkContentItem {
	const item: DeepLinkContentItem = {
		type: 'ltiResourceLink',
		title: input.title,
		url: new URL('/lti/launch', input.origin).toString(),
		custom: {
			sapin_activity_id: input.activityId,
			sapin_course_id: input.courseId
		}
	};

	if (input.enableGradebook) {
		item.lineItem = {
			scoreMaximum: 100,
			label: input.title,
			resourceId: input.activityId,
			tag: `sapin:${input.courseId}:${input.activityId}`
		};
	}

	return item;
}

export async function buildDeepLinkResponseJwt(input: {
	platform: table.LtiPlatformRegistration;
	deployment: table.LtiDeployment;
	origin: string;
	data?: string | null;
	contentItems: DeepLinkContentItem[];
}) {
	const signingKey = await getActiveSigningKey();

	return new SignJWT({
		[LTI_CLAIMS.MESSAGE_TYPE]: 'LtiDeepLinkingResponse',
		[LTI_CLAIMS.VERSION]: '1.3.0',
		[LTI_CLAIMS.DEPLOYMENT_ID]: input.deployment.deploymentId,
		'https://purl.imsglobal.org/spec/lti-dl/claim/content_items': input.contentItems,
		data: input.data ?? undefined
	})
		.setProtectedHeader({ alg: signingKey.algorithm, kid: signingKey.kid, typ: 'JWT' })
		.setIssuer(input.platform.clientId)
		.setAudience(input.platform.issuer)
		.setIssuedAt()
		.setExpirationTime('5m')
		.sign(signingKey.key);
}

export async function getSelectableActivitiesForCourse(courseId: string) {
	return db
		.select({
			id: table.interactiveLearning.id,
			name: table.interactiveLearning.name,
			type: table.interactiveLearning.type,
			status: table.interactiveLearning.status
		})
		.from(table.courseInteractiveLearning)
		.innerJoin(
			table.interactiveLearning,
			eq(table.courseInteractiveLearning.interactiveLearningId, table.interactiveLearning.id)
		)
		.where(
			and(
				eq(table.courseInteractiveLearning.courseId, courseId),
				eq(table.interactiveLearning.status, table.interactiveLearningStatus.PUBLISHED)
			)
		)
		.orderBy(table.courseInteractiveLearning.order);
}
