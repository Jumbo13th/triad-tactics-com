import type { ReactNode } from 'react';
import { SteamSignInButton } from '@/features/steamAuth/ui/root';
import type { AdminStatus } from './types';

type TFn = (key: string, values?: Record<string, string | number | Date>) => string;

export function AdminGate({
	status,
	redirectPath,
	t,
	children
}: {
	status: AdminStatus | null;
	redirectPath: string;
	t: TFn;
	children: ReactNode;
}) {
	if (status === null) {
		return <p className="text-sm text-neutral-300">{t('loading')}</p>;
	}

	if (!status.connected) {
		return (
			<div className="grid gap-4">
				<div>
					<h2 className="text-xl font-semibold tracking-tight text-neutral-50 sm:text-2xl">
						{t('loginTitle')}
					</h2>
					<p className="mt-2 text-sm text-neutral-300">{t('loginText')}</p>
				</div>
				<SteamSignInButton
					redirectPath={redirectPath}
					ariaLabel={t('signInSteam')}
					size="large"
					className="inline-flex w-fit items-center justify-center rounded-lg focus:outline-none focus:ring-2 focus:ring-[color:var(--accent)] focus:ring-offset-2 focus:ring-offset-neutral-950"
					imageClassName="h-11 w-auto"
				/>
			</div>
		);
	}

	if (!status.isAdmin) {
		return (
			<div className="grid gap-2">
				<h2 className="text-xl font-semibold tracking-tight text-neutral-50 sm:text-2xl">
					{t('forbiddenTitle')}
				</h2>
				<p className="text-sm text-neutral-300">{t('forbiddenText')}</p>
			</div>
		);
	}

	return <>{children}</>;
}
