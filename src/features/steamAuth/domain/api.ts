import { z } from 'zod';

const steamMeDisconnectedSchema = z.object({
	connected: z.literal(false)
});

const steamMeConnectedSchema = z.object({
	connected: z.literal(true),
	steamid64: z.string(),
	personaName: z.string().nullable(),
	currentCallsign: z.string().nullable(),
	hasExisting: z.boolean(),
	submittedAt: z.string().nullable(),
	renameRequired: z.boolean(),
	hasPendingRenameRequest: z.boolean(),
	renameRequiredReason: z.string().nullable(),
	renameRequiredBySteamId64: z.string().nullable(),
	renameRequiredByCallsign: z.string().nullable(),
	accessLevel: z.enum(['guest', 'player', 'admin'])
});

export type SteamMeStatus =
	| { connected: false }
	| {
			connected: true;
			steamid64: string;
			personaName: string | null;
			currentCallsign: string | null;
			hasExisting: boolean;
			submittedAt: string | null;
			renameRequired: boolean;
			hasPendingRenameRequest: boolean;
			renameRequiredReason: string | null;
			renameRequiredBySteamId64: string | null;
			renameRequiredByCallsign: string | null;
			accessLevel: 'guest' | 'player' | 'admin';
	  };

export function parseSteamMeStatus(input: unknown): SteamMeStatus | null {
	const connected = steamMeConnectedSchema.safeParse(input);
	if (connected.success) {
		return connected.data;
	}

	const disconnected = steamMeDisconnectedSchema.safeParse(input);
	if (disconnected.success) {
		return disconnected.data;
	}

	return null;
}
