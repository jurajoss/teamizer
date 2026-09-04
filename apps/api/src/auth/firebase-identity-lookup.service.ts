import { Inject, Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { getAuth, type Auth } from 'firebase-admin/auth';

import { getTeamizerFirebaseApp } from './firebase-token-verifier.service';

@Injectable()
export class FirebaseIdentityLookup {
  private readonly logger = new Logger(FirebaseIdentityLookup.name);
  private readonly firebaseAuth: Auth;
  private readonly projectId: string;

  constructor(@Inject(ConfigService) configService: ConfigService) {
    this.projectId = configService.getOrThrow<string>('FIREBASE_PROJECT_ID');
    this.firebaseAuth = getAuth(getTeamizerFirebaseApp(this.projectId));
  }

  async exists(authProviderId: string): Promise<boolean> {
    try {
      await this.firebaseAuth.getUser(authProviderId);
      return true;
    } catch (error) {
      if (this.isUserNotFound(error)) {
        return false;
      }
      const code = firebaseAdminErrorCode(error);
      this.logger.error(
        `Firebase Admin identity lookup failed for configured project "${this.projectId}" (${firebaseAdminFailureCategory(code)}; provider code: ${code ?? 'unavailable'}). Verify FIREBASE_PROJECT_ID, Application Default Credentials, and firebaseauth.users.get permission.`,
      );
      throw error;
    }
  }

  private isUserNotFound(error: unknown): boolean {
    if (!error || typeof error !== 'object') {
      return false;
    }

    const firebaseError = error as {
      code?: unknown;
      errorInfo?: { code?: unknown };
    };
    return (
      firebaseError.code === 'auth/user-not-found' ||
      firebaseError.errorInfo?.code === 'auth/user-not-found'
    );
  }
}

export function firebaseAdminErrorCode(error: unknown): string | null {
  if (!error || typeof error !== 'object') return null;
  const firebaseError = error as {
    code?: unknown;
    errorInfo?: { code?: unknown };
  };
  const code = firebaseError.code ?? firebaseError.errorInfo?.code;
  return typeof code === 'string' ? code : null;
}

export function firebaseAdminFailureCategory(
  code: string | null,
):
  | 'INVALID_CREDENTIAL'
  | 'INSUFFICIENT_PERMISSION'
  | 'PROJECT_CONFIGURATION'
  | 'UNKNOWN' {
  if (code === 'app/invalid-credential' || code === 'auth/invalid-credential') {
    return 'INVALID_CREDENTIAL';
  }
  if (code === 'auth/insufficient-permission') {
    return 'INSUFFICIENT_PERMISSION';
  }
  if (code === 'auth/project-not-found' || code === 'app/invalid-app-options') {
    return 'PROJECT_CONFIGURATION';
  }
  return 'UNKNOWN';
}
