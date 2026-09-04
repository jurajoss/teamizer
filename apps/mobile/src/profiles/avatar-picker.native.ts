import * as ImageManipulator from 'expo-image-manipulator';
import * as ImagePicker from 'expo-image-picker';

import {
  nativeAvatarUpload,
  type NativeAvatarUpload,
} from '../api/avatar-upload';

const CLIENT_AVATAR_LONG_EDGE = 1_280;

export type PreparedAvatar = NativeAvatarUpload;

export async function prepareAvatar(
  source: 'CAMERA' | 'LIBRARY',
): Promise<PreparedAvatar | null> {
  if (source === 'CAMERA') {
    const permission = await ImagePicker.requestCameraPermissionsAsync();
    if (!permission.granted) {
      throw new Error('Camera permission is required to take a Player photo.');
    }
  } else {
    const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permission.granted) {
      throw new Error(
        'Photo library permission is required to choose a Player photo.',
      );
    }
  }

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
  return nativeAvatarUpload(processed.uri);
}

const pickerOptions: ImagePicker.ImagePickerOptions = {
  allowsEditing: false,
  exif: false,
  mediaTypes: ['images'],
  quality: 1,
  selectionLimit: 1,
};
