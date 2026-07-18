import type { StatsDeps } from './ports';
import * as repo from './infra/sqliteStats';

function readBalanceAlpha(): number {
	const raw = Number(process.env.STATS_BALANCE_EXPONENT);
	if (Number.isFinite(raw) && raw >= 0 && raw <= 1) return raw;
	return 0.5;
}

export const statsDeps: StatsDeps = {
	repo,
	balanceAlpha: readBalanceAlpha(),
};
