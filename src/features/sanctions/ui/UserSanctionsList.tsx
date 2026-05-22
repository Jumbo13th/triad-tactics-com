'use client';

import { useEffect, useState } from 'react';
import { useLocale, useTranslations } from 'next-intl';
import { parseUserSanctionsResponse, isActiveSanction, localizeReason } from '@/features/sanctions/domain/api';
import { formatLocalizedDateTime } from '@/platform/dateTime';
import { useViewerDateTimePreferences } from '@/platform/useViewerDateTimePreferences';
import { TypeBadge } from './SanctionBadges';
import type { PublicSanctionEntry } from '@/features/sanctions/domain/types';

export default function UserSanctionsList() {
	const ts = useTranslations('sanctions');
	const locale = useLocale();
	const { timeZone, hourCycle } = useViewerDateTimePreferences();
	const fmtDate = (iso: string) => formatLocalizedDateTime(iso, { locale, timeZone, hourCycle, dateStyle: 'medium', timeStyle: 'short' }) ?? iso;
	const [sanctions, setSanctions] = useState<PublicSanctionEntry[]>([]);
	const [loaded, setLoaded] = useState(false);

	useEffect(() => {
		let cancelled = false;
		(async () => {
			try {
				const res = await fetch('/api/me/sanctions');
				const json = await res.json();
				const parsed = parseUserSanctionsResponse(json);
				if (cancelled) return;
				if (parsed) setSanctions(parsed.sanctions);
			} catch { /* ignore */ }
			if (!cancelled) setLoaded(true);
		})();
		return () => { cancelled = true; };
	}, []);

	if (!loaded) return null;
	if (sanctions.length === 0) return null;

	const active = sanctions.filter((s) => isActiveSanction(s));
	const past = sanctions.filter((s) => !isActiveSanction(s));

	return (
		<div className="mt-6">
			<p className="text-xs font-semibold uppercase tracking-wide text-neutral-400">{ts('profileTitle')}</p>

			{active.length > 0 ? (
				<div className="mt-3 grid gap-2">
					{active.map((s) => (
						<div key={s.id} className="rounded-xl border border-red-500/20 bg-red-500/5 p-4 shadow-sm shadow-black/10">
							<div className="flex flex-wrap items-center gap-2">
								<TypeBadge type={s.type} t={ts} size="small" />
								<span className="inline-flex items-center rounded-full bg-red-500/20 px-2 py-0.5 text-[10px] font-bold uppercase text-red-400">{ts('statusActive')}</span>
							</div>
							{s.reason ? <p className="mt-2 text-sm text-neutral-200">{localizeReason(s.reason, ts)}</p> : null}
							<div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-neutral-500">
								<span>{ts('expires')}: {s.expires_at ? fmtDate(s.expires_at) : ts('permanent')}</span>
								{s.issued_by ? <span>{ts('issuedBy')}: {s.issued_by}</span> : null}
							</div>
							{s.original_expires_at ? (
								<p className="mt-1 text-xs italic text-neutral-500">
									{s.expires_updated_by
										? ts('expiryChanged', { original: fmtDate(s.original_expires_at), who: s.expires_updated_by })
										: ts('expiryChangedNoPrev', { who: '—' })}
								</p>
							) : null}
						</div>
					))}
				</div>
			) : null}

			{past.length > 0 ? (
				<div className="mt-3 grid gap-2">
					{past.map((s) => (
						<div key={s.id} className="rounded-xl border border-neutral-800 bg-neutral-950/60 p-4 shadow-sm shadow-black/10 opacity-60">
							<div className="flex flex-wrap items-center gap-2">
								<TypeBadge type={s.type} t={ts} size="small" />
								<span className="text-xs text-neutral-500">
									{s.cancelled_at ? ts('statusCancelled') : ts('statusExpired')}
								</span>
							</div>
							{s.reason ? <p className="mt-2 text-sm text-neutral-400">{localizeReason(s.reason, ts)}</p> : null}
							<div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-neutral-500">
								<span>{fmtDate(s.created_at)}</span>
								{s.issued_by ? <span>{ts('issuedBy')}: {s.issued_by}</span> : null}
								{s.cancelled_by ? <span>{ts('cancelledBy')}: {s.cancelled_by}</span> : null}
							</div>
							{s.cancelled_reason ? (
								<p className="mt-2 text-xs italic text-neutral-500">
									{ts('cancelReason')}: {localizeReason(s.cancelled_reason, ts)}
								</p>
							) : null}
							{s.original_expires_at ? (
								<p className="mt-1 text-xs italic text-neutral-500">
									{s.expires_updated_by
										? ts('expiryChanged', { original: fmtDate(s.original_expires_at), who: s.expires_updated_by })
										: ts('expiryChangedNoPrev', { who: '—' })}
								</p>
							) : null}
						</div>
					))}
				</div>
			) : null}
		</div>
	);
}
