import { fetch as expoFetch } from 'expo/fetch';
import { File } from 'expo-file-system';

import {
  AVATAR_UPLOAD_MEDIA_TYPE,
  type AvatarUpload,
  type AvatarUploadTransport,
} from './avatar-upload';
import {
  logAvatarTransportError,
  logAvatarUploadStage,
} from './avatar-upload-stage';

export function createAvatarUploadTransport(): AvatarUploadTransport {
  return {
    prepareBody: createNativeAvatarUploadBody,
    send: sendWithExpoFetch,
  };
}

function createNativeAvatarUploadBody(upload: AvatarUpload): FormData {
  if (upload.kind !== 'NATIVE_FILE') {
    throw new Error('Native avatar upload requires a local file URI.');
  }

  let file: File;
  try {
    file = new File(upload.uri);
    logAvatarUploadStage('file_created');
  } catch (error) {
    logAvatarTransportError('file_creation');
    throw error;
  }

  try {
    if (!file.exists || file.size <= 0) {
      throw new Error('The normalized Player photo is not readable.');
    }
    if (file.type !== AVATAR_UPLOAD_MEDIA_TYPE) {
      throw new Error('The normalized Player photo is not a JPEG file.');
    }
    logAvatarUploadStage('file_verified');
  } catch (error) {
    logAvatarTransportError('file_verification');
    throw error;
  }

  logAvatarUploadStage('formdata_started');
  const form = new FormData();
  form.append('file', file);
  logAvatarUploadStage('formdata_success');
  return form;
}

async function sendWithExpoFetch(
  input: string,
  init: RequestInit,
): Promise<Response> {
  try {
    return await expoFetch(input, init);
  } catch (error) {
    logAvatarTransportError('expo_fetch');
    throw error;
  }
}
