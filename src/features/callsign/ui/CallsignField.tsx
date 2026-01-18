'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { useTranslations } from 'next-intl';

type CallsignCheckResponse =
	| { ok: true; normalized: string; exactMatches: string[]; soundMatches: string[] }
	| { ok: false; error: 'invalid_request' | 'server_error' };

export default function CallsignField(props: {
	value: string;
	onChange: (value: string) => void;
	onBlur: () => void;
	error?: string;
}) {
	const t = useTranslations('form');
	const { value, onChange, onBlur, error } = props;

	const [status, setStatus] = useState<
		| { state: 'idle' }
		| { state: 'checking' }
		| { state: 'ok'; normalized: string }
		| { state: 'conflict'; normalized: string; exactMatches: string[]; soundMatches: string[] }
		| { state: 'error' }
	>({ state: 'idle' });

	const abortRef = useRef<AbortController | null>(null);
	const debouncedValue = useDebouncedValue(value, 450);
	const trimmed = useMemo(() => debouncedValue.trim(), [debouncedValue]);

	useEffect(() => {
		if (trimmed.length < 3) return;

		abortRef.current?.abort();
		const controller = new AbortController();
		abortRef.current = controller;

		void (async () => {
			setStatus({ state: 'checking' });
			try {
				const url = `/api/callsign/check?callsign=${encodeURIComponent(trimmed)}`;
				const res = await fetch(url, {
					method: 'GET',
					headers: { Accept: 'application/json' },
					signal: controller.signal
				});
				if (!res.ok) {
					setStatus({ state: 'error' });
					return;
				}
				const json = (await res.json()) as CallsignCheckResponse;
				if (!json || typeof json !== 'object' || !('ok' in json) || json.ok !== true) {
					setStatus({ state: 'error' });
					return;
				}

				const exactMatches = Array.isArray(json.exactMatches) ? json.exactMatches : [];
				const soundMatches = Array.isArray(json.soundMatches) ? json.soundMatches : [];
				if (exactMatches.length === 0 && soundMatches.length === 0) {
					setStatus({ state: 'ok', normalized: json.normalized });
				} else {
					setStatus({
						state: 'conflict',
						normalized: json.normalized,
						exactMatches,
						soundMatches
					});
				}
			} catch {
				if (controller.signal.aborted) return;
				setStatus({ state: 'error' });
			}
		})();

		return () => {
			controller.abort();
		};
	}, [trimmed]);

	return (
		<div>
			<label htmlFor="callsign" className="block text-sm font-medium text-neutral-200">
				{t('callsign')}
			</label>
			<input
				id="callsign"
				type="text"
				value={value}
				onChange={(e) => {
					const next = e.target.value;
					onChange(next);
					if (next.trim().length < 3) {
						abortRef.current?.abort();
						abortRef.current = null;
						setStatus({ state: 'idle' });
					}
				}}
				onBlur={onBlur}
				placeholder={t('callsignPlaceholder')}
				className={`mt-2 block w-full rounded-lg border ${error ? 'border-red-500' : 'border-neutral-700'} bg-neutral-950 px-3 py-2 text-neutral-50 placeholder-neutral-500 shadow-sm focus:border-[color:var(--accent)] focus:outline-none focus:ring-2 focus:ring-[color:var(--accent)]/20`}
				autoComplete="username"
			/>

			{error ? <p className="mt-2 text-xs text-red-400">{error}</p> : null}

			{!error ? (
				<div className="mt-2">
					{status.state === 'idle' ? (
						<p className="text-xs text-neutral-400">{t('callsignHelp')}</p>
					) : status.state === 'checking' ? (
						<p className="text-xs text-neutral-400">{t('callsignCheck.checking')}</p>
					) : status.state === 'ok' ? (
						<p className="text-xs text-emerald-300">{t('callsignCheck.available')}</p>
					) : status.state === 'conflict' ? (
						<div className="grid gap-1">
							<p className="text-xs text-amber-300">{t('callsignCheck.conflict')}</p>
							{status.exactMatches.length > 0 ? (
								<p className="text-xs text-neutral-300">
									{t('callsignCheck.exact', { example: status.exactMatches.slice(0, 3).join(', ') })}
								</p>
							) : null}
							{status.soundMatches.length > 0 ? (
								<p className="text-xs text-neutral-300">
									{t('callsignCheck.sound', { example: status.soundMatches.slice(0, 3).join(', ') })}
								</p>
							) : null}
							<p className="text-xs text-neutral-400">{t('callsignCheck.note')}</p>
						</div>
					) : (
						<p className="text-xs text-neutral-400">{t('callsignCheck.error')}</p>
					)}
				</div>
			) : null}
		</div>
	);
}

function useDebouncedValue<T>(value: T, delayMs: number): T {
	const [debounced, setDebounced] = useState(value);
	useEffect(() => {
		const id = window.setTimeout(() => setDebounced(value), delayMs);
		return () => window.clearTimeout(id);
	}, [value, delayMs]);
	return debounced;
}
