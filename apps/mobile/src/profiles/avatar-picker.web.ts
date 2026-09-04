import * as ImageManipulator from 'expo-image-manipulator';
import * as ImagePicker from 'expo-image-picker';

import {
  AVATAR_UPLOAD_FILE_NAME,
  AVATAR_UPLOAD_MEDIA_TYPE,
  type WebAvatarUpload,
} from '../api/avatar-upload';
import { validatePreparedAvatar } from './avatar-policy';

const CLIENT_AVATAR_LONG_EDGE = 1_280;

export type PreparedAvatar = WebAvatarUpload;

export async function prepareAvatar(
  source: 'CAMERA' | 'LIBRARY',
): Promise<PreparedAvatar | null> {
  const result = await (source === 'CAMERA'
    ? ImagePicker.launchCameraAsync(pickerOptions)
    : ImagePicker.launchImageLibraryAsync(pickerOptions));
  if (result.canceled) return null;
  const asset = result.assets[0];
  if (!asset) throw new Error('The selected photo could not be read.');
  const largestEdge = Math.max(asset.width, asset.height);
  const actions: ImageManipulator.Action[] =
    largestEdge > CLIENT_AVATAR_LONG_EDGE
      ? [
          asset.width >= asset.height
            ? { resize: { width: CLIENT_AVATAR_LONG_EDGE } }
            : { resize: { height: CLIENT_AVATAR_LONG_EDGE } },
        ]
      : [];
  const processed = await ImageManipulator.manipulateAsync(asset.uri, actions, {
    compress: 0.82,
    format: ImageManipulator.SaveFormat.JPEG,
  });
  const response = await fetch(processed.uri);
  if (!response.ok) {
    throw new Error('The selected photo could not be prepared.');
  }
  const sourceBlob = await response.blob();
  const blob =
    sourceBlob.type === AVATAR_UPLOAD_MEDIA_TYPE
      ? sourceBlob
      : new Blob([sourceBlob], { type: AVATAR_UPLOAD_MEDIA_TYPE });
  validatePreparedAvatar(blob);
  return {
    kind: 'WEB_BLOB',
    blob,
    fileName: AVATAR_UPLOAD_FILE_NAME,
    mimeType: AVATAR_UPLOAD_MEDIA_TYPE,
  };
}

const pickerOptions: ImagePicker.ImagePickerOptions = {
  allowsEditing: false,
  exif: false,
  mediaTypes: ['images'],
  quality: 1,
  selectionLimit: 1,
};
