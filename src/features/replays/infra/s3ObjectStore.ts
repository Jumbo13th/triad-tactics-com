import { AwsClient } from 'aws4fetch';

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

export function isConfigured(): boolean {
	return readConfig() !== null;
}

export async function put(key: string, body: Buffer, bodySha256: string): Promise<void> {
	const config = readConfig();
	if (!config) throw new Error('replay_storage_not_configured');

	const client = new AwsClient({
		accessKeyId: config.accessKeyId,
		secretAccessKey: config.secretAccessKey,
		service: 's3',
		region: config.region,
		retries: STORE_RETRIES,
	});
	// Path-style addressing works with every S3-compatible store. The body hash is signed
	// instead of left out, so a store that checks it refuses bytes changed on the way.
	const res = await client.fetch(`${config.endpoint}/${encodeURIComponent(config.bucket)}/${key}`, {
		method: 'PUT',
		// A view rather than a copy; fetch's types want an ArrayBuffer-backed view, which a
		// Buffer joined from pieces always is.
		body: new Uint8Array(body.buffer as ArrayBuffer, body.byteOffset, body.byteLength),
		headers: { 'content-type': 'application/gzip', 'x-amz-content-sha256': bodySha256 },
		signal: AbortSignal.timeout(PUT_TIMEOUT_MS),
	});
	await res.arrayBuffer().catch(() => undefined);
	if (!res.ok) throw new Error(`replay_storage_put_failed: HTTP ${res.status}`);
}
