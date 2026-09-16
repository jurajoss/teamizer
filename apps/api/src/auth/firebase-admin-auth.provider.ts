import type { Provider } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { getAuth, type Auth } from 'firebase-admin/auth';

import { getTeamizerFirebaseApp } from './firebase-app';

export const FIREBASE_ADMIN_AUTH = Symbol('FIREBASE_ADMIN_AUTH');

export const firebaseAdminAuthProvider: Provider = {
  provide: FIREBASE_ADMIN_AUTH,
  inject: [ConfigService],
  useFactory: (config: ConfigService): Auth => {
    const projectId = config.getOrThrow<string>('FIREBASE_PROJECT_ID');
    return getAuth(getTeamizerFirebaseApp(projectId));
  },
};
