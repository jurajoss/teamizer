import { Inject, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  applicationDefault,
  getApps,
  initializeApp,
  type App,
} from 'firebase-admin/app';
import { getAuth, type Auth } from 'firebase-admin/auth';

import type { VerifiedFirebaseIdentity } from './auth.types';

const FIREBASE_APP_NAME = 'teamizer-api';

export function getTeamizerFirebaseApp(projectId: string): App {
  const existingApp = getApps().find(({ name }) => name === FIREBASE_APP_NAME);
  return (
    existingApp ??
    initializeApp(
      { credential: applicationDefault(), projectId },
      FIREBASE_APP_NAME,
    )
  );
}

@Injectable()
export class FirebaseTokenVerifier {
  private readonly firebaseAuth: Auth;

  constructor(@Inject(ConfigService) configService: ConfigService) {
    const projectId = configService.getOrThrow<string>('FIREBASE_PROJECT_ID');
    this.firebaseAuth = getAuth(getTeamizerFirebaseApp(projectId));
  }

  async verify(token: string): Promise<VerifiedFirebaseIdentity> {
    const decodedToken = await this.firebaseAuth.verifyIdToken(token);

    return { authProviderId: decodedToken.uid };
  }
}
