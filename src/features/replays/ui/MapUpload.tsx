'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { AdminButton } from '@/features/admin/ui/root';

// Workbench's Export Map Data writes the relief as an uncompressed 32-bit TGA (64 MB for
// 4096×4096) and the geometry as a .topo file. The browser turns the TGA into a WebP of a
// few hundred kilobytes and gzips the geometry, so the server needs no image tools and
// every request stays under the proxy's body limit.

const PIECE_BYTES = 1_400_000;

type Status = { tone: 'busy' | 'ok' | 'err'; text: string } | null;

async function sha256Hex(data: ArrayBuffer | Uint8Array<ArrayBuffer>): Promise<string> {
	const digest = await crypto.subtle.digest('SHA-256', data);
	return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

async function reliefFromTga(file: File): Promise<Uint8Array<ArrayBuffer>> {
	const buffer = await file.arrayBuffer();
	const view = new DataView(buffer);
	const idLength = view.getUint8(0);
	const imageType = view.getUint8(2);
	const width = view.getUint16(12, true);
	const height = view.getUint16(14, true);
	const bpp = view.getUint8(16);
	const topLeft = (view.getUint8(17) & 0x20) !== 0;
	const bytesPerPixel = bpp / 8;
	if (imageType !== 2 || (bpp !== 32 && bpp !== 24) || width === 0 || height === 0) throw new Error('tga');
	const pixels = new Uint8Array(buffer, 18 + idLength);
	if (pixels.length < width * height * bytesPerPixel) throw new Error('tga');

	const rgba = new Uint8ClampedArray(width * height * 4);
	for (let y = 0; y < height; y++) {
		// A bottom-left origin stores the southern row first; the image wants north up.
		const sourceRow = topLeft ? y : height - 1 - y;
		for (let x = 0; x < width; x++) {
			const s = (sourceRow * width + x) * bytesPerPixel;
			const d = (y * width + x) * 4;
			rgba[d] = pixels[s + 2];
			rgba[d + 1] = pixels[s + 1];
			rgba[d + 2] = pixels[s];
			rgba[d + 3] = 255;
		}
	}
	const canvas = document.createElement('canvas');
	canvas.width = width;
	canvas.height = height;
	const ctx = canvas.getContext('2d');
	if (!ctx) throw new Error('tga');
	ctx.putImageData(new ImageData(rgba, width, height), 0, 0);
	// Browsers without a WebP encoder hand back PNG, which the server accepts too.
	const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/webp', 0.82));
	if (!blob) throw new Error('tga');
	return new Uint8Array(await blob.arrayBuffer());
}

async function gzip(data: ArrayBuffer): Promise<Uint8Array<ArrayBuffer>> {
	const stream = new Blob([data]).stream().pipeThrough(new CompressionStream('gzip'));
	return new Uint8Array(await new Response(stream).arrayBuffer());
}

async function sendMapFile(
	kind: 'relief' | 'topo',
	identity: string,
	size: number,
	encoded: Uint8Array<ArrayBuffer>,
	onPiece: () => void
): Promise<void> {
	const encodedSha256 = await sha256Hex(encoded);
	const pieces = Math.max(1, Math.ceil(encoded.length / PIECE_BYTES));
	for (let index = 0; index < pieces; index++) {
		const res = await fetch(`/api/admin/replays/maps/pieces?sha=${identity}&index=${index}`, {
			method: 'PUT',
			headers: { 'content-type': 'application/octet-stream' },
			body: encoded.slice(index * PIECE_BYTES, (index + 1) * PIECE_BYTES),
		});
		if (!res.ok) throw new Error('upload');
		onPiece();
	}
	const res = await fetch('/api/admin/replays/maps', {
		method: 'POST',
		headers: { 'content-type': 'application/json' },
		body: JSON.stringify({ kind, sha256: identity, size, encodedSize: encoded.length, encodedSha256, pieces }),
	});
	if (!res.ok) throw new Error('upload');
}

export default function MapUpload({
	world,
	map,
	onSaved,
}: {
	world: string;
	map: { relief: boolean; topo: boolean };
	onSaved: () => void;
}) {
	const t = useTranslations('replays');
	const [reliefFile, setReliefFile] = useState<File | null>(null);
	const [topoFile, setTopoFile] = useState<File | null>(null);
	const [status, setStatus] = useState<Status>(null);
	const busy = status?.tone === 'busy';

	const upload = async () => {
		let relief: string | null = null;
		let topo: string | null = null;
		try {
			let reliefBytes: Uint8Array<ArrayBuffer> | null = null;
			let topoParts: { raw: ArrayBuffer; encoded: Uint8Array<ArrayBuffer> } | null = null;
			if (reliefFile) {
				setStatus({ tone: 'busy', text: t('adminMapConverting') });
				try {
					reliefBytes = await reliefFromTga(reliefFile);
				} catch {
					setStatus({ tone: 'err', text: t('adminMapErrTga') });
					return;
				}
			}
			if (topoFile) {
				const raw = await topoFile.arrayBuffer();
				if (raw.byteLength < 8 || new TextDecoder().decode(new Uint8Array(raw, 0, 4)) !== 'TOPO') {
					setStatus({ tone: 'err', text: t('adminMapErrTopo') });
					return;
				}
				topoParts = { raw, encoded: await gzip(raw) };
			}

			const total =
				(reliefBytes ? Math.ceil(reliefBytes.length / PIECE_BYTES) : 0) +
				(topoParts ? Math.ceil(topoParts.encoded.length / PIECE_BYTES) : 0);
			let done = 0;
			const tick = () => {
				done++;
				setStatus({ tone: 'busy', text: t('adminMapUploading', { done, total }) });
			};
			setStatus({ tone: 'busy', text: t('adminMapUploading', { done, total }) });
			if (reliefBytes) {
				relief = await sha256Hex(reliefBytes);
				await sendMapFile('relief', relief, reliefBytes.length, reliefBytes, tick);
			}
			if (topoParts) {
				topo = await sha256Hex(topoParts.raw);
				await sendMapFile('topo', topo, topoParts.raw.byteLength, topoParts.encoded, tick);
			}

			const res = await fetch('/api/admin/replays', {
				method: 'POST',
				headers: { 'content-type': 'application/json' },
				body: JSON.stringify({ action: 'setMap', world, relief, topo }),
			});
			if (!res.ok) throw new Error('save');
			setStatus({ tone: 'ok', text: t('adminMapSaved') });
			setReliefFile(null);
			setTopoFile(null);
			onSaved();
		} catch {
			setStatus({ tone: 'err', text: t('adminMapErrUpload') });
		}
	};

	const inputClass =
		'block w-full text-sm text-neutral-300 file:mr-3 file:rounded-lg file:border-0 file:bg-white/10 file:px-3 file:py-2 file:text-sm file:font-semibold file:text-neutral-50 hover:file:bg-white/15';

	return (
		<div className="grid gap-3">
			<p className="text-xs leading-relaxed text-neutral-400">{t('adminMapHelp')}</p>
			<p className="text-sm text-neutral-300">
				{t('adminMapState', {
					relief: map.relief ? t('adminMapPresent') : t('adminMapAbsent'),
					topo: map.topo ? t('adminMapPresent') : t('adminMapAbsent'),
				})}
			</p>
			<div className="grid gap-3 sm:grid-cols-2">
				<label className="grid gap-1 text-xs text-neutral-400">
					{t('adminMapRelief')}
					<input type="file" accept=".tga" disabled={busy} className={inputClass} onChange={(e) => setReliefFile(e.target.files?.[0] ?? null)} />
				</label>
				<label className="grid gap-1 text-xs text-neutral-400">
					{t('adminMapTopo')}
					<input type="file" accept=".topo" disabled={busy} className={inputClass} onChange={(e) => setTopoFile(e.target.files?.[0] ?? null)} />
				</label>
			</div>
			<div className="flex flex-wrap items-center gap-3">
				<AdminButton variant="secondary" disabled={busy || (!reliefFile && !topoFile)} onClick={() => void upload()}>
					{t('adminMapUpload')}
				</AdminButton>
				{status ? (
					<span className={status.tone === 'err' ? 'text-sm text-red-300' : status.tone === 'ok' ? 'text-sm text-emerald-300' : 'text-sm text-neutral-300'}>
						{status.text}
					</span>
				) : null}
			</div>
		</div>
	);
}
