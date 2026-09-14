import {
  createWebAvatarUploadBody,
  type AvatarUploadTransport,
} from './avatar-upload';
import { logAvatarUploadStage } from './avatar-upload-stage';

export function createAvatarUploadTransport(): AvatarUploadTransport {
  return {
    prepareBody(upload) {
      logAvatarUploadStage('formdata_started');
      const form = createWebAvatarUploadBody(upload);
      logAvatarUploadStage('formdata_success');
      return form;
    },
    send: (input, init) => fetch(input, init),
  };
}
