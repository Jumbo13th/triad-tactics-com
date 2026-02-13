import { NextResponse } from 'next/server';
import { DISCORD_CLIENT_ID, DISCORD_REDIRECT_URI, DISCORD_REDIRECT_URI_LOCAL } from '@/platform/env';
import { withApiGuards } from '@/platform/apiGates';

function getDiscordRedirectUri(): string | null {
	const isDev = process.env.NODE_ENV !== 'production';
	return isDev ? (DISCORD_REDIRECT_URI_LOCAL ?? null) : (DISCORD_REDIRECT_URI ?? null);
}

async function getDiscordStartRoute(): Promise<NextResponse> {
	const redirectUri = getDiscordRedirectUri();
	if (!DISCORD_CLIENT_ID || !redirectUri) {
		return NextResponse.json({ error: 'server_error' }, { status: 500 });
	}

	const params = new URLSearchParams({
		client_id: DISCORD_CLIENT_ID,
		redirect_uri: redirectUri,
		response_type: 'code',
		scope: 'identify guilds.join'
	});

	return NextResponse.redirect(`https://discord.com/oauth2/authorize?${params.toString()}`);
}

export const runtime = 'nodejs';

export const GET = withApiGuards(getDiscordStartRoute, { name: 'api.auth.discord.start' });
