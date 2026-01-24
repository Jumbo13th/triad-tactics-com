import { withApiGuards } from '@/platform/apiGates';
import { postRunOutboxRoute } from '@/features/admin/adapters/next/outboxRunRoute';

export const runtime = 'nodejs';

export const POST = withApiGuards(postRunOutboxRoute, { name: 'api.admin.outbox.run', logSteamId: true });
