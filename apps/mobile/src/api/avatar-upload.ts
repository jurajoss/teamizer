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

type ReactNativeMultipartFile = {
  uri: string;
  name: string;
  type: string;
};

type NativeFileAppender = (
  fieldName: string,
  file: ReactNativeMultipartFile,
) => void;

export function appendAvatarUpload(form: FormData, upload: AvatarUpload): void {
  if (upload.kind === 'WEB_BLOB') {
    form.append('file', upload.blob, upload.fileName);
    return;
  }

  // React Native 0.86 FormData supports this native file descriptor directly.
  // Its DOM-compatible TypeScript overload does not expose that runtime shape.
  const appendNativeFile = form.append.bind(
    form,
  ) as unknown as NativeFileAppender;
  appendNativeFile('file', {
    uri: upload.uri,
    name: upload.fileName,
    type: upload.mimeType,
  });
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
