'use client';

import { useRef, useState } from 'react';
import { useTranslations } from 'next-intl';

type CallsignSearchResponse =
	| { ok: true; query: string; results: string[]; total: number }
	| { ok: false; error: 'invalid_request' | 'server_error' };

export default function CallsignSearch() {
	const t = useTranslations('form');

	const [open, setOpen] = useState(false);
	const [query, setQuery] = useState('');
	const [status, setStatus] = useState<
		| { state: 'idle' }
		| { state: 'loading' }
		| { state: 'ok'; results: string[]; total: number }
		| { state: 'error' }
	>({ state: 'idle' });

	const abortRef = useRef<AbortController | null>(null);
	const timerRef = useRef<number | null>(null);

	const runSearch = async (trimmed: string) => {
		abortRef.current?.abort();
		const controller = new AbortController();
		abortRef.current = controller;

		setStatus({ state: 'loading' });
		try {
			const url = `/api/callsign/search?q=${encodeURIComponent(trimmed)}`;
			const res = await fetch(url, {
				method: 'GET',
				headers: { Accept: 'application/json' },
				signal: controller.signal
			});
			if (!res.ok) {
				setStatus({ state: 'error' });
				return;
			}
			const json = (await res.json()) as CallsignSearchResponse;
			if (!json || typeof json !== 'object' || !('ok' in json) || json.ok !== true) {
				setStatus({ state: 'error' });
				return;
			}

			const results = Array.isArray(json.results) ? json.results.filter((x) => typeof x === 'string') : [];
			const total = typeof json.total === 'number' ? json.total : results.length;
			setStatus({ state: 'ok', results, total });
		} catch {
			if (controller.signal.aborted) return;
			setStatus({ state: 'error' });
		}
	};

	const scheduleSearch = (nextQuery: string) => {
		if (!open) return;
		if (timerRef.current !== null) {
			window.clearTimeout(timerRef.current);
			timerRef.current = null;
		}

		const trimmed = nextQuery.trim();
		if (trimmed.length === 0) {
			abortRef.current?.abort();
			abortRef.current = null;
			setStatus({ state: 'idle' });
			return;
		}

		if (trimmed.length < 2 || !/^[A-Za-z0-9_]+$/.test(trimmed)) {
			abortRef.current?.abort();
			abortRef.current = null;
			setStatus({ state: 'idle' });
			return;
		}

		timerRef.current = window.setTimeout(() => {
			timerRef.current = null;
			void runSearch(trimmed);
		}, 250);
	};

	return (
		<div className="mt-4">
			<button
				type="button"
				onClick={() => {
					setOpen((v) => {
						const next = !v;
						if (!next) {
							if (timerRef.current !== null) {
								window.clearTimeout(timerRef.current);
								timerRef.current = null;
							}
							abortRef.current?.abort();
							abortRef.current = null;
							setStatus({ state: 'idle' });
						}
						return next;
					});
				}}
				className="inline-flex items-center justify-center rounded-lg border border-neutral-700 bg-neutral-950 px-3 py-2 text-xs font-semibold text-neutral-50 hover:border-neutral-600 focus:outline-none focus:ring-2 focus:ring-[color:var(--accent)]/30"
			>
				{open ? t('callsignSearch.hide') : t('callsignSearch.show')}
			</button>

			{open ? (
				<div className="mt-3 rounded-xl border border-neutral-800 bg-neutral-950/40 p-3">
					<p className="text-xs font-medium text-neutral-200">{t('callsignSearch.title')}</p>
					<p className="mt-1 text-xs text-neutral-400">{t('callsignSearch.help')}</p>

					<input
						id="callsign-search"
						type="text"
						value={query}
						onChange={(e) => {
							const next = e.target.value;
							setQuery(next);
							scheduleSearch(next);
						}}
						placeholder={t('callsignSearch.placeholder')}
						className="mt-3 block w-full rounded-lg border border-neutral-700 bg-neutral-950 px-3 py-2 text-neutral-50 placeholder-neutral-500 shadow-sm focus:border-[color:var(--accent)] focus:outline-none focus:ring-2 focus:ring-[color:var(--accent)]/20"
						autoComplete="off"
					/>

					<div className="mt-3">
						{status.state === 'idle' ? (
							<p className="text-xs text-neutral-400">{t('callsignSearch.idle')}</p>
						) : status.state === 'loading' ? (
							<p className="text-xs text-neutral-400">{t('callsignSearch.loading')}</p>
						) : status.state === 'ok' ? (
							status.results.length === 0 ? (
								<p className="text-xs text-neutral-400">{t('callsignSearch.noResults')}</p>
							) : (
								<div className="grid gap-2">
									<p className="text-xs text-neutral-400">{t('callsignSearch.results', { count: status.total })}</p>
									<ul className="grid gap-1 text-xs text-neutral-200">
										{status.results.slice(0, 20).map((r) => (
											<li key={r} className="rounded-md border border-neutral-800 bg-neutral-950/60 px-2 py-1">
												{r}
											</li>
										))}
									</ul>
								</div>
							)
						) : (
							<p className="text-xs text-neutral-400">{t('callsignSearch.error')}</p>
						)}
					</div>
				</div>
			) : null}
		</div>
	);
}
