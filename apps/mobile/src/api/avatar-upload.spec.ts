import { describe, expect, it } from 'vitest';

import {
  createWebAvatarUploadBody,
  nativeAvatarUpload,
  type WebAvatarUpload,
} from './avatar-upload';

describe('avatar multipart upload representation', () => {
  it('retains standards-based Blob multipart behavior only for web', () => {
    const blob = new Blob(['jpeg'], { type: 'image/jpeg' });
    const upload: WebAvatarUpload = {
      kind: 'WEB_BLOB',
      blob,
      fileName: 'avatar.jpg',
      mimeType: 'image/jpeg',
    };

    const form = createWebAvatarUploadBody(upload);

    expect(form.get('file')).toBeInstanceOf(File);
    expect((form.get('file') as File).type).toBe('image/jpeg');
  });

  it('does not let the web transport fall back to a native URI descriptor', () => {
    expect(() =>
      createWebAvatarUploadBody(nativeAvatarUpload('file:///cache/avatar.jpg')),
    ).toThrow('requires a browser Blob');
  });
});
