export type AvatarUploadStage =
  | 'picker_started'
  | 'picker_success'
  | 'manipulation_started'
  | 'manipulation_success'
  | 'file_created'
  | 'file_verified'
  | 'formdata_started'
  | 'formdata_success'
  | 'request_started'
  | 'response_received';

export function logAvatarUploadStage(stage: AvatarUploadStage): void {
  console.info(`AVATAR_STAGE=${stage}`);
}

export type AvatarTransportErrorCategory =
  'file_creation' | 'file_verification' | 'expo_fetch';

export function logAvatarTransportError(
  category: AvatarTransportErrorCategory,
): void {
  console.warn(`AVATAR_TRANSPORT_ERROR=${category}`);
}
