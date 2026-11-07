'use client';

import { useEffect, useMemo, useState, useSyncExternalStore } from 'react';
import { useTranslations } from 'next-intl';
import { usePathname } from '@/i18n/routing';
import { useParams } from 'next/navigation';
import { parseAdminStatusResponse, type AdminStatus } from '@/features/admin/domain/api';
import { AdminButton, AdminGate, AdminSurface, AdminToolbar } from '@/features/admin/ui/root';
import { parseMcpTokenCreatedResponse, parseMcpTokensResponse, type McpTokensResponse } from '@/features/adminMcp/domain/api';
import { MCP_TOKEN_EXPIRY_DAYS, type McpTokenExpiryDays, type McpTokenSummary } from '@/features/adminMcp/domain/types';
import { formatLocalizedDateTime } from '@/platform/dateTime';
import { useViewerDateTimePreferences } from '@/platform/useViewerDateTimePreferences';

const INPUT_CLASS =
	'block w-full rounded-lg border border-neutral-700 bg-neutral-950 px-3 py-2 text-neutral-50 placeholder-neutral-500 shadow-sm focus:border-[color:var(--accent)] focus:outline-none focus:ring-2 focus:ring-[color:var(--accent)]/20';

function buildLocalizedPath(locale: string, pathname: string) {
	const suffix = pathname === '/' ? '' : pathname;
	return `/${locale}${suffix}`;
}

const subscribeNever = () => () => {};
const readOrigin = () => window.location.origin;
const readServerOrigin = () => '';

function CopyableCode({ value, copyLabel, copiedLabel }: { value: string; copyLabel: string; copiedLabel: string }) {
	const [copied, setCopied] = useState(false);
	return (
		<div className="flex flex-wrap items-start gap-2">
			<code className="min-w-0 flex-1 break-all rounded-lg border border-neutral-800 bg-neutral-950 px-3 py-2 font-mono text-xs text-neutral-100">
				{value}
			</code>
			<AdminButton
				variant="secondary"
				onClick={() => {
					void navigator.clipboard?.writeText(value).then(() => setCopied(true));
				}}
			>
				{copied ? copiedLabel : copyLabel}
			</AdminButton>
		</div>
	);
}

async function fetchTokens(): Promise<McpTokensResponse | null> {
	try {
		const res = await fetch('/api/admin/mcp-tokens', { cache: 'no-store' });
		const parsed = parseMcpTokensResponse((await res.json()) as unknown);
		return res.ok ? parsed : null;
	} catch {
		return null;
	}
}

