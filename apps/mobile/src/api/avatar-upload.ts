export const AVATAR_UPLOAD_FILE_NAME = 'avatar.jpg' as const;
export const AVATAR_UPLOAD_MEDIA_TYPE = 'image/jpeg' as const;

export type NativeAvatarUpload = {
  kind: 'NATIVE_FILE';
  uri: string;
  fileName: typeof AVATAR_UPLOAD_FILE_NAME;
  mimeType: typeof AVATAR_UPLOAD_MEDIA_TYPE;
};

export type WebAvatarUpload = {
  kind: 'WEB_BLOB';
  blob: Blob;
  fileName: typeof AVATAR_UPLOAD_FILE_NAME;
  mimeType: typeof AVATAR_UPLOAD_MEDIA_TYPE;
};

export type AvatarUpload = NativeAvatarUpload | WebAvatarUpload;

export type AvatarUploadTransport = {
  prepareBody(upload: AvatarUpload): BodyInit;
  send(input: string, init: RequestInit): Promise<Response>;
};

export function createWebAvatarUploadBody(upload: AvatarUpload): FormData {
  if (upload.kind !== 'WEB_BLOB') {
    throw new Error('Web avatar upload requires a browser Blob.');
  }

  const form = new FormData();
  form.append('file', upload.blob, upload.fileName);
  return form;
}

export function nativeAvatarUpload(uri: string): NativeAvatarUpload {
  if (!uri.trim()) {
    throw new Error('The prepared Player photo does not have a file URI.');
  }
  return {
    kind: 'NATIVE_FILE',
    uri,
    fileName: AVATAR_UPLOAD_FILE_NAME,
    mimeType: AVATAR_UPLOAD_MEDIA_TYPE,
  };
}
