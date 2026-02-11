import { NextRequest, NextResponse } from 'next/server';
import {
	DISCORD_BOT_TOKEN,
	DISCORD_CLIENT_ID,
	DISCORD_CLIENT_SECRET,
	DISCORD_CONFIRMED_ROLE_ID,
	DISCORD_GUILD_ID,
	DISCORD_REDIRECT_URI,
	DISCORD_REDIRECT_URI_LOCAL
} from '@/platform/env';
import { withApiGuards } from '@/platform/apiGates';
import { errorToLogObject, logger } from '@/platform/logger';
import { STEAM_SESSION_COOKIE } from '@/features/steamAuth/sessionCookie';
import { getSteamIdentity } from '@/features/steamAuth/useCases/getSteamIdentity';
import { steamAuthDeps } from '@/features/steamAuth/deps';
import { setDiscordIdentityByUserId } from '@/features/users/infra/sqliteUsers';
import { getRequestOrigin } from '@/features/steamAuth/adapters/next/origin';

type DiscordTokenResponse = {
	access_token?: string;
	token_type?: string;
};

type DiscordUserResponse = {
	id?: string;
	username?: string;
};

function getDiscordRedirectUri(): string | null {
	const isDev = process.env.NODE_ENV !== 'production';
	return isDev ? (DISCORD_REDIRECT_URI_LOCAL ?? null) : (DISCORD_REDIRECT_URI ?? null);
}

async function getDiscordCallbackRoute(request: NextRequest): Promise<NextResponse> {
	try {
		const code = request.nextUrl.searchParams.get('code');
		if (!code) {
			return NextResponse.redirect(new URL('/', getRequestOrigin(request)));
		}

		const sid = request.cookies.get(STEAM_SESSION_COOKIE)?.value ?? null;
		const identity = getSteamIdentity(steamAuthDeps, sid);
		if (!identity.connected) {
			return NextResponse.redirect(new URL('/', getRequestOrigin(request)));
		}

		const user = steamAuthDeps.users.getUserBySteamId64(identity.steamid64);
		if (!user?.id || !user.player_confirmed_at) {
			return NextResponse.redirect(new URL('/', getRequestOrigin(request)));
		}

		const redirectUri = getDiscordRedirectUri();
		if (
			!DISCORD_CLIENT_ID ||
			!DISCORD_CLIENT_SECRET ||
			!DISCORD_BOT_TOKEN ||
			!DISCORD_GUILD_ID ||
			!DISCORD_CONFIRMED_ROLE_ID ||
			!redirectUri
		) {
			logger.warn('discord_env_missing');
			return NextResponse.redirect(new URL('/', getRequestOrigin(request)));
		}

		const tokenRes = await fetch('https://discord.com/api/oauth2/token', {
			method: 'POST',
			headers: {
				'Content-Type': 'application/x-www-form-urlencoded'
			},
			body: new URLSearchParams({
				client_id: DISCORD_CLIENT_ID,
				client_secret: DISCORD_CLIENT_SECRET,
				grant_type: 'authorization_code',
				code,
				redirect_uri: redirectUri
			})
		});

		if (!tokenRes.ok) {
			logger.warn({ status: tokenRes.status }, 'discord_token_exchange_failed');
			return NextResponse.redirect(new URL('/', getRequestOrigin(request)));
		}

		const tokenJson = (await tokenRes.json()) as DiscordTokenResponse;
		const accessToken = tokenJson.access_token;
		if (!accessToken) {
			logger.warn('discord_access_token_missing');
			return NextResponse.redirect(new URL('/', getRequestOrigin(request)));
		}

		const meRes = await fetch('https://discord.com/api/users/@me', {
			headers: {
				Authorization: `Bearer ${accessToken}`
			}
		});

		if (!meRes.ok) {
			logger.warn({ status: meRes.status }, 'discord_user_fetch_failed');
			return NextResponse.redirect(new URL('/', getRequestOrigin(request)));
		}

		const meJson = (await meRes.json()) as DiscordUserResponse;
		const discordId = meJson.id;
		if (!discordId) {
			logger.warn('discord_user_id_missing');
			return NextResponse.redirect(new URL('/', getRequestOrigin(request)));
		}

		const update = setDiscordIdentityByUserId({
			userId: user.id,
			discordId,
			discordToken: accessToken
		});
		if (!update.success) {
			logger.warn('discord_user_update_failed');
		}

		const guildRes = await fetch(
			`https://discord.com/api/guilds/${DISCORD_GUILD_ID}/members/${discordId}`,
			{
				method: 'PUT',
				headers: {
					Authorization: `Bot ${DISCORD_BOT_TOKEN}`,
					'Content-Type': 'application/json'
				},
				body: JSON.stringify({ access_token: accessToken })
			}
		);

		if (!guildRes.ok) {
			logger.warn({ status: guildRes.status }, 'discord_guild_join_failed');
		}

		const roleRes = await fetch(
			`https://discord.com/api/guilds/${DISCORD_GUILD_ID}/members/${discordId}/roles/${DISCORD_CONFIRMED_ROLE_ID}`,
			{
				method: 'PUT',
				headers: {
					Authorization: `Bot ${DISCORD_BOT_TOKEN}`
				}
			}
		);
		if (!roleRes.ok) {
			logger.warn({ status: roleRes.status }, 'discord_role_assign_failed');
		}

		return NextResponse.redirect(new URL('/', getRequestOrigin(request)));
	} catch (error: unknown) {
		logger.warn({ ...errorToLogObject(error) }, 'discord_callback_route_failed');
		return NextResponse.redirect(new URL('/', getRequestOrigin(request)));
	}
}

export const runtime = 'nodejs';

export const GET = withApiGuards(getDiscordCallbackRoute, { name: 'api.auth.discord.callback' });
