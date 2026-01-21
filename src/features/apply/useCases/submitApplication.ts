import { applicationSchema, type ApplicationFormData } from '../schema';
import type { SubmitApplicationDeps } from '../ports';

const ARMA_REFORGER_APPID = 1874880;

const SUPPORTED_LOCALES = new Set(['en', 'ru', 'uk', 'ar']);

function normalizeLocale(value: unknown): string {
  if (typeof value === 'string') {
    const lc = value.trim().toLowerCase();
    if (SUPPORTED_LOCALES.has(lc)) return lc;
  }
  return 'en';
}

export type SubmitApplicationInput = {
  body: unknown;
  steam: { steamid64: string | null; personaName: string | null };
  ipAddress: string;
  localeHint?: unknown;
  steamWebApiKey: string | undefined;
  bypassRateLimit: boolean;
  rateLimitDecision: { allowed: boolean; retryAfterSeconds: number };
  markRateLimited: () => void;
};

export type SubmitApplicationResult =
  | { ok: true; status: 201; json: { success: true; id: number } }
  | { ok: false; status: 400; json: { error: 'validation_error'; details: unknown } }
  | { ok: false; status: 400; json: { error: 'steam_not_connected' } }
  | { ok: false; status: 400; json: { error: 'steam_game_not_detected' | 'steam_api_unavailable' } }
  | { ok: false; status: 429; json: { error: 'rate_limited'; retryAfterSeconds: number } }
  | { ok: false; status: 409; json: { error: 'duplicate'; submittedAt: string | null } }
  | { ok: false; status: 500; json: { error: 'server_error' | 'steam_api_unavailable' } }
  | { ok: false; status: 503; json: { error: 'steam_api_unavailable' } };

export async function submitApplication(
  deps: SubmitApplicationDeps,
  input: SubmitApplicationInput
): Promise<SubmitApplicationResult> {
  const validation = applicationSchema.safeParse(input.body);
  if (!validation.success) {
    return {
      ok: false,
      status: 400,
      json: { error: 'validation_error', details: validation.error.issues }
    };
  }

  const data: ApplicationFormData = validation.data;

  const steamid64 = input.steam?.steamid64 ?? null;
  const personaName = input.steam?.personaName ?? null;

  if (!steamid64) {
    return { ok: false, status: 400, json: { error: 'steam_not_connected' } };
  }

	// Ensure the user exists in our DB as soon as they interact with the system.
  const ensuredUser = deps.users.upsertUser({ steamid64 });
  const userId = ensuredUser.success ? ensuredUser.userId : null;

  if (!input.bypassRateLimit) {
    if (!input.rateLimitDecision.allowed) {
      return {
        ok: false,
        status: 429,
        json: { error: 'rate_limited', retryAfterSeconds: input.rateLimitDecision.retryAfterSeconds }
      };
    }
  }

  const steamApiKey = input.steamWebApiKey;
  if (!steamApiKey) {
    return { ok: false, status: 500, json: { error: 'steam_api_unavailable' } };
  }

  const locale = normalizeLocale(input.localeHint);

  const verification = await deps.steam.verifySteamOwnsGameOrReject(
    steamApiKey,
    steamid64,
    ARMA_REFORGER_APPID
  );

  if (!verification.ok) {
    if (verification.error === 'steam_api_unavailable') {
      return { ok: false, status: 503, json: { error: 'steam_api_unavailable' } };
    }
    return { ok: false, status: 400, json: { error: 'steam_game_not_detected' } };
  }

  const { email, ...answersRaw } = data;
  const answers = {
    ...answersRaw,
    verified_game_access: true
  };

  const result = deps.repo.insertApplication({
    email,
    steamid64,
    persona_name: personaName,
    answers,
    ip_address: input.ipAddress,
    locale
  });

  if (!result.success) {
    if (result.error === 'duplicate') {
      const existing =
        userId != null
          ? deps.repo.getByUserId(userId)
          : deps.repo.getBySteamId64(steamid64);
      return {
        ok: false,
        status: 409,
        json: { error: 'duplicate', submittedAt: existing?.created_at ?? null }
      };
    }

    return { ok: false, status: 500, json: { error: 'server_error' } };
  }

  if (!input.bypassRateLimit) {
    input.markRateLimited();
  }

  const insertedIdRaw: unknown = result.id;
  const insertedId =
    typeof insertedIdRaw === 'bigint'
      ? Number(insertedIdRaw)
      : typeof insertedIdRaw === 'number'
        ? insertedIdRaw
        : null;

  if (insertedId == null || !Number.isSafeInteger(insertedId)) {
    return { ok: false, status: 500, json: { error: 'server_error' } };
  }

  return { ok: true, status: 201, json: { success: true, id: insertedId } };
}
