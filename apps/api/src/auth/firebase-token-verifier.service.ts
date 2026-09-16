import { Inject, Injectable } from '@nestjs/common';
import type { Auth } from 'firebase-admin/auth';

import type { VerifiedFirebaseIdentity } from './auth.types';
import { FIREBASE_ADMIN_AUTH } from './firebase-admin-auth.provider';

@Injectable()
export class FirebaseTokenVerifier {
  private readonly firebaseAuth: Auth;

  constructor(@Inject(FIREBASE_ADMIN_AUTH) firebaseAuth: Auth) {
    this.firebaseAuth = firebaseAuth;
  }

  async verify(token: string): Promise<VerifiedFirebaseIdentity> {
    const decodedToken = await this.firebaseAuth.verifyIdToken(token);

    return {
      authProviderId: decodedToken.uid,
      ...(decodedToken.email ? { email: decodedToken.email } : {}),
    };
  }
}
