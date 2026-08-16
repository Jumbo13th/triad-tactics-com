import { NextRequest, NextResponse } from 'next/server';
import { errorToLogObject, logger } from '@/platform/logger';
import { statsDeps } from '../../deps';
import { getStatsVisibility } from '../../useCases/statsVisibility';

// Public: the navbar asks whether the statistics entry links should render.
// Exposes a single boolean, nothing session-dependent.
export async function getStatsVisibilityRoute(_request: NextRequest): Promise<NextResponse> {
	try {
		return NextResponse.json({ success: true, hidden: getStatsVisibility(statsDeps).hidden });
	} catch (error: unknown) {
		logger.error({ ...errorToLogObject(error) }, 'stats_visibility_load_failed');
		return NextResponse.json({ error: 'server_error' }, { status: 500 });
	}
}
