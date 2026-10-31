import { randomUUID } from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';

const PIECE_FILE = /^(\d+)\.part$/;
const FILE_DIR = /^[0-9a-f]{64}$/;

// Beside the database, on its volume: a deploy replaces the container, and pieces kept
// inside it would make every host resend the files it was in the middle of.
function piecesRoot(): string {
	const configured = process.env.REPLAY_PIECES_DIR?.trim();
	if (configured) return configured;
	const dbPath = process.env.DB_PATH?.trim();
	const dataDir = dbPath && dbPath !== ':memory:' ? path.dirname(dbPath) : path.join(process.cwd(), 'database');
	return path.join(dataDir, 'replay-pieces');
}

function fileDir(sha256: string): string {
	return path.join(piecesRoot(), sha256);
}

function piecePath(sha256: string, index: number): string {
	return path.join(fileDir(sha256), `${index}.part`);
}

function isMissing(error: unknown): boolean {
	return (error as NodeJS.ErrnoException | null)?.code === 'ENOENT';
}

export async function held(sha256: string): Promise<number[]> {
	try {
		const names = await fs.readdir(fileDir(sha256));
		return names
			.map((name) => PIECE_FILE.exec(name))
			.filter((match): match is RegExpExecArray => match !== null)
			.map((match) => Number(match[1]))
			.sort((a, b) => a - b);
	} catch (error: unknown) {
		if (isMissing(error)) return [];
		throw error;
	}
}

export async function read(sha256: string, index: number): Promise<Buffer | null> {
	try {
		return await fs.readFile(piecePath(sha256, index));
	} catch (error: unknown) {
		if (isMissing(error)) return null;
		throw error;
	}
}

// Written under a temporary name and renamed, so a piece is either whole or absent.
export async function write(sha256: string, index: number, bytes: Buffer): Promise<void> {
	await fs.mkdir(fileDir(sha256), { recursive: true });
	const target = piecePath(sha256, index);
	const temporary = `${target}.${randomUUID()}.tmp`;
	await fs.writeFile(temporary, bytes);
	await fs.rename(temporary, target);
}

export async function discard(sha256: string): Promise<void> {
	await fs.rm(fileDir(sha256), { recursive: true, force: true });
}

// A file's folder changes with every piece written into it.
export async function discardUntouchedSince(cutoff: Date): Promise<void> {
	let names: string[];
	try {
		names = await fs.readdir(piecesRoot());
	} catch (error: unknown) {
		if (isMissing(error)) return;
		throw error;
	}
	for (const name of names) {
		if (!FILE_DIR.test(name)) continue;
		const dir = path.join(piecesRoot(), name);
		try {
			const info = await fs.stat(dir);
			if (info.mtime < cutoff) await fs.rm(dir, { recursive: true, force: true });
		} catch (error: unknown) {
			if (!isMissing(error)) throw error;
		}
	}
}
