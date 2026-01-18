import { postRenameRequiredRoute } from '@/features/admin/adapters/next/renameRequiredRoute';
import { withApiGuards } from '@/platform/apiGates';

export const runtime = 'nodejs';

export const POST = withApiGuards(postRenameRequiredRoute, { name: 'api.admin.renameRequired' });
