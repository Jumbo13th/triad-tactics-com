'use client';

import { useEffect, useMemo, useState } from 'react';
import { useTranslations } from 'next-intl';
import { usePathname } from '@/i18n/routing';
import { useParams } from 'next/navigation';
import { parseAdminStatusResponse, type AdminStatus } from '@/features/admin/domain/api';
import { AdminButton, AdminGate, AdminNav, AdminSurface, AdminToolbar } from './root';

function buildLocalizedPath(locale: string, pathname: string) {
	const suffix = pathname === '/' ? '' : pathname;
	return `/${locale}${suffix}`;
}

export default function AdminMailingPage() {
	const ta = useTranslations('admin');
	const pathname = usePathname();
	const params = useParams();
	const locale = (params.locale as string) || 'en';

	const redirectPath = useMemo(() => buildLocalizedPath(locale, pathname), [locale, pathname]);

	const [status, setStatus] = useState<AdminStatus | null>(null);
	const [outboxStatus, setOutboxStatus] = useState<'idle' | 'running' | 'success' | 'error'>('idle');
	const [outboxMessage, setOutboxMessage] = useState<string | null>(null);

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
		return () => {
			cancelled = true;
		};
	}, []);

	const handleRunOutbox = async () => {
		try {
			setOutboxStatus('running');
			setOutboxMessage(null);
			const res = await fetch('/api/admin/outbox', { method: 'POST' });
			if (!res.ok) throw new Error('outbox_failed');
			setOutboxStatus('success');
			setOutboxMessage(ta('outboxRunSuccess'));
		} catch {
			setOutboxStatus('error');
			setOutboxMessage(ta('outboxRunError'));
		}
	};

	return (
		<AdminSurface>
			<AdminGate status={status} redirectPath={redirectPath} t={ta}>
				<div className="grid gap-4">
					<AdminNav />
					<AdminToolbar
						title={ta('mailingTitle')}
						actions={
							<AdminButton
								variant="secondary"
								className="h-9 whitespace-nowrap"
								onClick={(e) => {
									e.preventDefault();
									void handleRunOutbox();
								}}
								disabled={outboxStatus === 'running'}
							>
								{outboxStatus === 'running' ? ta('outboxRunning') : ta('outboxRun')}
							</AdminButton>
						}
					/>
					{outboxMessage ? <p className="text-sm text-neutral-300">{outboxMessage}</p> : null}
				</div>
			</AdminGate>
		</AdminSurface>
	);
}
