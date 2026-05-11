'use client';

import { useEffect, useMemo, useState } from 'react';
import { useTranslations } from 'next-intl';
import { usePathname } from '@/i18n/routing';
import { useParams } from 'next/navigation';
import { parseAdminStatusResponse, type AdminStatus } from '@/features/admin/domain/api';
import { AdminButton, AdminGate, AdminSurface, AdminToolbar } from './root';

function buildLocalizedPath(locale: string, pathname: string) {
	const suffix = pathname === '/' ? '' : pathname;
	return `/${locale}${suffix}`;
}

export default function AdminMaintenancePage() {
	const ta = useTranslations('admin');
	const pathname = usePathname();
	const params = useParams();
	const locale = (params.locale as string) || 'en';
	const redirectPath = useMemo(() => buildLocalizedPath(locale, pathname), [locale, pathname]);

	const [status, setStatus] = useState<AdminStatus | null>(null);
	const [cronStatus, setCronStatus] = useState<'idle' | 'running' | 'success' | 'error'>('idle');
	const [cronMessage, setCronMessage] = useState<string | null>(null);

	useEffect(() => {
		let cancelled = false;
		(async () => {
			try {
				const res = await fetch('/api/admin/status', { cache: 'no-store' });
				const json: unknown = (await res.json()) as unknown;
				const parsed = parseAdminStatusResponse(json);
				if (!cancelled) setStatus(parsed ?? { connected: false, isAdmin: false });
			} catch {
				if (!cancelled) setStatus({ connected: false, isAdmin: false });
			}
		})();
		return () => { cancelled = true; };
	}, []);

	const handleRunCron = async () => {
		try {
			setCronStatus('running');
			setCronMessage(null);
			const res = await fetch('/api/admin/cron', { method: 'POST' });
			if (!res.ok) throw new Error('cron_failed');
			setCronStatus('success');
			setCronMessage(ta('maintenanceCronSuccess'));
		} catch {
			setCronStatus('error');
			setCronMessage(ta('maintenanceCronError'));
		}
	};

	return (
		<AdminSurface>
			<AdminGate status={status} redirectPath={redirectPath} t={ta}>
				<div className="grid gap-6">
					<AdminToolbar title={ta('maintenanceTitle')} />

					<div className="rounded-2xl border border-amber-500/30 bg-amber-500/10 px-4 py-3">
						<p className="text-xs font-semibold uppercase tracking-[0.2em] text-amber-200">{ta('maintenanceDevWarningTitle')}</p>
						<p className="mt-2 text-sm leading-relaxed text-amber-100/90">
							{ta('maintenanceDevWarningBody')}
						</p>
					</div>

					<div className="rounded-2xl border border-neutral-800 bg-neutral-950 p-4 shadow-sm shadow-black/20">
						<div className="flex flex-wrap items-center justify-between gap-3">
							<div>
								<p className="text-sm font-semibold text-neutral-100">{ta('maintenanceCronTitle')}</p>
								<p className="text-xs text-neutral-400">{ta('maintenanceCronDescription')}</p>
							</div>
							<AdminButton
								variant="secondary"
								className="h-9 whitespace-nowrap"
								onClick={(e) => {
									e.preventDefault();
									void handleRunCron();
								}}
								disabled={cronStatus === 'running'}
							>
								{cronStatus === 'running' ? ta('maintenanceCronRunning') : ta('maintenanceCronButton')}
							</AdminButton>
						</div>
						{cronMessage ? <p className={`mt-3 text-sm ${cronStatus === 'error' ? 'text-red-300' : 'text-neutral-300'}`}>{cronMessage}</p> : null}
					</div>
				</div>
			</AdminGate>
		</AdminSurface>
	);
}
