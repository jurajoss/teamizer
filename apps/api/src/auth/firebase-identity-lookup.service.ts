import { Inject, Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Auth } from 'firebase-admin/auth';

import { FIREBASE_ADMIN_AUTH } from './firebase-admin-auth.provider';

export type FirebaseIdentityRecord = {
  authProviderId: string;
};

@Injectable()
export class FirebaseIdentityLookup {
  private readonly logger = new Logger(FirebaseIdentityLookup.name);
  private readonly firebaseAuth: Auth;
  private readonly projectId: string;

  constructor(
    @Inject(ConfigService) configService: ConfigService,
    @Inject(FIREBASE_ADMIN_AUTH) firebaseAuth: Auth,
  ) {
    this.projectId = configService.getOrThrow<string>('FIREBASE_PROJECT_ID');
    this.firebaseAuth = firebaseAuth;
  }

  async exists(authProviderId: string): Promise<boolean> {
    try {
      await this.firebaseAuth.getUser(authProviderId);
      return true;
    } catch (error) {
      if (this.isUserNotFound(error)) {
        return false;
      }
      this.logProviderFailure('getUser', error);
      throw error;
    }
  }

  async findByEmail(email: string): Promise<FirebaseIdentityRecord | null> {
    try {
      const user = await this.firebaseAuth.getUserByEmail(email);
      return { authProviderId: user.uid };
    } catch (error) {
      if (this.isUserNotFound(error)) {
        return null;
      }
      this.logProviderFailure('getUserByEmail', error);
      throw error;
    }
  }

  async createEmailPasswordIdentity(
    email: string,
    displayName: string,
  ): Promise<FirebaseIdentityRecord> {
    try {
      const user = await this.firebaseAuth.createUser({
        email,
        emailVerified: false,
        displayName,
        disabled: false,
      });
      return { authProviderId: user.uid };
    } catch (error) {
      if (firebaseAdminErrorCode(error) !== 'auth/email-already-exists') {
        this.logProviderFailure('createUser', error);
      }
      throw error;
    }
  }

  async generatePasswordSetupLink(email: string): Promise<string> {
    try {
      return await this.firebaseAuth.generatePasswordResetLink(email);
    } catch (error) {
      this.logProviderFailure('generatePasswordResetLink', error);
      throw error;
    }
  }

  private logProviderFailure(operation: string, error: unknown): void {
    const code = firebaseAdminErrorCode(error);
    const reason = firebaseAdminErrorReason(error);
    this.logger.error(
      `Firebase Admin ${operation} failed for configured project "${this.projectId}" (${firebaseAdminFailureCategory(code, reason)}; provider code: ${code ?? 'unavailable'}; provider reason: ${reason ?? 'unavailable'}). Verify FIREBASE_PROJECT_ID, Application Default Credentials, serviceusage.services.use, and the operation's Firebase Authentication permission.`,
    );
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

export function firebaseAdminErrorReason(error: unknown): string | null {
  if (!error || typeof error !== 'object') return null;
  const responseData = (error as { httpResponse?: { data?: unknown } })
    .httpResponse?.data;
  if (!responseData || typeof responseData !== 'object') return null;
  const providerError = (responseData as { error?: unknown }).error;
  if (!providerError || typeof providerError !== 'object') return null;
  const details = (providerError as { details?: unknown }).details;
  if (!Array.isArray(details)) return null;

  for (const detail of details) {
    if (!detail || typeof detail !== 'object') continue;
    const reason = (detail as { reason?: unknown }).reason;
    if (typeof reason === 'string' && /^[A-Z0-9_]{1,64}$/.test(reason)) {
      return reason;
    }
  }
  return null;
}

export function firebaseAdminFailureCategory(
  code: string | null,
  reason: string | null = null,
):
  | 'INVALID_CREDENTIAL'
  | 'INSUFFICIENT_PERMISSION'
  | 'SERVICE_USAGE_PERMISSION'
  | 'PROJECT_CONFIGURATION'
  | 'UNKNOWN' {
  if (reason === 'USER_PROJECT_DENIED') {
    return 'SERVICE_USAGE_PERMISSION';
  }
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
