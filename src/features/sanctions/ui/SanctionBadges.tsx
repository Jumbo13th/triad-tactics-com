import type { SanctionType } from '../domain/types';

const TYPE_COLORS: Record<SanctionType, string> = {
	site_ban: 'bg-red-500/20 text-red-400',
	server_ban: 'bg-orange-500/20 text-orange-400',
	strike: 'bg-yellow-500/20 text-yellow-400'
};

const TYPE_LABEL_KEYS: Record<SanctionType, string> = {
	site_ban: 'typeSiteBan',
	server_ban: 'typeServerBan',
	strike: 'typeStrike'
};

export function TypeBadge({ type, t, size = 'normal' }: { type: SanctionType; t: (key: string) => string; size?: 'normal' | 'small' }) {
	const px = size === 'small' ? 'px-2 py-0.5 text-[11px]' : 'px-2.5 py-0.5 text-xs';
	return (
		<span className={'inline-flex items-center rounded-full font-semibold ' + px + ' ' + TYPE_COLORS[type]}>
			{t(TYPE_LABEL_KEYS[type])}
		</span>
	);
}
