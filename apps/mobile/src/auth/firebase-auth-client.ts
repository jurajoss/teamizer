import { getApp, getApps, initializeApp } from 'firebase/app';
import { getAuth } from 'firebase/auth';

import type { MobileEnvironment } from '../config/environment';
import type { FirebaseAuthClient } from './auth-client';
import { createFirebaseAuthAdapter } from './firebase-auth-adapter';

export function createFirebaseAuthClient(
  configuration: MobileEnvironment['firebase'],
): FirebaseAuthClient {
  const firebaseApp =
    getApps().length > 0 ? getApp() : initializeApp(configuration);

  return createFirebaseAuthAdapter(getAuth(firebaseApp));
}