export default function AdminMcpPage() {
	const ta = useTranslations('admin');
	const pathname = usePathname();
	const params = useParams();
	const locale = (params.locale as string) || 'en';
	const redirectPath = useMemo(() => buildLocalizedPath(locale, pathname), [locale, pathname]);
	const { timeZone, hourCycle } = useViewerDateTimePreferences();

	const [status, setStatus] = useState<AdminStatus | null>(null);
	const [data, setData] = useState<McpTokensResponse | null>(null);
	const [listState, setListState] = useState<'loading' | 'ready' | 'error'>('loading');
	const [labelInput, setLabelInput] = useState('');
	const [expiryInput, setExpiryInput] = useState<McpTokenExpiryDays>(90);
	const [creating, setCreating] = useState(false);
	const [revokingId, setRevokingId] = useState<number | null>(null);
	const [newToken, setNewToken] = useState<string | null>(null);
	const [feedback, setFeedback] = useState<{ tone: 'success' | 'error'; message: string } | null>(null);
	const origin = useSyncExternalStore(subscribeNever, readOrigin, readServerOrigin);

	useEffect(() => {
		let cancelled = false;
		(async () => {
			try {
				const res = await fetch('/api/admin/status', { cache: 'no-store' });
				const json: unknown = (await res.json()) as unknown;
				const parsed = parseAdminStatusResponse(json);
				if (!cancelled) setStatus(parsed ?? { connected: false, isAdmin: false });
			} catch {
				if (!cancelled) setStatus({ connected: false, isAdmin: false });
			}
		})();
		return () => {
			cancelled = true;
		};
	}, []);

	const applyTokens = (parsed: McpTokensResponse | null) => {
		if (!parsed) {
			setListState('error');
			return;
		}
		setData(parsed);
		setListState('ready');
	};

	const loadTokens = async () => applyTokens(await fetchTokens());

	useEffect(() => {
		if (!status?.connected || !status.isAdmin) return;
		let cancelled = false;
		(async () => {
			const parsed = await fetchTokens();
			if (!cancelled) applyTokens(parsed);
		})();
		return () => {
			cancelled = true;
		};
	}, [status]);

	const handleCreate = async () => {
		try {
			setFeedback(null);
			setNewToken(null);
			setCreating(true);
			const res = await fetch('/api/admin/mcp-tokens', {
				method: 'POST',
				headers: { 'content-type': 'application/json' },
				body: JSON.stringify({ label: labelInput, expiresInDays: expiryInput })
			});
			const json: unknown = (await res.json()) as unknown;
			const parsed = parseMcpTokenCreatedResponse(json);
			if (!res.ok || !parsed) {
				const tooMany = (json as { error?: unknown } | null)?.error === 'too_many_tokens';
				setFeedback({ tone: 'error', message: tooMany ? ta('mcpCreateLimit', { count: data?.maxActivePerAdmin ?? 0 }) : ta('mcpCreateError') });
				return;
			}
			setLabelInput('');
			setNewToken(parsed.token);
			await loadTokens();
		} catch {
			setFeedback({ tone: 'error', message: ta('mcpCreateError') });
		} finally {
			setCreating(false);
		}
	};

	const handleRevoke = async (token: McpTokenSummary) => {
		if (!window.confirm(ta('mcpRevokeConfirm', { label: token.label }))) return;
		try {
			setFeedback(null);
			setRevokingId(token.id);
			const res = await fetch(`/api/admin/mcp-tokens/${token.id}/revoke`, { method: 'POST' });
			if (!res.ok) {
				setFeedback({ tone: 'error', message: ta('mcpRevokeError') });
				return;
			}
			setFeedback({ tone: 'success', message: ta('mcpRevokeSuccess') });
			await loadTokens();
		} catch {
			setFeedback({ tone: 'error', message: ta('mcpRevokeError') });
		} finally {
			setRevokingId(null);
		}
	};

	const endpoint = `${origin}/api/mcp`;
	const command = `claude mcp add --transport http triad-admin ${endpoint} --header "Authorization: Bearer ${newToken ?? '<token>'}"`;
	const formatTime = (value: string | null) =>
		formatLocalizedDateTime(value, { locale, timeZone, hourCycle, dateStyle: 'medium', timeStyle: 'short' }) ?? value ?? '';

	return (
		<AdminSurface>
			<AdminGate status={status} redirectPath={redirectPath} t={ta}>
				<div className="grid gap-6">
					<AdminToolbar title={ta('mcpTitle')} />
					<p className="text-sm text-neutral-300">{ta('mcpSubtitle')}</p>

					<div className="rounded-2xl border border-amber-500/30 bg-amber-500/10 px-4 py-3">
						<p className="text-xs font-semibold uppercase tracking-[0.2em] text-amber-200">{ta('mcpWarningTitle')}</p>
						<p className="mt-2 text-sm leading-relaxed text-amber-100/90">{ta('mcpWarningBody')}</p>
					</div>

					{feedback ? (
						<p className={feedback.tone === 'success' ? 'text-sm text-emerald-300' : 'text-sm text-red-300'}>{feedback.message}</p>
					) : null}

					<section className="grid gap-4 rounded-2xl border border-neutral-800 bg-neutral-950/40 p-4 shadow-sm shadow-black/20">
						<div>
							<h2 className="text-lg font-semibold tracking-tight text-neutral-50">{ta('mcpCreateTitle')}</h2>
							<p className="mt-1 text-sm text-neutral-400">{ta('mcpCreateText')}</p>
						</div>
						<div className="grid gap-4 md:grid-cols-[minmax(0,1fr)_auto_auto] md:items-end">
							<label className="grid gap-2 text-sm text-neutral-200">
								<span>{ta('mcpFieldLabel')}</span>
								<input
									value={labelInput}
									maxLength={80}
									onChange={(event) => setLabelInput(event.target.value)}
									placeholder={ta('mcpFieldLabelPlaceholder')}
									className={INPUT_CLASS}
								/>
							</label>
							<label className="grid gap-2 text-sm text-neutral-200">
								<span>{ta('mcpFieldExpiry')}</span>
								<select
									value={expiryInput}
									onChange={(event) => setExpiryInput(Number(event.target.value) as McpTokenExpiryDays)}
									className={INPUT_CLASS}
								>
									{MCP_TOKEN_EXPIRY_DAYS.map((days) => (
										<option key={days} value={days}>
											{ta('mcpExpiryDays', { count: days })}
										</option>
									))}
								</select>
							</label>
							<AdminButton
								variant="primary"
								onClick={() => void handleCreate()}
								disabled={creating || labelInput.trim().length === 0}
							>
								{creating ? ta('mcpCreating') : ta('mcpCreateAction')}
							</AdminButton>
						</div>

						{newToken ? (
							<div className="grid gap-3 rounded-xl border border-emerald-500/30 bg-emerald-500/10 p-3">
								<p className="text-sm font-semibold text-emerald-200">{ta('mcpNewTokenTitle')}</p>
								<p className="text-sm text-emerald-100/90">{ta('mcpNewTokenText')}</p>
								<CopyableCode value={newToken} copyLabel={ta('mcpCopy')} copiedLabel={ta('mcpCopied')} />
							</div>
						) : null}
					</section>

					<section className="grid gap-4 rounded-2xl border border-neutral-800 bg-neutral-950/40 p-4 shadow-sm shadow-black/20">
						<div>
							<h2 className="text-lg font-semibold tracking-tight text-neutral-50">{ta('mcpConnectTitle')}</h2>
							<p className="mt-1 text-sm text-neutral-400">{ta('mcpConnectText')}</p>
						</div>
						<div className="grid gap-2">
							<p className="text-xs font-semibold tracking-wide text-neutral-400">{ta('mcpEndpointLabel')}</p>
							<CopyableCode value={endpoint} copyLabel={ta('mcpCopy')} copiedLabel={ta('mcpCopied')} />
						</div>
						<div className="grid gap-2">
							<p className="text-xs font-semibold tracking-wide text-neutral-400">{ta('mcpCommandLabel')}</p>
							<CopyableCode value={command} copyLabel={ta('mcpCopy')} copiedLabel={ta('mcpCopied')} />
						</div>
					</section>

					<section className="grid gap-4 rounded-2xl border border-neutral-800 bg-neutral-950/40 p-4 shadow-sm shadow-black/20">
						<h2 className="text-lg font-semibold tracking-tight text-neutral-50">{ta('mcpTokensTitle')}</h2>
						{listState === 'loading' && !data ? (
							<p className="text-sm text-neutral-300">{ta('loading')}</p>
						) : listState === 'error' ? (
							<p className="text-sm text-red-300">{ta('mcpLoadError')}</p>
						) : !data || data.tokens.length === 0 ? (
							<p className="text-sm text-neutral-300">{ta('mcpTokensEmpty')}</p>
						) : (
							<div className="grid gap-3">
								{data.tokens.map((token) => {
									const state = token.state;
									const owner =
										token.steamid64 === data.viewerSteamid64 ? ta('mcpOwnerYou') : (token.ownerCallsign ?? token.steamid64);
									return (
										<div key={token.id} className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-neutral-800 bg-neutral-950/60 p-4">
											<div className="grid gap-1">
												<div className="flex flex-wrap items-center gap-2">
													<p className="text-base font-semibold text-neutral-50">{token.label}</p>
													<code className="font-mono text-xs text-neutral-400">{token.hint}…</code>
													<span
														className={
															'inline-flex items-center rounded-full border px-2.5 py-1 text-[11px] font-semibold uppercase tracking-[0.2em] ' +
															(state === 'active'
																? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-300'
																: 'border-neutral-800 bg-white/5 text-neutral-400')
														}
													>
														{state === 'active' ? ta('mcpStatusActive') : state === 'expired' ? ta('mcpStatusExpired') : ta('mcpStatusRevoked')}
													</span>
												</div>
												<div className="flex flex-wrap gap-x-4 gap-y-1 text-sm text-neutral-400">
													<span>{owner}</span>
													<span>{ta('mcpCreated', { date: formatTime(token.createdAt) })}</span>
													<span>{ta('mcpExpires', { date: formatTime(token.expiresAt) })}</span>
													<span>{token.lastUsedAt ? ta('mcpLastUsed', { date: formatTime(token.lastUsedAt) }) : ta('mcpNeverUsed')}</span>
												</div>
											</div>
											{state === 'active' ? (
												<AdminButton variant="secondary" onClick={() => void handleRevoke(token)} disabled={revokingId === token.id}>
													{revokingId === token.id ? ta('mcpRevoking') : ta('mcpRevokeAction')}
												</AdminButton>
											) : null}
										</div>
									);
								})}
							</div>
						)}
					</section>
				</div>
			</AdminGate>
		</AdminSurface>
	);
}
