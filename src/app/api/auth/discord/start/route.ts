import { NextRequest, NextResponse } from 'next/server';
import { DISCORD_CLIENT_ID } from '@/platform/env';
import { withApiGuards } from '@/platform/apiGates';

const DISCORD_REDIRECT_URI = 'https://triad-tactics.com/api/auth/discord';
const DISCORD_REDIRECT_URI_LOCAL = "http://localhost:3000/api/auth/discord";

async function getDiscordStartRoute(_request: NextRequest): Promise<NextResponse> {
	if (!DISCORD_CLIENT_ID) {
		return NextResponse.json({ error: 'server_error' }, { status: 500 });
	}

	const params = new URLSearchParams({
		client_id: DISCORD_CLIENT_ID,
		redirect_uri: DISCORD_REDIRECT_URI_LOCAL,
		response_type: 'code',
		scope: 'identify guilds.join'
	});

	return NextResponse.redirect(`https://discord.com/oauth2/authorize?${params.toString()}`);
}

export const runtime = 'nodejs';

export const GET = withApiGuards(getDiscordStartRoute, { name: 'api.auth.discord.start' });
