import { describe, expect, it } from 'vitest';

import {
  CLIENT_AVATAR_MAX_UPLOAD_BYTES,
  validatePreparedAvatar,
} from './avatar-policy';

describe('mobile avatar preparation policy', () => {
  it('accepts only a compressed JPEG within the upload limit', () => {
    expect(() =>
      validatePreparedAvatar({ size: 500_000, type: 'image/jpeg' }),
    ).not.toThrow();
    expect(() =>
      validatePreparedAvatar({ size: 500_000, type: 'image/png' }),
    ).toThrow('not a JPEG');
    expect(() =>
      validatePreparedAvatar({
        size: CLIENT_AVATAR_MAX_UPLOAD_BYTES + 1,
        type: 'image/jpeg',
      }),
    ).toThrow('larger than 5 MB');
  });
});
