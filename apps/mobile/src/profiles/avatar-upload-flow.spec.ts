import { describe, expect, it, vi } from 'vitest';

import { ApiClientError } from '../api/authenticated-api-client';
import { nativeAvatarUpload } from '../api/avatar-upload';
import { i18n } from '../i18n/i18n';
import {
  avatarUploadFlowErrorMessage,
  runAvatarUploadFlow,
} from './avatar-upload-flow';

const preparedAvatar = nativeAvatarUpload('file:///cache/avatar.jpg');
const english = i18n.getFixedT('en');

describe('avatar upload flow', () => {
  it('passes a successfully prepared native file to the upload invocation', async () => {
    const upload = vi.fn().mockResolvedValue(undefined);

    const result = await runAvatarUploadFlow(
      'LIBRARY',
      vi.fn().mockResolvedValue(preparedAvatar),
      upload,
    );

    expect(result).toEqual({ status: 'UPLOADED' });
    expect(upload).toHaveBeenCalledOnce();
    expect(upload).toHaveBeenCalledWith(preparedAvatar);
    expect(avatarUploadFlowErrorMessage(result, english)).toBeNull();
  });

  it('does not upload after picker cancellation', async () => {
    const upload = vi.fn();

    const result = await runAvatarUploadFlow(
      'LIBRARY',
      vi.fn().mockResolvedValue(null),
      upload,
    );

    expect(result).toEqual({ status: 'CANCELLED' });
    expect(upload).not.toHaveBeenCalled();
    expect(avatarUploadFlowErrorMessage(result, english)).toBeNull();
  });

  it('presents one image-specific message for preparation failure', async () => {
    const preparationError = new Error('manipulation failed');
    const upload = vi.fn();

    const result = await runAvatarUploadFlow(
      'CAMERA',
      vi.fn().mockRejectedValue(preparationError),
      upload,
    );
    const messages = [avatarUploadFlowErrorMessage(result, english)].filter(
      (message): message is string => message !== null,
    );

    expect(result).toEqual({
      status: 'PREPARATION_FAILED',
      error: preparationError,
    });
    expect(upload).not.toHaveBeenCalled();
    expect(messages).toEqual(['The photo could not be used.']);
    expect(messages).not.toContain(
      'The Teamizer API could not be reached. Check the connection and try again.',
    );
  });

  it('presents one network message for a request-stage network failure', async () => {
    const networkError = new ApiClientError(
      0,
      'NETWORK_ERROR',
      'technical fetch text',
    );

    const result = await runAvatarUploadFlow(
      'LIBRARY',
      vi.fn().mockResolvedValue(preparedAvatar),
      vi.fn().mockRejectedValue(networkError),
    );
    const messages = [avatarUploadFlowErrorMessage(result, english)].filter(
      (message): message is string => message !== null,
    );

    expect(messages).toEqual([
      'The Teamizer API could not be reached. Check the connection and try again.',
    ]);
    expect(messages).not.toContain('The photo could not be used.');
  });

  it('presents one image-specific message for FormData preparation failure', async () => {
    const result = await runAvatarUploadFlow(
      'LIBRARY',
      vi.fn().mockResolvedValue(preparedAvatar),
      vi.fn().mockRejectedValue(new Error('FormData append failed')),
    );

    expect(avatarUploadFlowErrorMessage(result, english)).toBe(
      'The photo could not be used.',
    );
  });

  it.each([
    ['UNSUPPORTED_AVATAR_MEDIA_TYPE', 'This photo format is not supported.'],
    ['INVALID_AVATAR_IMAGE', 'The uploaded photo is not a valid image.'],
    ['AVATAR_TOO_LARGE', 'The photo is too large to upload.'],
    ['UNAUTHENTICATED', 'Your session is no longer available. Sign in again.'],
  ])('maps %s without adding a second message', async (code, message) => {
    const result = await runAvatarUploadFlow(
      'LIBRARY',
      vi.fn().mockResolvedValue(preparedAvatar),
      vi.fn().mockRejectedValue(new ApiClientError(400, code, 'server text')),
    );

    expect(avatarUploadFlowErrorMessage(result, english)).toBe(message);
  });
});
