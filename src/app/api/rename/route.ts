import { postRenameRequestRoute } from '@/features/rename/adapters/next/submitRenameRequestRoute';
import { withApiGuards } from '@/platform/apiGates';

export const runtime = 'nodejs';

export const POST = withApiGuards(postRenameRequestRoute, { name: 'api.rename.create', logSteamId: true });
