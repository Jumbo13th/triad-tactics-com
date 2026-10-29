import { getDb } from '@/platform/db';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// Deploy gate: kamal-proxy polls this every few seconds during a switch, so it stays
// outside withApiGuards (route logging would flood) and must touch the database.
export function GET() {
	getDb().prepare('SELECT 1').get();
	return new Response('ok', { headers: { 'cache-control': 'no-store' } });
}
