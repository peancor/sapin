import { lookup } from 'node:dns/promises';
import { get as httpGet } from 'node:http';
import { get as httpsGet } from 'node:https';
import { BlockList } from 'node:net';

// Public Markdown images may be hosted elsewhere. Resolve once and connect to the
// checked IPv4 address, including after a redirect. Never pass the user's cookies.
const nonPublic = new BlockList();
for (const [address, bits] of [
	['0.0.0.0', 8],
	['10.0.0.0', 8],
	['100.64.0.0', 10],
	['127.0.0.0', 8],
	['169.254.0.0', 16],
	['172.16.0.0', 12],
	['192.0.0.0', 24],
	['192.0.2.0', 24],
	['192.88.99.0', 24],
	['192.168.0.0', 16],
	['198.18.0.0', 15],
	['198.51.100.0', 24],
	['203.0.113.0', 24],
	['224.0.0.0', 3]
] as const)
	nonPublic.addSubnet(address, bits);

export async function fetchPublicImage(
	url: URL,
	signal: AbortSignal,
	redirects = 0
): Promise<{ body: Buffer; contentType: string }> {
	if (
		!['http:', 'https:'].includes(url.protocol) ||
		url.port ||
		url.username ||
		url.password ||
		redirects > 3
	)
		throw Error('Invalid image URL');
	const { address } = await lookup(url.hostname, { family: 4 });
	if (nonPublic.check(address)) throw Error('Private image address');
	const get = url.protocol === 'https:' ? httpsGet : httpGet;
	const response = await new Promise<import('node:http').IncomingMessage>((resolve, reject) => {
		get(
			url,
			{
				agent: false,
				family: 4,
				lookup: (_host, _options, callback) => callback(null, address, 4),
				signal
			},
			resolve
		).once('error', reject);
	});
	if (
		response.statusCode &&
		[301, 302, 303, 307, 308].includes(response.statusCode) &&
		response.headers.location
	) {
		response.destroy();
		return fetchPublicImage(new URL(response.headers.location, url), signal, redirects + 1);
	}
	const contentType = response.headers['content-type']?.split(';')[0] ?? '';
	if (
		response.statusCode !== 200 ||
		!/^image\/(png|jpeg|webp|gif|svg\+xml|avif|bmp|x-icon)$/i.test(contentType)
	) {
		response.destroy();
		throw Error('Unavailable image');
	}
	const chunks: Buffer[] = [];
	let size = 0;
	for await (const chunk of response) {
		size += chunk.length;
		if (size > 16 * 1024 * 1024) {
			response.destroy();
			throw Error('Oversize image');
		}
		chunks.push(chunk);
	}
	return { body: Buffer.concat(chunks), contentType };
}
