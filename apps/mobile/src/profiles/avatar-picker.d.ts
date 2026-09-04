import type { AvatarUpload } from '../api/avatar-upload';

export type PreparedAvatar = AvatarUpload;

export declare function prepareAvatar(
  source: 'CAMERA' | 'LIBRARY',
): Promise<PreparedAvatar | null>;
