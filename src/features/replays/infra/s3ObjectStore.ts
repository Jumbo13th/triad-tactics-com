import { AwsClient } from 'aws4fetch';
import type { StoredObject } from '../ports';

type S3Config = {
	endpoint: string;
	region: string;
	bucket: string;
	accessKeyId: string;
	secretAccessKey: string;
};

// The host retries a failed commit itself, and the commit has to answer within
// kamal-proxy's 60-second response timeout, so the store gets few retries and a deadline.
const STORE_RETRIES = 2;
const PUT_TIMEOUT_MS = 45_000;
const GET_TIMEOUT_MS = 30_000;

// Any S3-compatible store. The bucket stays private: files reach viewers only through the
// website, which also serves countries where the storage provider is blocked.
function readConfig(): S3Config | null {
	const endpoint = process.env.REPLAY_S3_ENDPOINT?.trim();
	const region = process.env.REPLAY_S3_REGION?.trim();
	const bucket = process.env.REPLAY_S3_BUCKET?.trim();
	const accessKeyId = process.env.REPLAY_S3_ACCESS_KEY_ID?.trim();
	const secretAccessKey = process.env.REPLAY_S3_SECRET_ACCESS_KEY?.trim();
	if (!endpoint || !region || !bucket || !accessKeyId || !secretAccessKey) return null;
	return { endpoint: endpoint.replace(/\/+$/, ''), region, bucket, accessKeyId, secretAccessKey };
}

function connect(): { client: AwsClient; url: (key: string) => string } {
	const config = readConfig();
	if (!config) throw new Error('replay_storage_not_configured');
	const client = new AwsClient({
		accessKeyId: config.accessKeyId,
		secretAccessKey: config.secretAccessKey,
		service: 's3',
		region: config.region,
		retries: STORE_RETRIES,
	});
	// Path-style addressing works with every S3-compatible store.
	return { client, url: (key) => `${config.endpoint}/${encodeURIComponent(config.bucket)}/${key}` };
}

export function isConfigured(): boolean {
	return readConfig() !== null;
}

export async function put(key: string, body: Buffer, bodySha256: string): Promise<void> {
	const { client, url } = connect();
	// The body hash is signed instead of left out, so a store that checks it refuses
	// bytes changed on the way.
	const res = await client.fetch(url(key), {
		method: 'PUT',
		// A view rather than a copy; fetch's types want an ArrayBuffer-backed view, which a
		// Buffer joined from pieces always is.
		body: new Uint8Array(body.buffer as ArrayBuffer, body.byteOffset, body.byteLength),
		headers: { 'content-type': 'application/octet-stream', 'x-amz-content-sha256': bodySha256 },
		signal: AbortSignal.timeout(PUT_TIMEOUT_MS),
	});
	await res.arrayBuffer().catch(() => undefined);
	if (!res.ok) throw new Error(`replay_storage_put_failed: HTTP ${res.status}`);
}

export async function open(key: string): Promise<StoredObject | null> {
	const { client, url } = connect();
	// The deadline covers the store answering, not the body: a viewer on a slow line may
	// take longer than that to download a large segment.
	const controller = new AbortController();
	const timer = setTimeout(() => controller.abort(), GET_TIMEOUT_MS);
	let res: Response;
	try {
		res = await client.fetch(url(key), { signal: controller.signal });
	} finally {
		clearTimeout(timer);
	}
	if (res.status === 404) {
		await res.arrayBuffer().catch(() => undefined);
		return null;
	}
	if (!res.ok || !res.body) {
		await res.arrayBuffer().catch(() => undefined);
		throw new Error(`replay_storage_get_failed: HTTP ${res.status}`);
	}
	const length = Number(res.headers.get('content-length'));
	return { body: res.body, size: Number.isFinite(length) && length >= 0 ? length : null };
}

export async function read(key: string): Promise<Buffer | null> {
	const stored = await open(key);
	if (!stored) return null;
	return Buffer.from(await new Response(stored.body).arrayBuffer());
}
