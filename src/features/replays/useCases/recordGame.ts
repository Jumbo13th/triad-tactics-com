import type { GamePost, ReplayFileKind } from '../domain/protocol';
import type { ReceiverDeps } from '../ports';

export type RecordGameResult =
	| { result: 'created'; gameId: number }
	/** `withdrawn`: the game was published and its recording changed, so it went back to review. */
	| { result: 'replaced'; gameId: number; withdrawn: boolean }
	| { result: 'missing'; missing: string[] }
	| { result: 'wrong_kind'; sha256: string };

/** The latest post of a game replaces its file set: a host posts again whenever it changes. */
export function recordGame(deps: Pick<ReceiverDeps, 'repo'>, input: { serverId: string; post: GamePost }): RecordGameResult {
	const { post } = input;
	const named: { sha256: string; kind: ReplayFileKind }[] = [
		...post.segments.map((sha256) => ({ sha256, kind: 'segment' as const })),
		...(post.identity ? [{ sha256: post.identity, kind: 'identity' as const }] : []),
		...(post.stats ? [{ sha256: post.stats, kind: 'stats' as const }] : []),
	];

	const files = new Map(deps.repo.findFiles([...new Set(named.map((n) => n.sha256))]).map((f) => [f.sha256, f]));

	const missing = [...new Set(named.filter((n) => !files.has(n.sha256)).map((n) => n.sha256))];
	if (missing.length > 0) return { result: 'missing', missing };

	const misnamed = named.find((n) => files.get(n.sha256)?.kind !== n.kind);
	if (misnamed) return { result: 'wrong_kind', sha256: misnamed.sha256 };

	const before = deps.repo.findGameBySession(input.serverId, post.session);
	const { id, created } = deps.repo.saveGame({
		serverId: input.serverId,
		session: post.session,
		over: post.over,
		segments: post.segments,
		identity: post.identity,
		stats: post.stats,
	});
	if (created || !before) return { result: 'created', gameId: id };

	// Viewers may only see what an admin approved. Statistics are published on their own, so
	// only a changed recording or player list withdraws the game.
	const changed = before.identity !== post.identity || before.segments.join() !== post.segments.join();
	const withdrawn = before.publishedAt !== null && changed;
	if (withdrawn) deps.repo.setPublished(id, null);
	return { result: 'replaced', gameId: id, withdrawn };
}
