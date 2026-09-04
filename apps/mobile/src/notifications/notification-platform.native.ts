import * as Device from 'expo-device';
import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';

import {
  matchIdFromNotificationData,
  type NotificationPlatform,
} from './notification-platform';

export function createNotificationPlatform(): NotificationPlatform {
  return {
    async acquireToken({ easProjectId, mayRequestPermission }) {
      if (!Device.isDevice || !easProjectId) {
        return { token: null, permissionPromptShown: false };
      }
      let permission = await Notifications.getPermissionsAsync();
      let permissionPromptShown = false;
      if (
        permission.status === Notifications.PermissionStatus.UNDETERMINED &&
        permission.canAskAgain &&
        mayRequestPermission
      ) {
        permissionPromptShown = true;
        permission = await Notifications.requestPermissionsAsync();
      }
      if (permission.status !== Notifications.PermissionStatus.GRANTED) {
        return { token: null, permissionPromptShown };
      }
      if (Platform.OS === 'android') {
        await Notifications.setNotificationChannelAsync('match-reminders', {
          name: 'Match reminders',
          importance: Notifications.AndroidImportance.DEFAULT,
        });
      }
      const token = await Notifications.getExpoPushTokenAsync({
        projectId: easProjectId,
      });
      if (Platform.OS !== 'ios' && Platform.OS !== 'android') {
        return { token: null, permissionPromptShown };
      }
      return {
        token: {
          provider: 'EXPO',
          platform: Platform.OS === 'ios' ? 'IOS' : 'ANDROID',
          pushToken: token.data,
        },
        permissionPromptShown,
      };
    },

    subscribeToMatchResponses(onMatch) {
      const handle = (response: Notifications.NotificationResponse) => {
        const matchId = matchIdFromNotificationData(
          response.notification.request.content.data,
        );
        if (matchId) onMatch(matchId);
      };
      const subscription =
        Notifications.addNotificationResponseReceivedListener(handle);
      void Notifications.getLastNotificationResponseAsync()
        .then((response) => {
          if (!response) return;
          handle(response);
          return Notifications.clearLastNotificationResponseAsync();
        })
        .catch(() => undefined);
      return () => subscription.remove();
    },
  };
}
