import AsyncStorage from '@react-native-async-storage/async-storage';
import { getApp, getApps, initializeApp } from 'firebase/app';
import * as FirebaseAuth from 'firebase/auth';
import type { Persistence } from 'firebase/auth';

import type { MobileEnvironment } from '../config/environment';
import type { FirebaseAuthClient } from './auth-client';
import { createFirebaseAuthAdapter } from './firebase-auth-adapter';

export function createFirebaseAuthClient(
  configuration: MobileEnvironment['firebase'],
): FirebaseAuthClient {
  const existingApp = getApps().length > 0;
  const firebaseApp = existingApp ? getApp() : initializeApp(configuration);
  const auth = existingApp
    ? FirebaseAuth.getAuth(firebaseApp)
    : FirebaseAuth.initializeAuth(firebaseApp, {
        persistence: getReactNativePersistence(),
      });

  return createFirebaseAuthAdapter(auth);
}

function getReactNativePersistence(): Persistence {
  // Metro resolves Firebase Auth's React Native entry, but the firebase wrapper's
  // declaration file exposes only the web entry. Keep that packaging mismatch
  // isolated here while using the supported React Native persistence API.
  const reactNativeAuth = FirebaseAuth as typeof FirebaseAuth & {
    getReactNativePersistence(storage: typeof AsyncStorage): Persistence;
  };

  return reactNativeAuth.getReactNativePersistence(AsyncStorage);
}
