import { postAdminUploadAvatarRoute, deleteAdminAvatarRoute } from '@/features/units/adapters/next/adminUnitRoutes';
import { withApiGuards } from '@/platform/apiGates';

export const runtime = 'nodejs';

export const POST = withApiGuards(postAdminUploadAvatarRoute, { name: 'api.admin.units.avatar.upload', logSteamId: true });
export const DELETE = withApiGuards(deleteAdminAvatarRoute, { name: 'api.admin.units.avatar.delete', logSteamId: true });
