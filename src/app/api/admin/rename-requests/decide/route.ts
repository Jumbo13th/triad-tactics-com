import { postDecideRenameRequestRoute } from '@/features/admin/adapters/next/decideRenameRequestRoute';
import { withApiGuards } from '@/platform/apiGates';

export const runtime = 'nodejs';

export const POST = withApiGuards(postDecideRenameRequestRoute, { name: 'api.admin.decideRenameRequest' });
