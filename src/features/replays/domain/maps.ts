export type MapFileKind = 'relief' | 'topo';

// The relief is kept as the WebP the admin page produced; the geometry as gzip, like the
// replay files, so both are served without re-encoding.
export function mapStorageKey(kind: MapFileKind, sha256: string): string {
	return kind === 'relief' ? `map/${sha256}.webp` : `map/${sha256}.topo.gz`;
}
