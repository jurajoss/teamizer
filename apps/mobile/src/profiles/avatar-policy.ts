export const CLIENT_AVATAR_MAX_UPLOAD_BYTES = 5_000_000;

export function validatePreparedAvatar(file: {
  size: number;
  type: string;
}): void {
  if (file.type !== 'image/jpeg') {
    throw new Error('The prepared Player photo is not a JPEG image.');
  }
  if (file.size > CLIENT_AVATAR_MAX_UPLOAD_BYTES) {
    throw new Error('The prepared Player photo is larger than 5 MB.');
  }
}
