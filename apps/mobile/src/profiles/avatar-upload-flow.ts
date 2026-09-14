import type { TFunction } from 'i18next';

import type { PreparedAvatar } from './avatar-picker';
import { localizedErrorMessage } from '../i18n/localized-error';

export type AvatarUploadFlowResult =
  | { status: 'CANCELLED' }
  | { status: 'UPLOADED' }
  | { status: 'PREPARATION_FAILED'; error: unknown }
  | { status: 'UPLOAD_FAILED'; error: unknown };

export async function runAvatarUploadFlow(
  source: 'CAMERA' | 'LIBRARY',
  prepare: (source: 'CAMERA' | 'LIBRARY') => Promise<PreparedAvatar | null>,
  upload: (file: PreparedAvatar) => Promise<void>,
): Promise<AvatarUploadFlowResult> {
  let file: PreparedAvatar | null;

  try {
    file = await prepare(source);
  } catch (error) {
    return { status: 'PREPARATION_FAILED', error };
  }

  if (!file) return { status: 'CANCELLED' };

  try {
    await upload(file);
    return { status: 'UPLOADED' };
  } catch (error) {
    return { status: 'UPLOAD_FAILED', error };
  }
}

export function avatarUploadFlowErrorMessage(
  result: AvatarUploadFlowResult,
  t: TFunction,
): string | null {
  if (result.status === 'PREPARATION_FAILED') {
    return t('profile.photoFailed');
  }
  if (result.status === 'UPLOAD_FAILED') {
    return localizedErrorMessage(result.error, t, 'profile.photoFailed');
  }
  return null;
}
