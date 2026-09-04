import { describe, expect, it, vi } from 'vitest';

import {
  appendAvatarUpload,
  nativeAvatarUpload,
  type WebAvatarUpload,
} from './avatar-upload';

describe('avatar multipart upload representation', () => {
  it('appends a React Native URI descriptor with JPEG name and MIME', () => {
    const append = vi.fn();
    const form = { append } as unknown as FormData;

    appendAvatarUpload(form, nativeAvatarUpload('file:///cache/avatar.jpg'));

    expect(append).toHaveBeenCalledWith('file', {
      uri: 'file:///cache/avatar.jpg',
      name: 'avatar.jpg',
      type: 'image/jpeg',
    });
  });

  it('retains standards-based Blob multipart behavior only for web', () => {
    const append = vi.fn();
    const form = { append } as unknown as FormData;
    const blob = new Blob(['jpeg'], { type: 'image/jpeg' });
    const upload: WebAvatarUpload = {
      kind: 'WEB_BLOB',
      blob,
      fileName: 'avatar.jpg',
      mimeType: 'image/jpeg',
    };

    appendAvatarUpload(form, upload);

    expect(append).toHaveBeenCalledWith('file', blob, 'avatar.jpg');
  });
});
