import { NextRequest, NextResponse } from 'next/server';
import { STEAM_SESSION_COOKIE } from '@/features/steamAuth/sessionCookie';
import { steamAuthDeps } from '@/features/steamAuth/deps';
import { getUserStatus } from "@/features/users/useCases/getUserStatus";

export async function getSteamMeRoute(request: NextRequest): Promise<NextResponse> {
	const sid = request.cookies.get(STEAM_SESSION_COOKIE)?.value ?? null;
	const status = getUserStatus(steamAuthDeps, sid);
	return NextResponse.json(status);
}
