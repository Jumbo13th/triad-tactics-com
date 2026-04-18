import { getAvatarRoute, postUploadAvatarRoute, deleteAvatarRoute } from '@/features/units/adapters/next/avatarRoute';
import { withApiGuards } from '@/platform/apiGates';

export const runtime = 'nodejs';

export const GET = withApiGuards(getAvatarRoute, { name: 'api.units.avatar.get', logSteamId: false });
export const POST = withApiGuards(postUploadAvatarRoute, { name: 'api.units.avatar.upload', logSteamId: true });
export const DELETE = withApiGuards(deleteAvatarRoute, { name: 'api.units.avatar.delete', logSteamId: true });
