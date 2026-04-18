'use client';

import { useRef, useState } from 'react';
import { useTranslations } from 'next-intl';

export type PreparedAvatar = {
	preview: string;
	data: string;
	mime: 'image/png';
};

type AvatarUploadFieldProps = {
	alt: string;
	imageUrl?: string | null;
	uploadUrl?: string;
	deleteUrl?: string;
	value?: PreparedAvatar | null;
	onValueChange?: (value: PreparedAvatar | null) => void;
	onUploaded?: () => void;
	onDeleted?: () => void;
};

function mapError(t: ReturnType<typeof useTranslations>, key: string): string {
	const known = new Set([
		'server_error',
		'too_large',
		'validation_error',
		'forbidden',
		'not_found',
		'invalid_unit_id'
	]);
	if (key === 'upload_failed' || key === 'avatar_delete_failed') {
		return t('errors.server_error');
	}
	if (known.has(key)) return t(`errors.${key}` as Parameters<typeof t>[0]);
	return key;
}

export default function AvatarUploadField(props: AvatarUploadFieldProps) {
	const t = useTranslations('units');
	const inputRef = useRef<HTMLInputElement>(null);
	const [pending, setPending] = useState<PreparedAvatar | null>(null);
	const [busy, setBusy] = useState(false);
	const [error, setError] = useState<string | null>(null);

	const currentValue = props.value ?? null;
	const showCurrent = !pending && !!props.imageUrl;
	const showPrepared = !pending && !props.imageUrl && !!currentValue;

	function clearInput() {
		if (inputRef.current) inputRef.current.value = '';
	}

	function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
		const file = e.target.files?.[0];
		if (!file) return;
		setError(null);

		const validTypes = ['image/png', 'image/jpeg', 'image/webp'];
		if (!validTypes.includes(file.type)) return;

		const reader = new FileReader();
		reader.onload = () => {
			const img = new Image();
			img.onload = () => {
				if (img.width < 128 || img.height < 128) {
					setError(t('avatarTooSmall'));
					return;
				}

				const size = Math.min(img.width, img.height, 256);
				const canvas = document.createElement('canvas');
				canvas.width = size;
				canvas.height = size;
				const ctx = canvas.getContext('2d');
				if (!ctx) return;

				const sourceSize = Math.min(img.width, img.height);
				const sx = (img.width - sourceSize) / 2;
				const sy = (img.height - sourceSize) / 2;
				ctx.drawImage(img, sx, sy, sourceSize, sourceSize, 0, 0, size, size);

				const preview = canvas.toDataURL('image/png');
				setPending({ preview, data: preview.split(',')[1], mime: 'image/png' });
			};
			img.src = reader.result as string;
		};
		reader.readAsDataURL(file);
	}

	async function confirmPending() {
		if (!pending) return;
		setError(null);
		setBusy(true);
		try {
			if (props.uploadUrl) {
				const res = await fetch(props.uploadUrl, {
					method: 'POST',
					headers: { 'content-type': 'application/json' },
					body: JSON.stringify({ data: pending.data, mime: pending.mime })
				});
				if (!res.ok) {
					let key = 'upload_failed';
					try {
						const data = await res.json() as { error?: string };
						if (data?.error) key = data.error;
					} catch {
					}
					throw new Error(key);
				}
				props.onUploaded?.();
			} else {
				props.onValueChange?.(pending);
			}
			setPending(null);
			clearInput();
		} catch (err: unknown) {
			const key = err instanceof Error ? err.message : 'server_error';
			setError(mapError(t, key));
		} finally {
			setBusy(false);
		}
	}

	async function removeCurrent() {
		setError(null);
		if (props.deleteUrl) {
			setBusy(true);
			try {
				const res = await fetch(props.deleteUrl, { method: 'DELETE' });
				if (!res.ok) {
					let key = 'avatar_delete_failed';
					try {
						const data = await res.json() as { error?: string };
						if (data?.error) key = data.error;
					} catch {
					}
					throw new Error(key);
				}
				props.onDeleted?.();
			} catch (err: unknown) {
				const key = err instanceof Error ? err.message : 'server_error';
				setError(mapError(t, key));
			} finally {
				setBusy(false);
			}
			return;
		}

		props.onValueChange?.(null);
		clearInput();
	}

	const hasAnyAvatar = !!props.imageUrl || !!currentValue;

	return (
		<div className="space-y-3">
			<div className="flex items-center gap-3">
				<div className="flex h-16 w-16 shrink-0 items-center justify-center rounded-lg bg-neutral-900 p-2 ring-1 ring-neutral-800">
					{pending ? (
						<img src={pending.preview} alt="" className="h-full w-full rounded object-contain" />
					) : showCurrent ? (
						<img src={props.imageUrl ?? undefined} alt={props.alt} className="h-full w-full rounded object-contain" />
					) : showPrepared ? (
						<img src={currentValue?.preview} alt="" className="h-full w-full rounded object-contain" />
					) : (
						<span className="text-neutral-500">-</span>
					)}
				</div>
				<input
					ref={inputRef}
					type="file"
					accept="image/png,image/jpeg,image/webp"
					onChange={handleFileChange}
					className="hidden"
				/>
				<div className="flex flex-wrap gap-2">
					<button
						type="button"
						disabled={busy}
						onClick={() => inputRef.current?.click()}
						className="inline-flex items-center rounded-lg border border-neutral-700 bg-neutral-900 px-3 py-1.5 text-xs font-semibold text-neutral-300 transition hover:bg-neutral-800 disabled:opacity-60"
					>
						{hasAnyAvatar ? t('avatarChange') : t('uploadAvatar')}
					</button>
					{hasAnyAvatar && !pending && (
						<button
							type="button"
							disabled={busy}
							onClick={removeCurrent}
							className="inline-flex items-center rounded-lg border border-neutral-700 bg-neutral-900 px-3 py-1.5 text-xs font-semibold text-red-400 transition hover:bg-neutral-800 disabled:opacity-60"
						>
							{t('removeAvatar')}
						</button>
					)}
				</div>
			</div>

			{pending && (
				<div className="space-y-3 rounded-xl border border-amber-400/35 bg-amber-300/10 px-3 py-3">
					<p className="text-[11px] font-bold uppercase tracking-[0.2em] text-amber-200">{t('avatarConfirm.title')}</p>
					<p className="text-sm leading-relaxed text-amber-50/95">{t('avatarConfirm.body')}</p>
					<div className="flex gap-2">
						<button
							type="button"
							disabled={busy}
							onClick={confirmPending}
							className="inline-flex items-center rounded-lg bg-[color:var(--accent)] px-3 py-1.5 text-xs font-semibold text-neutral-950 transition hover:opacity-90 disabled:opacity-60"
						>
							{busy ? t('editSaving') : t('avatarConfirm.accept')}
						</button>
						<button
							type="button"
							disabled={busy}
							onClick={() => { setPending(null); clearInput(); }}
							className="inline-flex items-center rounded-lg border border-neutral-700 bg-neutral-900 px-3 py-1.5 text-xs font-semibold text-neutral-300 transition hover:bg-neutral-800 disabled:opacity-60"
						>
							{t('cancel')}
						</button>
					</div>
				</div>
			)}

			{error && <p className="text-sm text-red-400">{error}</p>}
		</div>
	);
}
