import { z } from 'zod';
import { sqliteBoolean } from '@/platform/validation/zod';

export type UserAccessLevel = 'guest' | 'player' | 'admin';

const userStatusDisconnectedSchema = z.object({
	connected: z.literal(false)
});

const userStatusConnectedSchema = z.object({
	connected: z.literal(true),
	steamid64: z.string(),
	personaName: z.string().nullable(),
	currentCallsign: z.string().nullable(),
	discordId: z.string().nullable(),
	armaGuid: z.string().nullable(),
	hasExisting: sqliteBoolean,
	submittedAt: z.string().nullable(),
	renameRequired: sqliteBoolean,
	hasPendingRenameRequest: sqliteBoolean,
	renameRequiredReason: z.string().nullable(),
	renameRequiredBySteamId64: z.string().nullable(),
	renameRequiredByCallsign: z.string().nullable(),
	armaGuidRequired: sqliteBoolean,
	accessLevel: z.enum(['guest', 'player', 'admin']),
	badges: z.array(z.object({ label: z.string() })).optional(),
	siteBanned: sqliteBoolean.optional(),
	siteBanReason: z.string().nullable().optional(),
	siteBanExpiresAt: z.string().nullable().optional(),
	serverBanned: sqliteBoolean.optional()
});

export type UserStatus =
	| { connected: false }
	| {
			connected: true;
			steamid64: string;
			personaName: string | null;
			currentCallsign: string | null;
			discordId: string | null;
			armaGuid: string | null;
			hasExisting: boolean;
			submittedAt: string | null;
			renameRequired: boolean;
			hasPendingRenameRequest: boolean;
			renameRequiredReason: string | null;
			renameRequiredBySteamId64: string | null;
			renameRequiredByCallsign: string | null;
			armaGuidRequired: boolean;
			accessLevel: UserAccessLevel;
			badges?: { label: string }[];
			siteBanned?: boolean;
			siteBanReason?: string | null;
			siteBanExpiresAt?: string | null;
			serverBanned?: boolean;
	  };

export function isConfirmedByAccessLevel(accessLevel: UserAccessLevel): boolean {
	return accessLevel !== 'guest';
}

export function parseUserStatus(input: unknown): UserStatus | null {
	const connected = userStatusConnectedSchema.safeParse(input);
	if (connected.success) {
		return connected.data;
	}

	const disconnected = userStatusDisconnectedSchema.safeParse(input);
	if (disconnected.success) {
		return disconnected.data;
	}

	return null;
}
