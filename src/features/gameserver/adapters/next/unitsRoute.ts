import { NextRequest, NextResponse } from 'next/server';
import { getGameserverUnits } from '../../useCases/getGameserverUnits';
import { getGameserverUnitsDeps } from '../../deps';
import { logger, errorToLogObject } from '@/platform/logger';
import { isGameserverAuthorized } from './gameserverAuth';

export async function getGameserverUnitsRoute(request: NextRequest): Promise<NextResponse> {
	try {
		if (!isGameserverAuthorized(request)) {
			return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
		}

		return NextResponse.json(getGameserverUnits(getGameserverUnitsDeps));
	} catch (error: unknown) {
		logger.error({ ...errorToLogObject(error) }, 'gameserver_units_lookup_failed');
		return NextResponse.json({ error: 'server_error' }, { status: 500 });
	}
}
